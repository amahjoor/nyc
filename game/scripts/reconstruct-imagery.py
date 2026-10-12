#!/usr/bin/env python3
"""Run source-anchored SAM segmentation of official NYC aerial photographs.

The model proposes masks, never object identities or heights. Mapped feature
types supply those identities; overlap tests can reject a proposal, and accepted
water is clipped to the surveyed footprint before the renderer may consume it.
Install requirements-reconstruction-ai.txt in an isolated Python 3.13 environment, then run:
  python scripts/reconstruct-imagery.py --reference dist/reconstruction/reference.geojson
Use --model-directory to reuse a local download of the pinned model revision.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import time


ROOT = Path(__file__).resolve().parents[1]
MODEL = "facebook/sam-vit-base"
REVISION = "70c1a07f894ebb5b307fd9eaaee97b9dfc16068f"
WEIGHTS_SHA256 = "892c410e496344e527255ccdcb2cb7244a609acb5389c7c4fdba1288f861c579"
DEFAULT_BBOX = [-73.9763, 40.7648, -73.9731, 40.7679]
SPEC = importlib.util.spec_from_file_location("reconstruction_ortho", ROOT / "scripts/import-ortho.py")
ortho = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ortho)


def pixel_to_lonlat(x, y, grid):
    return ortho.tile_corner(grid["minColumn"] + x / 256,
                             grid["minRow"] + y / 256, grid["zoom"])


def lonlat_to_pixel(lon, lat, grid):
    column, row = ortho.tile_fraction(lon, lat, grid["zoom"])
    return (column - grid["minColumn"]) * 256, (row - grid["minRow"]) * 256


def agreement(intersection, proposed, reference):
    """Source agreement is measurable overlap, not a model confidence score."""
    union = proposed + reference - intersection
    return {"iou": intersection / union if union else 0,
            "precision": intersection / proposed if proposed else 0,
            "recall": intersection / reference if reference else 0}


def approve(metrics, predicted_iou, pixel_count, kind):
    # SAM's predicted IoU is its estimate of mask quality, not the probability
    # that an aerial patch is water/tree. Type must come from a mapped source.
    if kind not in ("water", "canopy"):
        return False, "Unsupported source class"
    if not all(math.isfinite(float(value)) and 0 <= float(value) <= 1
               for value in [predicted_iou, *metrics.values()]):
        return False, "Invalid mask score"
    if pixel_count < 64:
        return False, "Insufficient image support"
    if predicted_iou < 0.75:
        return False, "Low model mask-quality estimate"
    if metrics["iou"] < 0.65 or metrics["precision"] < 0.85 or metrics["recall"] < 0.70:
        return False, "Insufficient agreement with mapped source"
    return True, "Passed model-quality and mapped-source overlap thresholds"


def acquire_image(bbox, zoom, output):
    from PIL import Image
    tiles = ortho.coverage(zoom, margin=0, bbox=bbox)
    if len(tiles) > 81:
        raise ValueError("Pilot exceeds 81 image tiles; split the area into smaller runs")
    tile_dir = output / "tiles"
    tile_dir.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        tiles = list(pool.map(lambda tile: ortho.acquire(tile, tile_dir), tiles))
    grid = {"minColumn": min(t["column"] for t in tiles),
            "minRow": min(t["row"] for t in tiles), "zoom": zoom,
            "columns": len(set(t["column"] for t in tiles)),
            "rows": len(set(t["row"] for t in tiles)), "tileSize": 256}
    image = Image.new("RGB", (grid["columns"] * 256, grid["rows"] * 256))
    for tile in tiles:
        path = tile_dir / Path(tile["url"]).name
        with Image.open(path) as part:
            if part.size != (256, 256):
                raise ValueError("Unexpected source tile dimensions")
            image.paste(part, ((tile["column"] - grid["minColumn"]) * 256,
                              (tile["row"] - grid["minRow"]) * 256))
        tile["url"] = "./reconstruction/tiles/" + path.name
    image.save(output / "aerial.png")
    return image, grid, tiles


def polygons_to_mask(geometry, size, grid):
    import numpy as np
    from PIL import Image, ImageDraw
    mask = Image.new("L", size)
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    if geometry["type"] not in ("Polygon", "MultiPolygon"):
        raise ValueError("Reference must contain polygon geometries")
    # Draw each polygon independently so a later polygon's hole cannot erase
    # another island. Holes stay empty, including islands inside water bodies.
    for polygon in polygons:
        part = Image.new("L", size)
        draw = ImageDraw.Draw(part)
        for index, ring in enumerate(polygon):
            draw.polygon([lonlat_to_pixel(*point[:2], grid) for point in ring], fill=255 if index == 0 else 0)
        mask = Image.fromarray(np.maximum(np.asarray(mask), np.asarray(part)))
    return np.asarray(mask) > 0


def mask_geometry(mask, grid, reference_geometry, local=False):
    import numpy as np
    from rasterio.features import shapes
    from shapely import transform, union_all
    from shapely.geometry import shape, mapping
    pieces = [shape(geometry) for geometry, value in shapes(mask.astype("uint8"), mask=mask) if value]
    if not pieces:
        return None
    # One source pixel tolerance limits output size without changing measured
    # support by multiple meters. Simplification preserves islands and holes.
    geometry = union_all(pieces).simplify(1.0, preserve_topology=True)
    geometry = transform(geometry, lambda points: np.asarray([
        pixel_to_lonlat(x, y, grid) for x, y in points])).intersection(shape(reference_geometry))
    # A raster pixel crossing a shoreline can extend outside the exact source
    # polygon. Clip again in vector space after simplification to prevent that.
    if local:
        geometry = transform(geometry, lambda points: np.asarray([
            ortho.project(lon, lat) for lon, lat in points]))
    return mapping(geometry)


def prompts_for_mask(mask):
    import numpy as np
    from scipy.ndimage import distance_transform_edt
    ys, xs = np.where(mask)
    if not len(xs):
        return None
    distance = distance_transform_edt(mask)
    y, x = np.unravel_index(distance.argmax(), distance.shape)
    bounds = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    points, labels = [[int(x), int(y)]], [1]
    background = np.zeros_like(mask)
    background[bounds[1]:bounds[3] + 1, bounds[0]:bounds[2] + 1] = True
    background &= ~mask
    outside_distance = distance_transform_edt(background)
    if outside_distance.max() >= 4:
        # Concave water bodies often surround dry land. A negative prompt on
        # that mapped land prevents SAM from merging pond and peninsula.
        ny, nx = np.unravel_index(outside_distance.argmax(), outside_distance.shape)
        points.append([int(nx), int(ny)])
        labels.append(0)
    return {"point": points[0], "points": points, "labels": labels, "box": bounds}


def run(reference_path, output_path, bbox, zoom=19, model_directory=None, device="auto"):
    import numpy as np
    import torch
    import transformers
    from PIL import Image
    from transformers import SamModel, SamProcessor
    started = time.monotonic()
    output = output_path.parent / "reconstruction"
    output.mkdir(parents=True, exist_ok=True)
    reference_bytes = reference_path.read_bytes()
    references = json.loads(reference_bytes)
    image, grid, tiles = acquire_image(bbox, zoom, output)
    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    model_source = str(model_directory) if model_directory else MODEL
    if model_directory:
        with (model_directory / "model.safetensors").open("rb") as weights:
            actual_hash = hashlib.file_digest(weights, "sha256").hexdigest()
        if actual_hash != WEIGHTS_SHA256:
            raise ValueError("Local weights do not match the pinned SAM revision")
    options = {} if model_directory else {"revision": REVISION}
    processor = SamProcessor.from_pretrained(model_source, **options)
    model = SamModel.from_pretrained(model_source, use_safetensors=True, **options).to(device).eval()
    # Encode once: prompt decoding is cheap; recomputing the image encoder for
    # every surveyed polygon would turn this offline stage into minutes per tree.
    image_inputs = processor(image, return_tensors="pt").to(device)
    with torch.inference_mode():
        embedding = model.get_image_embeddings(image_inputs["pixel_values"])
    records = []
    overlay = image.convert("RGBA")
    for index, feature in enumerate(references["features"]):
        properties = feature.get("properties", {})
        kind = properties.get("kind")
        reference = polygons_to_mask(feature["geometry"], image.size, grid)
        prompts = prompts_for_mask(reference)
        if not prompts:
            continue
        inputs = processor(image, input_points=[prompts["points"]], input_labels=[prompts["labels"]],
                           input_boxes=[[prompts["box"]]], return_tensors="pt").to(device, dtype=torch.float32)
        inputs.pop("pixel_values")
        with torch.inference_mode():
            prediction = model(image_embeddings=embedding, **inputs)
        masks = processor.image_processor.post_process_masks(prediction.pred_masks.cpu(),
                    inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu())[0][0].numpy()
        scores = prediction.iou_scores[0, 0].cpu().numpy()
        # Select by the model's own score, before examining source agreement.
        # Choosing the source's best match would overstate independent agreement.
        chosen = int(np.argmax(scores))
        proposed = masks[chosen].astype(bool)
        intersection = proposed & reference
        metrics = agreement(int(intersection.sum()), int(proposed.sum()), int(reference.sum()))
        accepted, reason = approve(metrics, float(scores[chosen]), int(proposed.sum()), kind)
        key = f"{index:03d}-{kind or 'unknown'}"
        Image.fromarray(proposed.astype("uint8") * 255).save(output / f"{key}-candidate.png")
        Image.fromarray(reference.astype("uint8") * 255).save(output / f"{key}-reference.png")
        # Accepted pixels cannot expand the authoritative footprint. In areas of
        # disagreement the official source remains the geometry/collision base.
        approved = intersection if accepted else np.zeros_like(reference)
        Image.fromarray(approved.astype("uint8") * 255).save(output / f"{key}-approved.png")
        color = np.zeros((image.height, image.width, 4), dtype="uint8")
        color[proposed] = [37, 195, 231, 90] if accepted else [240, 75, 55, 90]
        overlay = Image.alpha_composite(overlay, Image.fromarray(color))
        record = {"id": key, "kind": kind, "sourceId": properties.get("sourceId"),
                  "sourceUrl": properties.get("sourceUrl"), "sourceYear": properties.get("sourceYear"),
                  "prompt": prompts, "predictedIou": float(scores[chosen]),
                  "sourceAgreement": metrics, "candidatePixels": int(proposed.sum()),
                  "referencePixels": int(reference.sum()), "approvedPixels": int(approved.sum()),
                  "accepted": accepted, "reason": reason,
                  "candidateMask": f"./reconstruction/{key}-candidate.png",
                  "referenceMask": f"./reconstruction/{key}-reference.png",
                  "approvedMask": f"./reconstruction/{key}-approved.png",
                  "geometry": mask_geometry(approved, grid, feature["geometry"]) if accepted else None,
                  "localGeometry": mask_geometry(approved, grid, feature["geometry"], local=True) if accepted else None}
        records.append(record)
        print(json.dumps({"feature": key, "accepted": accepted, "predictedIou": record["predictedIou"], **metrics}), flush=True)
    overlay.convert("RGB").save(output / "review-overlay.jpg", quality=92)
    west, north = pixel_to_lonlat(0, 0, grid)
    east, south = pixel_to_lonlat(image.width, image.height, grid)
    result = {"version": 1, "title": "Central Park Pond imagery reconstruction review", "status": "inference-complete",
              "method": "Source-prompted SAM segmentation; candidate identity from mapped source; accepted masks clipped to source footprint",
              "promptPolicy": "One deepest-interior positive point, one deepest mapped background negative point inside the bounding box when available; highest model-scored candidate selected before source-overlap evaluation",
              "model": {"id": MODEL, "revision": REVISION, "license": "Apache-2.0",
                        "url": "https://huggingface.co/" + MODEL, "device": device,
                        "torch": torch.__version__, "transformers": transformers.__version__,
                        "weightsSha256": WEIGHTS_SHA256,
                        "weightsBundled": False},
              "reference": {"url": "./reconstruction/" + reference_path.name,
                            "sha256": hashlib.sha256(reference_bytes).hexdigest()},
              "imagery": {"source": ortho.SOURCE, "year": 2024, "license": "CC BY 4.0",
                          "captureDates": "2024-03-14 to 2024-03-24",
                          "bbox": [west, south, east, north], "requestedBbox": bbox,
                          "grid": grid, "width": image.width, "height": image.height,
                          "url": "./reconstruction/aerial.png", "tiles": tiles},
              "thresholds": {"predictedIou": 0.75, "sourceIou": 0.65, "sourcePrecision": 0.85,
                             "sourceRecall": 0.70, "minimumPixels": 64},
              "coordinates": "+X east, +Z south in meters relative to origin; GeoJSON uses WGS84 longitude, latitude",
              "origin": ortho.ORIGIN, "features": records,
              "summary": {"candidates": len(records), "accepted": sum(r["accepted"] for r in records),
                          "rejected": sum(not r["accepted"] for r in records)},
              "overlay": "./reconstruction/review-overlay.jpg",
              "limitations": ["Pilot only; not a reconstruction of all NYC.",
                              "SAM produces 2D masks, not terrain, height, species, facades or 3D geometry.",
                              "Predicted IoU is not a calibrated probability of object identity.",
                              "Mapped-source agreement is a consistency check, not independent ground-truth accuracy: the source also supplies point/box prompts.",
                              "Sources and imagery have different capture dates; shadow and leaf-off vegetation can disagree.",
                              "Accepted rendered polygons never expand exact surveyed footprints; rejected proposals are review artifacts only."],
              "elapsedSeconds": round(time.monotonic() - started, 2)}
    output_path.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    if reference_path.resolve() != (output / reference_path.name).resolve():
        (output / reference_path.name).write_bytes(reference_bytes)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "dist/reconstruction-review.json")
    parser.add_argument("--bbox", type=float, nargs=4, default=DEFAULT_BBOX)
    parser.add_argument("--zoom", type=int, default=19)
    parser.add_argument("--model-directory", type=Path)
    parser.add_argument("--device", choices=("auto", "cpu", "mps", "cuda"), default="auto")
    args = parser.parse_args()
    result = run(args.reference, args.output, args.bbox, args.zoom, args.model_directory, args.device)
    print(json.dumps(result["summary"]))


if __name__ == "__main__":
    main()
