#!/usr/bin/env python3
"""Bake surveyed NYC pavement around SoHo into 500 m browser tiles.

Run with --download to fetch the bounded official inputs using curl. Rebuild
offline from --cache afterward. Original polygon components and holes are kept;
tiles repeat whole intersecting features and the renderer deduplicates their IDs.
"""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import subprocess
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 40.7235, "lon": -74.0015}
EARTH_RADIUS = 6371008.8
CELL_SIZE = 500
COVERAGE = {"minX": -1000, "maxX": 1000, "minZ": -1000, "maxZ": 1000}
ROW_LIMIT = 10000
FIELDS = ":id AS row_id,source_id,the_geom,feat_code,sub_code,status"
LAYERS = {
    "roadbed": {"dataset": "i36f-5ih7", "featureCode": 3500,
                "subtypes": {350000: "roadbed", 350010: "intersection", 350020: "shoulder", 350030: "driveway"}},
    "sidewalk": {"dataset": "52n9-sdep", "featureCode": 3800,
                 "subtypes": {380000: "right-of-way sidewalk", 380010: "interior sidewalk"}},
    "curb": {"dataset": "5xvt-8cbk", "featureCode": 2250,
             "subtypes": {225000: "curb"}},
}
STATUSES = {"New", "Updated", "Unchanged"}
CAPTURE_RULES = "https://github.com/CityOfNewYork/nyc-planimetrics/blob/main/Capture_Rules.md"


def project(lon, lat):
    if not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in (lon, lat)):
        raise ValueError("Source coordinates must be finite numbers")
    if not (-74.28 <= lon <= -73.68 and 40.48 <= lat <= 40.93):
        raise ValueError("Source coordinate is outside NYC")
    return [round(EARTH_RADIUS * math.radians(lon - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"])), 3),
            round(-EARTH_RADIUS * math.radians(lat - ORIGIN["lat"]), 3)]


def unproject(x, z):
    return [ORIGIN["lon"] + x / (EARTH_RADIUS * math.cos(math.radians(ORIGIN["lat"]))) * 180 / math.pi,
            ORIGIN["lat"] - z / EARTH_RADIUS * 180 / math.pi]


def spatial_filter():
    west, south = unproject(COVERAGE["minX"], COVERAGE["maxZ"])
    east, north = unproject(COVERAGE["maxX"], COVERAGE["minZ"])
    return f"intersects(the_geom,'POLYGON (({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))')"


def query_url(kind, *, count=False):
    query = {"$select": "count(*) AS count" if count else FIELDS, "$where": spatial_filter()}
    if not count:
        query.update({"$order": ":id", "$limit": ROW_LIMIT})
    return f"https://data.cityofnewyork.us/resource/{LAYERS[kind]['dataset']}.json?" + urlencode(query)


def source_path(cache, kind):
    return Path(cache) / f"nyc-street-detail-soho-{kind}.json"


def bounds_of(points):
    return {"minX": min(p[0] for p in points), "maxX": max(p[0] for p in points),
            "minZ": min(p[1] for p in points), "maxZ": max(p[1] for p in points)}


def overlaps(a, b):
    return a["maxX"] >= b["minX"] and a["minX"] <= b["maxX"] and a["maxZ"] >= b["minZ"] and a["minZ"] <= b["maxZ"]


def inside_box(point, bounds):
    return bounds["minX"] <= point[0] <= bounds["maxX"] and bounds["minZ"] <= point[1] <= bounds["maxZ"]


def segment_meets_box(a, b, bounds):
    # Liang-Barsky tests intersections without inventing clipped ring edges.
    low, high = 0.0, 1.0
    for start, delta, minimum, maximum in [(a[0], b[0] - a[0], bounds["minX"], bounds["maxX"]),
                                           (a[1], b[1] - a[1], bounds["minZ"], bounds["maxZ"])]:
        if delta == 0:
            if not minimum <= start <= maximum:
                return False
        else:
            first, last = sorted(((minimum - start) / delta, (maximum - start) / delta))
            low, high = max(low, first), min(high, last)
            if low > high:
                return False
    return True


def in_ring(point, ring):
    x, z = point
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def meets_box(feature, bounds):
    points = feature.get("polygon", feature.get("points"))
    if not overlaps(bounds_of(points), bounds):
        return False
    if any(inside_box(point, bounds) for point in points):
        return True
    chain = points[1:] + points[:1] if "polygon" in feature else points[1:]
    if any(segment_meets_box(a, b, bounds) for a, b in zip(points, chain)):
        return True
    if "polygon" not in feature:
        return False
    if any(segment_meets_box(a, b, bounds) for hole in feature["holes"] for a, b in zip(hole, hole[1:] + hole[:1])):
        return True
    # A cell can sit wholly inside a polygon, or wholly inside its courtyard.
    corners = [[x, z] for x in (bounds["minX"], bounds["maxX"]) for z in (bounds["minZ"], bounds["maxZ"])]
    return any(in_ring(point, points) and not any(in_ring(point, hole) for hole in feature["holes"]) for point in corners)


def projected_chain(coordinates, *, ring=False):
    if not isinstance(coordinates, list):
        raise ValueError("Invalid coordinate sequence")
    points, heights = [], []
    dimensions = set()
    for coordinate in coordinates:
        if not isinstance(coordinate, list) or len(coordinate) not in (2, 3):
            raise ValueError("Expected a two- or three-dimensional source coordinate")
        dimensions.add(len(coordinate))
        point = project(*coordinate[:2])
        height = coordinate[2] if len(coordinate) == 3 else None
        if height is not None and (not isinstance(height, (int, float)) or isinstance(height, bool) or not math.isfinite(height)):
            raise ValueError("Invalid source elevation")
        if not points or point != points[-1] or height != heights[-1]:
            points.append(point);heights.append(height)
    if len(dimensions) > 1:
        raise ValueError("Mixed coordinate dimensions in one source sequence")
    if ring and points and points[0] == points[-1]:
        if heights[0] != heights[-1]:
            raise ValueError("Source ring closure disagrees in elevation")
        points.pop();heights.pop()
    if len(points) < (3 if ring else 2):
        raise ValueError("Degenerate source geometry")
    if ring and abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))) < 0.000001:
        raise ValueError("Source polygon has zero area")
    return points, heights if dimensions == {3} else None


