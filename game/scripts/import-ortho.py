#!/usr/bin/env python3
"""Import unchanged NYC 2024 orthophoto tiles and their local-meter bounds.

Rebuild: python3 game/scripts/import-ortho.py
The imagery is copied byte-for-byte. Bounds transform Web Mercator tile corners
into the game's equirectangular projection (+X east, +Z south). Image top is
north/minZ, so a horizontal plane must not mirror its texture vertically.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 40.7235, "lon": -74.0015}
EARTH_RADIUS = 6371008.8
BBOX = [-74.005, 40.721, -73.998, 40.726]  # west, south, east, north
SOURCE = "https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/NYC_Orthos_2024/MapServer"
METADATA = "https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_AerialImagery.md"


def project(lon, lat):
    return (EARTH_RADIUS * math.radians(lon - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"])),
            -EARTH_RADIUS * math.radians(lat - ORIGIN["lat"]))


def tile_fraction(lon, lat, zoom):
    """XYZ/ArcGIS rows count southward from the northern Web Mercator edge."""
    scale = 2 ** zoom
    return ((lon + 180) / 360 * scale,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * scale)


def tile_corner(column, row, zoom):
    scale = 2 ** zoom
    return (column / scale * 360 - 180,
            math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * row / scale)))))


def tile_bounds(column, row, zoom):
    west, north = tile_corner(column, row, zoom)
    east, south = tile_corner(column + 1, row + 1, zoom)
    min_x, min_z = project(west, north)
    max_x, max_z = project(east, south)
    return {"minX": round(min_x, 6), "maxX": round(max_x, 6),
            "minZ": round(min_z, 6), "maxZ": round(max_z, 6)}


def coverage(zoom=18, margin=350, bbox=BBOX):
    if not isinstance(zoom, int) or not 0 <= zoom <= 20:
        raise ValueError("Use an integer zoom from 0 through the native maximum 20")
    if not math.isfinite(margin) or margin < 0:
        raise ValueError("Context margin must be a finite nonnegative number")
    west, south, east, north = bbox
    lat_margin = math.degrees(margin / EARTH_RADIUS)
    lon_margin = lat_margin / math.cos(math.radians(ORIGIN["lat"]))
    col_min, row_min = tile_fraction(west - lon_margin, north + lat_margin, zoom)
    col_max, row_max = tile_fraction(east + lon_margin, south - lat_margin, zoom)
    return [{"zoom": zoom, "row": row, "column": column,
             "sourceUrl": f"{SOURCE}/tile/{zoom}/{row}/{column}",
             "bounds": tile_bounds(column, row, zoom)}
            for row in range(math.floor(row_min), math.floor(row_max) + 1)
            for column in range(math.floor(col_min), math.floor(col_max) + 1)]


def image_extension(data):
    # A successful HTTP status can still carry an ArcGIS JSON error. Never ship
    # that error as a texture or include it in the manifest.
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n") and b"IEND" in data[-12:]:
        return ".png"
    raise ValueError("Tile response is not a complete JPEG or PNG")


def acquire(tile, output_dir):
    stem = f"{tile['zoom']}-{tile['row']}-{tile['column']}"
    existing = next((output_dir / (stem + ext) for ext in (".jpg", ".png")
                     if (output_dir / (stem + ext)).exists()), None)
    temporary = output_dir / (stem + ".download")
    if existing:
        data = existing.read_bytes()
        image_extension(data)
        target = existing
    else:
        try:
            subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                            "--retry", "2", "--max-time", "45", tile["sourceUrl"],
                            "--output", str(temporary)], check=True)
            data = temporary.read_bytes()
            target = output_dir / (stem + image_extension(data))
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return {**tile, "url": f"./assets/ortho/{target.name}", "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}


def build(output=ROOT / "dist/ortho.json", zoom=18, margin=350):
    planned = coverage(zoom, margin)
    if len(planned) > 500:
        raise ValueError(f"Refusing unexpectedly large import of {len(planned)} tiles")
    asset_dir = output.parent / "assets/ortho"
    asset_dir.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        tiles = list(pool.map(lambda tile: acquire(tile, asset_dir), planned))
    grid = {"zoom": zoom, "minColumn": min(t["column"] for t in tiles),
            "maxColumn": max(t["column"] for t in tiles),
            "minRow": min(t["row"] for t in tiles), "maxRow": max(t["row"] for t in tiles),
            "tileSize": 256}
    bounds = {axis: operation(t["bounds"][axis] for t in tiles)
              for axis, operation in (("minX", min), ("maxX", max), ("minZ", min), ("maxZ", max))}
    result = {"version": 1, "source": SOURCE, "title": "NYC 2024 orthophotography", "year": 2024,
              "attribution": "Imagery: NYC OTI, 2024, CC BY 4.0.",
              "licenseUrl": "https://creativecommons.org/licenses/by/4.0/", "metadataUrl": METADATA,
              "captureDates": "2024-03-14 to 2024-03-24", "origin": ORIGIN, "bbox": BBOX,
              "contextMarginMeters": margin, "zoom": zoom, "tilePixels": 256,
              "coordinates": "+X east, +Z south, meters; image top is minZ/north, left is minX/west.",
              "modifications": "Unmodified service tiles, selected for SoHo; bounds reprojected to local meters.",
              "limitations": "Overhead imagery, not street-level facade photography. Capture dates differ from the 2014 building survey.",
              "tilegrid": grid, "bounds": bounds, "tiles": tiles}
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    temporary.replace(output)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist/ortho.json")
    parser.add_argument("--zoom", type=int, default=18)
    # Survey context selects whole buildings intersecting a 250 m margin; their
    # outer walls can extend farther. 350 m covers every bundled survey vertex.
    parser.add_argument("--context-meters", type=float, default=350)
    args = parser.parse_args()
    result = build(args.output, args.zoom, args.context_meters)
    print(json.dumps({"tiles": len(result["tiles"]), "bytes": sum(t["bytes"] for t in result["tiles"]),
                      "output": str(args.output)}))


if __name__ == "__main__":
    main()
