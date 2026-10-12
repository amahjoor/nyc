#!/usr/bin/env python3
"""Run source-anchored SAM segmentation of official NYC aerial photographs.

The model proposes masks, never object identities or heights. Mapped feature
types supply those identities; overlap tests can reject a proposal, and accepted
masks are clipped to the surveyed footprint before the renderer may consume them.
Road and parking masks describe image appearance only; they never supply height
or collision boundaries, and must not be treated as vehicle/shadow removal.
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
SUPPORTED_CLASSES = ("water", "canopy", "roadbed", "parking")
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
    if kind not in SUPPORTED_CLASSES:
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


def acquire_image(bbox, zoom, output, asset_url="./reconstruction"):
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
        tile["url"] = asset_url + "/tiles/" + path.name
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


def prompts_for_mask(mask, grid_size=1):
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
    if grid_size > 1:
        # Long pavement polygons have several branches. Spatially distributed
        # source prompts prevent one wide branch from standing in for the whole
        # feature, without changing the independent mask-quality/overlap gates.
        # These prompts still make overlap a consistency check, not a benchmark.
        points, labels = [], []
        # A negative point far into grass cannot separate connected pavement
        # classes. Use a narrow, source-exterior band for distributed negatives;
        # its fixed pixel distances are recorded in the report, not tuned per
        # candidate. Roadbeds and adjacent sidewalks can share identical color.
        exterior_distance = distance_transform_edt(~mask)
        negative_band = background & (exterior_distance >= 4) & (exterior_distance <= 16)
        negative_distances = distance_transform_edt(negative_band)
        xcuts = np.linspace(bounds[0], bounds[2] + 1, grid_size + 1, dtype=int)
        ycuts = np.linspace(bounds[1], bounds[3] + 1, grid_size + 1, dtype=int)
        for label, distances in ((1, distance), (0, negative_distances)):
            for top, bottom in zip(ycuts[:-1], ycuts[1:]):
                for left, right in zip(xcuts[:-1], xcuts[1:]):
                    cell = distances[top:bottom, left:right]
                    if not cell.size or cell.max() < 1:
                        continue
                    cy, cx = np.unravel_index(cell.argmax(), cell.shape)
                    point = [int(cx + left), int(cy + top)]
                    if point not in points:
                        points.append(point); labels.append(label)
    return {"point": points[0], "points": points, "labels": labels, "box": bounds, "gridSize": grid_size}


def output_directory(output_path, assets_directory=None):
    """Separate report bundles so a new region can never overwrite the Pond run."""
    directory = assets_directory or ("reconstruction" if output_path.name == "reconstruction-review.json"
                                     else output_path.stem.removesuffix("-review"))
    if Path(directory).name != directory or directory in ("", ".", ".."):
        raise ValueError("Assets directory must be a single folder name")
    return output_path.parent / directory, "./" + directory


def validate_references(references, kinds=None):
    if references.get("type") != "FeatureCollection" or not isinstance(references.get("features"), list):
        raise ValueError("Reference must be a GeoJSON FeatureCollection")
    records = references["features"]
    if kinds:
        unknown = set(kinds) - set(SUPPORTED_CLASSES)
        if unknown:
            raise ValueError("Unsupported requested source class")
        records = [feature for feature in records if feature.get("properties", {}).get("kind") in kinds]
    seen = set()
    for feature in records:
        properties = feature.get("properties", {})
        identity = properties.get("sourceFeatureId") or properties.get("sourceId")
        if properties.get("kind") not in SUPPORTED_CLASSES or not identity or identity in seen:
            raise ValueError("Every reference needs a supported class and unique mapped source identity")
        if not properties.get("sourceUrl"):
            raise ValueError("Every reference needs source provenance")
        seen.add(identity)
    if not records:
        raise ValueError("No references match the requested source classes")
    return records


def reference_from_street_tiles(index_path, bbox, kinds=("roadbed", "parking")):
    """Select all mapped pavement in a region from the same tiles as the game."""
    from shapely.geometry import Polygon, box, mapping
    index_bytes = index_path.read_bytes()
    index = json.loads(index_bytes)
    if index.get("origin") != ortho.ORIGIN:
        raise ValueError("Street index origin does not match imagery coordinates")
    if set(kinds) - {"roadbed", "parking"}:
        raise ValueError("Street tile references support roadbed and parking only")
    west, south, east, north = bbox
    boundary = box(west, south, east, north)
    min_x, min_z = ortho.project(west, north)
    max_x, max_z = ortho.project(east, south)
    layers = {layer["kind"]: layer for layer in index["source"]["layers"]}
    features, seen = [], set()
    def geographic(point):
        x, z = point
        return [ortho.ORIGIN["lon"] + math.degrees(x / (ortho.EARTH_RADIUS * math.cos(math.radians(ortho.ORIGIN["lat"])))),
                ortho.ORIGIN["lat"] - math.degrees(z / ortho.EARTH_RADIUS)]
    for cell in index["cells"].values():
        bounds = cell["bounds"]
        if bounds["maxX"] < min_x or bounds["minX"] > max_x or bounds["maxZ"] < min_z or bounds["minZ"] > max_z:
            continue
        tile_path = (index_path.parent / cell["url"]).resolve()
        if not tile_path.is_relative_to(index_path.parent.resolve()):
            raise ValueError("Street tile path escapes the source bundle")
        for feature in json.loads(tile_path.read_text()).get("surfaces", []):
            if feature["kind"] not in kinds or feature["id"] in seen:
                continue
            seen.add(feature["id"])
            shape = Polygon([geographic(p) for p in feature["polygon"]],
                            [[geographic(p) for p in ring] for ring in feature.get("holes", [])])
            clipped = shape.intersection(boundary)
            if clipped.is_empty or clipped.area == 0:
                continue
            features.append({"type": "Feature", "properties": {
                "kind": feature["kind"], "sourceId": feature["sourceId"], "sourceFeatureId": feature["id"],
                "sourceUrl": layers[feature["kind"]]["url"], "sourceYear": index["source"]["surveyYear"],
                "sourceRowId": feature["sourceRowId"], "sourceSubcode": feature["subCode"],
                "clippedToReviewBounds": True}, "geometry": mapping(clipped)})
    result = {"type": "FeatureCollection", "bbox": bbox,
              "sourceIndexSha256": hashlib.sha256(index_bytes).hexdigest(),
              "sourcePolicy": "All selected mapped pavement classes in review bounds, deduplicated by source feature identity and clipped to review bounds; millimeter-precision game source geometry.",
              "features": sorted(features, key=lambda feature: feature["properties"]["sourceFeatureId"])}
    validate_references(result, kinds)
    return result


def run(reference_path, output_path, bbox, zoom=19, model_directory=None, device="auto",
        assets_directory=None, title=None, kinds=None, prompt_grid=1):
    import numpy as np
    import torch
    import transformers
    from PIL import Image
    from transformers import SamModel, SamProcessor
    started = time.monotonic()
    output, asset_url = output_directory(output_path, assets_directory)
    output.mkdir(parents=True, exist_ok=True)
    reference_bytes = reference_path.read_bytes()
    references = json.loads(reference_bytes)
    features = validate_references(references, kinds)
    image, grid, tiles = acquire_image(bbox, zoom, output, asset_url)
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
    for index, feature in enumerate(features):
        properties = feature.get("properties", {})
        kind = properties.get("kind")
        reference = polygons_to_mask(feature["geometry"], image.size, grid)
        prompts = prompts_for_mask(reference, prompt_grid)
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
                  "sourceFeatureId": properties.get("sourceFeatureId", properties.get("sourceId")),
                  "sourceUrl": properties.get("sourceUrl"), "sourceYear": properties.get("sourceYear"),
                  "use": "appearance-only; source geometry and measured elevation remain authoritative",
                  "prompt": prompts, "predictedIou": float(scores[chosen]),
                  "sourceAgreement": metrics, "candidatePixels": int(proposed.sum()),
                  "referencePixels": int(reference.sum()), "approvedPixels": int(approved.sum()),
                  "accepted": accepted, "reason": reason,
                  "candidateMask": f"{asset_url}/{key}-candidate.png",
                  "referenceMask": f"{asset_url}/{key}-reference.png",
                  "approvedMask": f"{asset_url}/{key}-approved.png",
                  "geometry": mask_geometry(approved, grid, feature["geometry"]) if accepted else None,
                  "localGeometry": mask_geometry(approved, grid, feature["geometry"], local=True) if accepted else None}
        records.append(record)
        print(json.dumps({"feature": key, "accepted": accepted, "predictedIou": record["predictedIou"], **metrics}), flush=True)
    overlay.convert("RGB").save(output / "review-overlay.jpg", quality=92)
    west, north = pixel_to_lonlat(0, 0, grid)
    east, south = pixel_to_lonlat(image.width, image.height, grid)
    result = {"version": 1, "title": title or "NYC imagery reconstruction review", "status": "inference-complete",
              "method": "Source-prompted SAM segmentation; candidate identity from mapped source; accepted masks clipped to source footprint",
              "promptPolicy": ("One deepest-interior positive point and one mapped-background negative point inside the bounding box when available"
                               if prompt_grid == 1 else f"Deepest mapped interior point and negative point 4–16 pixels outside source in each cell of a {prompt_grid}x{prompt_grid} bounding-box grid")
                              + "; highest model-scored candidate selected before source-overlap evaluation",
              "promptGrid": prompt_grid,
              "model": {"id": MODEL, "revision": REVISION, "license": "Apache-2.0",
                        "url": "https://huggingface.co/" + MODEL, "device": device,
                        "torch": torch.__version__, "transformers": transformers.__version__,
                        "weightsSha256": WEIGHTS_SHA256,
                        "weightsBundled": False},
              "reference": {"url": asset_url + "/" + reference_path.name,
                            "sha256": hashlib.sha256(reference_bytes).hexdigest()},
              "imagery": {"source": ortho.SOURCE, "year": 2024, "license": "CC BY 4.0",
                          "captureDates": "2024-03-14 to 2024-03-24",
                          "bbox": [west, south, east, north], "requestedBbox": bbox,
                          "grid": grid, "width": image.width, "height": image.height,
                          "url": asset_url + "/aerial.png", "tiles": tiles},
              "thresholds": {"predictedIou": 0.75, "sourceIou": 0.65, "sourcePrecision": 0.85,
                             "sourceRecall": 0.70, "minimumPixels": 64},
              "coordinates": "+X east, +Z south in meters relative to origin; GeoJSON uses WGS84 longitude, latitude",
              "origin": ortho.ORIGIN, "features": records,
              "summary": {"candidates": len(records), "accepted": sum(r["accepted"] for r in records),
                          "rejected": sum(not r["accepted"] for r in records)},
              "overlay": asset_url + "/review-overlay.jpg",
              "limitations": ["Pilot only; not a reconstruction of all NYC.",
                              "SAM produces 2D masks, not terrain, bridge decks, height, species, facades or 3D geometry.",
                              "Road and parking masks do not identify or remove photographed vehicles and shadows. These may remain within accepted pavement masks.",
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
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--reference", type=Path)
    inputs.add_argument("--street-index", type=Path, help="Build a georeferenced pavement reference from bundled game source tiles")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/reconstruction-review.json")
    parser.add_argument("--bbox", type=float, nargs=4, default=DEFAULT_BBOX)
    parser.add_argument("--zoom", type=int, default=19)
    parser.add_argument("--model-directory", type=Path)
    parser.add_argument("--assets-directory", help="Single sibling folder name; defaults from output report name")
    parser.add_argument("--title", help="Human-readable region and review title")
    parser.add_argument("--prompt-grid", type=int, choices=(1, 2, 3), default=1, help="Source prompt grid; 1 retains the original single-interior-point method")
    parser.add_argument("--classes", nargs="+", choices=SUPPORTED_CLASSES, help="Mapped source classes to process")
    parser.add_argument("--device", choices=("auto", "cpu", "mps", "cuda"), default="auto")
    args = parser.parse_args()
    if args.street_index:
        output, _ = output_directory(args.output, args.assets_directory)
        output.mkdir(parents=True, exist_ok=True)
        args.reference = output / "reference.geojson"
        args.classes = args.classes or ["roadbed", "parking"]
        args.reference.write_text(json.dumps(reference_from_street_tiles(args.street_index, args.bbox, args.classes),
                                             separators=(",", ":")) + "\n")
    result = run(args.reference, args.output, args.bbox, args.zoom, args.model_directory, args.device,
                 args.assets_directory, args.title, args.classes, args.prompt_grid)
    print(json.dumps(result["summary"]))


if __name__ == "__main__":
    main()