def integer(value):
    try:
        number = float(value)
        if not math.isfinite(number) or number != int(number):
            raise ValueError()
        return int(number)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"Invalid source classification: {value!r}") from None


def convert_rows(kind, rows):
    spec, features, seen = LAYERS[kind], [], set()
    for row in rows:
        row_id = row.get("row_id")
        if not isinstance(row_id, str) or not row_id or row_id in seen:
            raise ValueError("Missing or duplicate source row identity")
        seen.add(row_id)
        source_id = row.get("source_id")
        if source_id is None:
            raise ValueError("Missing source_id")
        code, subcode = integer(row.get("feat_code")), integer(row.get("sub_code"))
        if code != spec["featureCode"] or subcode not in spec["subtypes"] or row.get("status") not in STATUSES:
            raise ValueError(f"Unrecognized {kind} feature classification")
        geometry = row.get("the_geom", {})
        wanted_type = "MultiLineString" if kind == "curb" else "MultiPolygon"
        single_type = "LineString" if kind == "curb" else "Polygon"
        if geometry.get("type") not in (wanted_type, single_type) or not isinstance(geometry.get("coordinates"), list):
            raise ValueError(f"Unexpected {kind} geometry")
        components = geometry["coordinates"] if geometry["type"] == wanted_type else [geometry["coordinates"]]
        for part, component in enumerate(components):
            # New official features can share SOURCE_ID=0. Socrata row IDs keep
            # those distinct; retain SOURCE_ID separately for source lookups.
            record = {"id": f"{kind}:{row_id}:{part}", "sourceId": str(source_id), "sourceRowId": row_id,
                      "kind": kind, "featureCode": code, "subCode": subcode, "subtype": spec["subtypes"][subcode], "status": row["status"]}
            if kind == "curb":
                record["points"], heights = projected_chain(component)
                if heights is not None:
                    record["sourceElevations"] = heights
            else:
                if not component:
                    raise ValueError("Source polygon has no exterior ring")
                chains = [projected_chain(ring, ring=True) for ring in component]
                record["polygon"] = chains[0][0]
                record["holes"] = [chain[0] for chain in chains[1:]]
                if any(chain[1] is not None for chain in chains):
                    record["sourceElevations"] = {"polygon": chains[0][1], "holes": [chain[1] for chain in chains[1:]]}
            if "sourceElevations" in record:
                # Never reinterpret an undocumented GeoJSON third ordinate as
                # curb height. Preserve it for a separately verified Z import.
                record["elevationMeaning"] = "source ordinate; units and datum unverified in this export"
            if meets_box(record, COVERAGE):
                features.append(record)
    return features


def cell_bounds(x, z):
    return {"minX": x * CELL_SIZE, "maxX": (x + 1) * CELL_SIZE, "minZ": z * CELL_SIZE, "maxZ": (z + 1) * CELL_SIZE}


def tile_features(features):
    tiles = defaultdict(lambda: {"surfaces": [], "curbs": []})
    for feature in features:
        for x in range(math.floor(COVERAGE["minX"] / CELL_SIZE), math.ceil(COVERAGE["maxX"] / CELL_SIZE)):
            for z in range(math.floor(COVERAGE["minZ"] / CELL_SIZE), math.ceil(COVERAGE["maxZ"] / CELL_SIZE)):
                if meets_box(feature, cell_bounds(x, z)):
                    tiles[x, z]["curbs" if feature["kind"] == "curb" else "surfaces"].append(feature)
    return tiles


def fetch_json(url, path):
    subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2", "--max-time", "90",
                    url, "--output", str(path)], check=True)
    return json.loads(path.read_bytes())


def download_inputs(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for kind in LAYERS:
        path = source_path(cache, kind)
        if path.exists():
            continue
        count_path = path.with_suffix(".count.json")
        count = int(fetch_json(query_url(kind, count=True), count_path)[0]["count"])
        if not 0 < count < ROW_LIMIT:
            raise ValueError(f"The bounded {kind} query exceeds the supported record limit")
        temporary = path.with_suffix(".download")
        rows = fetch_json(query_url(kind), temporary)
        if not isinstance(rows, list) or len(rows) != count:
            raise ValueError(f"Incomplete {kind} response: expected {count} records")
        convert_rows(kind, rows)
        temporary.replace(path)


def compact_write(path, data):
    blob = (json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()
    path.write_bytes(blob)
    return len(blob)


def build(cache, output):
    features, sources = [], []
    for kind, spec in LAYERS.items():
        raw = source_path(cache, kind).read_bytes()
        rows = json.loads(raw)
        if not isinstance(rows, list) or not 0 < len(rows) < ROW_LIMIT:
            raise ValueError(f"Invalid or potentially truncated {kind} input")
        converted = convert_rows(kind, rows)
        if not converted:
            raise ValueError(f"No {kind} features intersect the requested coverage")
        features.extend(converted)
        sources.append({"kind": kind, "dataset": spec["dataset"], "url": f"https://data.cityofnewyork.us/d/{spec['dataset']}",
                        "queryUrl": query_url(kind), "records": len(rows), "retainedComponents": len(converted),
                        "sha256": hashlib.sha256(raw).hexdigest()})
    if len({feature["id"] for feature in features}) != len(features):
        raise ValueError("Duplicate generated feature identity")
    points = [point for feature in features for point in feature.get("polygon", feature.get("points"))]
    tiles = tile_features(features)
    directory = output / "street-detail"
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "name": "SoHo surveyed streets", "origin": ORIGIN, "cellSize": CELL_SIZE,
                "bounds": bounds_of(points), "coverageBounds": COVERAGE, "cells": {},
                "source": {"title": "NYC OTI 2022 Planimetric Database", "surveyYear": 2022, "metadata": CAPTURE_RULES,
                           "attribution": "City of New York, Office of Technology and Innovation; NYC Open Data",
                           "termsUrl": "https://opendata.cityofnewyork.us/overview/#termsofuse", "layers": sources,
                           "modifications": "Projected to local meters at millimeter precision. Original rings, holes, and line components retained. Whole components repeat across tiles; deduplicate by id. Features intersecting the coverage box can extend beyond its edge.",
                           "limitations": "Socrata source exports provide 2D coordinates. No curb height, pavement material, lane marking, or bridge/tunnel grade is inferred. Original geodatabase curbs are Polyline Z; these exports do not expose their elevation. Polygon surfaces are mapped flat for gameplay. Data does not necessarily reflect later street changes."},
                "stats": {"features": len(features), "byKind": dict(Counter(f["kind"] for f in features)),
                          "holes": sum(len(f.get("holes", [])) for f in features), "cells": len(tiles),
                          "featuresWithSourceElevations": sum("sourceElevations" in f for f in features),
                          "subtypes": dict(Counter(f["subtype"] for f in features))}}
    for (x, z), tile in sorted(tiles.items()):
        filename = f"{x}_{z}.json"
        size = compact_write(directory / filename, tile)
        manifest["cells"][f"{x},{z}"] = {"url": f"./street-detail/{filename}", "bounds": cell_bounds(x, z),
                                          "count": len(tile["surfaces"]) + len(tile["curbs"]), "bytes": size}
    manifest["stats"]["bytes"] = sum(cell["bytes"] for cell in manifest["cells"].values())
    compact_write(output / "street-detail-index.json", manifest)
    print(json.dumps(manifest["stats"], indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--download", action="store_true", help="Fetch missing bounded official source files before building")
    args = parser.parse_args()
    if args.download:
        download_inputs(args.cache)
    build(args.cache, args.output)


if __name__ == "__main__":
    main()
