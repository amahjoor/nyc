#!/usr/bin/env python3
"""Bake surveyed NYC pavement and transport structures into 500 m browser tiles.

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
BASE_LAYERS = tuple(LAYERS)
ARCGIS_ROOT = "https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/"
US_SURVEY_FOOT = 1200 / 3937
LAYERS.update({
    "parking": {"dataset": "Parking_Lot_2022/FeatureServer/13", "arcgis": True,
                "featureCode": 5000, "subtypes": {500000: "parking lot"}},
    "transport": {"dataset": "Transport_Structure_2022/FeatureServer/25", "arcgis": True,
                  "featureCodes": {2300, 2310, 2320, 2330, 2340, 2350},
                  "subtypes": {230000: "bridge", 231000: "tunnel", 232000: "rail bridge",
                               233000: "pedestrian bridge", 234000: "railroad viaduct", 235000: "overpass"}},
})
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


def spatial_filter(coverage=COVERAGE):
    west, south = unproject(coverage["minX"], coverage["maxZ"])
    east, north = unproject(coverage["maxX"], coverage["minZ"])
    return f"intersects(the_geom,'POLYGON (({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))')"


def query_url(kind, *, count=False, coverage=COVERAGE):
    spec = LAYERS[kind]
    if spec.get("arcgis"):
        west, south = unproject(coverage["minX"], coverage["maxZ"])
        east, north = unproject(coverage["maxX"], coverage["minZ"])
        query = {"where": "1=1", "geometry": f"{west},{south},{east},{north}",
                 "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                 "spatialRel": "esriSpatialRelIntersects", "f": "json" if count else "geojson"}
        if count:
            query["returnCountOnly"] = "true"
        else:
            query.update({"outFields": "*", "outSR": 4326, "returnZ": "true", "orderByFields": "OBJECTID", "resultRecordCount": ROW_LIMIT})
        return ARCGIS_ROOT + spec["dataset"] + "/query?" + urlencode(query)
    query = {"$select": "count(*) AS count" if count else FIELDS, "$where": spatial_filter(coverage)}
    if not count:
        query.update({"$order": ":id", "$limit": ROW_LIMIT})
    return f"https://data.cityofnewyork.us/resource/{LAYERS[kind]['dataset']}.json?" + urlencode(query)


def source_path(cache, kind, region="soho"):
    return Path(cache) / f"nyc-street-detail-{region}-{kind}.json"


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


def convert_rows(kind, rows, coverage=COVERAGE):
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
        if code not in spec.get("featureCodes", {spec.get("featureCode")}) or subcode not in spec["subtypes"] or subcode // 100 != code or row.get("status") not in STATUSES:
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
            if kind == "transport":
                record["name"] = row.get("name") or ""
                record["elevationStatus"] = "unavailable"
                record["elevationLimitation"] = "Missing outline Z, or zero ordinates whose measurement semantics are unresolved. Do not flatten this structure onto terrain."
                if "sourceElevations" in record and all(chain[1] is not None for chain in chains) and all(abs(v) > 1e-8 for chain in chains for v in chain[1]):
                    record.pop("elevationLimitation", None)
                    raw_heights = record["sourceElevations"]
                    # ArcGIS outSR changes horizontal coordinates only. The
                    # original Z ordinates remain US survey feet, NAVD88.
                    # Preserve the source values as well as explicit metric Z.
                    record["elevations"] = {"polygon": [round(v * US_SURVEY_FOOT, 5) for v in raw_heights["polygon"]],
                                            "holes": [[round(v * US_SURVEY_FOOT, 5) for v in ring] for ring in raw_heights["holes"]]}
                    record.update({"elevationUnits": "meters", "verticalDatum": "NAVD88",
                                   "sourceElevationUnits": "US survey feet", "elevationStatus": "surveyed",
                                   "elevationMeaning": "Surveyed transport outline Z; deck interior is interpolated, not independently measured."})
                record["surfaceRole"] = "tunnel footprint" if subcode == 231000 else "elevated transport outline"
            if meets_box(record, coverage):
                features.append(record)
    return features


def cell_bounds(x, z):
    return {"minX": x * CELL_SIZE, "maxX": (x + 1) * CELL_SIZE, "minZ": z * CELL_SIZE, "maxZ": (z + 1) * CELL_SIZE}


def tile_features(features, coverages=None):
    coverages = coverages or [COVERAGE]
    tiles = defaultdict(lambda: {"surfaces": [], "curbs": [], "structures": []})
    cells = set()
    for coverage in coverages:
        cells.update((x, z) for x in range(math.floor(coverage["minX"] / CELL_SIZE), math.ceil(coverage["maxX"] / CELL_SIZE))
                     for z in range(math.floor(coverage["minZ"] / CELL_SIZE), math.ceil(coverage["maxZ"] / CELL_SIZE)))
    for feature in features:
        feature_cells = cells
        if feature["kind"] == "transport":
            # A surveyed deck must remain streamed across its entire span.
            # Pavement coverage stays bounded to requested regions, but emit
            # structure-only cells beyond them so a bridge cannot disappear
            # midway through crossing as its approach tile is evicted.
            bounds = bounds_of(feature["polygon"])
            feature_cells = cells | {(x, z) for x in range(math.floor(bounds["minX"] / CELL_SIZE), math.ceil(bounds["maxX"] / CELL_SIZE))
                                     for z in range(math.floor(bounds["minZ"] / CELL_SIZE), math.ceil(bounds["maxZ"] / CELL_SIZE))}
        for x, z in sorted(feature_cells):
            if meets_box(feature, cell_bounds(x, z)):
                bucket = "structures" if feature["kind"] == "transport" else "curbs" if feature["kind"] == "curb" else "surfaces"
                tiles[x, z][bucket].append(feature)
    return tiles


def fetch_json(url, path):
    subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2", "--max-time", "90",
                    url, "--output", str(path)], check=True)
    return json.loads(path.read_bytes())


def normalize_response(kind, data):
    if not LAYERS[kind].get("arcgis"):
        return data
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list) or data.get("exceededTransferLimit"):
        raise ValueError(f"Invalid or truncated {kind} ArcGIS export")
    rows = []
    for feature in data["features"]:
        p = feature["properties"]
        rows.append({"row_id": f"arcgis-{p['OBJECTID']}", "source_id": p["SOURCE_ID"],
                     "the_geom": feature["geometry"], "feat_code": p["FEATURE_CODE"],
                     "sub_code": p["SUB_FEATURE_CODE"], "status": p["STATUS"], "name": p.get("NAME", "")})
    return rows


def coverage_regions(all_regions=False, landscape_path=ROOT / "dist/landscape-index.json"):
    regions = [{"id": "soho", "name": "SoHo", "borough": "Manhattan", "bounds": COVERAGE}]
    if all_regions:
        landscape = json.loads(Path(landscape_path).read_text())
        regions.extend({key: region[key] for key in ("id", "name", "borough", "bounds")} for region in landscape["regions"])
        for region in regions:
            if region["id"] == "meadow-lake":
                # Include the actual eastern parking lot and Van Wyck roadbed
                # needed for the imagery review; detailed terrain stays in its
                # original footprint and this extension uses citywide DEM.
                region["bounds"] = {**region["bounds"], "maxX": project(-73.8358, 40.735)[0]}
                # Midpoint and bearing of the actual CSCL Meadow Lake Drive
                # segment beside the eastern parking lot used in the AI review.
                region.update({"exploreName": "Meadow Lake roads and parking",
                               "view": {"x": 13787.56, "z": -1396.235, "heading": -0.3609033336059268},
                               "viewSourceRoadId": "cscl:111892:2", "viewSourceRoadName": "MEADOW LAKE DR"})
        # Source-bounded waterfront and elevated motorway sample includes the
        # Manhattan bridge approach; whole bridge components remain intact.
        southwest = project(-74.008, 40.703)
        northeast = project(-73.99, 40.716)
        regions.append({"id": "brooklyn-bridge", "name": "Brooklyn Bridge approaches", "borough": "Manhattan",
                        "bounds": {"minX": southwest[0], "maxX": northeast[0], "minZ": northeast[1], "maxZ": southwest[1]},
                        "view": {"x": -85.445, "z": 1003.205, "heading": 2.7506},
                        "viewSourceRoadId": "cscl:1372", "viewSourceRoadName": "CENTRE ST"})
    return regions


def download_inputs(cache, regions=None, kinds=BASE_LAYERS):
    cache.mkdir(parents=True, exist_ok=True)
    for region in regions or coverage_regions():
        for kind in kinds:
            path = source_path(cache, kind, region["id"])
            query = query_url(kind, coverage=region["bounds"])
            query_path = path.with_suffix(".query.json")
            if path.exists() and ((query_path.exists() and json.loads(query_path.read_text()) == query)
                                  or (not query_path.exists() and region["id"] == "soho" and region["bounds"] == COVERAGE)):
                continue
            count_path = path.with_suffix(".count.json")
            response = fetch_json(query_url(kind, count=True, coverage=region["bounds"]), count_path)
            count = int(response["count"] if LAYERS[kind].get("arcgis") else response[0]["count"])
            if not 0 <= count < ROW_LIMIT:
                raise ValueError(f"The bounded {kind} query exceeds the supported record limit")
            temporary = path.with_suffix(".download")
            data = fetch_json(query_url(kind, coverage=region["bounds"]), temporary)
            rows = normalize_response(kind, data)
            if not isinstance(rows, list) or len(rows) != count:
                raise ValueError(f"Incomplete {kind} response: expected {count} records")
            convert_rows(kind, rows, region["bounds"])
            temporary.replace(path)
            query_path.write_text(json.dumps(query) + "\n")
            print(f"Downloaded {region['id']}: {kind} ({count} records)", flush=True)


def compact_write(path, data):
    blob = (json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()
    path.write_bytes(blob)
    return len(blob)


def build(cache, output, regions=None, kinds=BASE_LAYERS):
    regions = regions or coverage_regions()
    sources, features_by_id = [], {}
    region_stats = {}
    for region in regions:
        counts = Counter()
        for kind in kinds:
            spec = LAYERS[kind]
            path = source_path(cache, kind, region["id"])
            query_path = path.with_suffix(".query.json")
            if query_path.exists() and json.loads(query_path.read_text()) != query_url(kind, coverage=region["bounds"]):
                raise ValueError("Cached source bounds differ from requested coverage; run with --download")
            raw = path.read_bytes()
            rows = normalize_response(kind, json.loads(raw))
            if not isinstance(rows, list) or not 0 <= len(rows) < ROW_LIMIT:
                raise ValueError(f"Invalid or potentially truncated {kind} input")
            converted = convert_rows(kind, rows, region["bounds"])
            for feature in converted:
                previous = features_by_id.get(feature["id"])
                if previous is not None and previous != feature:
                    raise ValueError("Overlapping source exports disagree for one feature identity")
                features_by_id[feature["id"]] = feature
            counts[kind] += len(converted)
            sources.append({"kind": kind, "regionId": region["id"], "dataset": spec["dataset"],
                            "url": ARCGIS_ROOT + spec["dataset"] if spec.get("arcgis") else f"https://data.cityofnewyork.us/d/{spec['dataset']}",
                            "queryUrl": query_url(kind, coverage=region["bounds"]), "records": len(rows), "retainedComponents": len(converted),
                            "sha256": hashlib.sha256(raw).hexdigest()})
        region_stats[region["id"]] = dict(counts)
    features = sorted(features_by_id.values(), key=lambda f: f["id"])
    if not features:
        raise ValueError("No source features intersect requested coverage")
    points = [point for feature in features for point in feature.get("polygon", feature.get("points"))]
    tiles = tile_features(features, [region["bounds"] for region in regions])
    directory = output / "street-detail"
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "name": "Surveyed NYC streets and transport", "origin": ORIGIN, "cellSize": CELL_SIZE,
                "bounds": bounds_of(points), "coverageBounds": COVERAGE, "coverageRegions": [{**region, "stats": region_stats[region["id"]]} for region in regions], "cells": {},
                "source": {"title": "NYC OTI 2022 Planimetric Database", "surveyYear": 2022, "metadata": CAPTURE_RULES,
                           "attribution": "City of New York, Office of Technology and Innovation; NYC Open Data",
                           "termsUrl": "https://opendata.cityofnewyork.us/overview/#termsofuse", "layers": sources,
                           "modifications": "Projected to local meters at millimeter precision. Original rings, holes, and line components retained. Whole components repeat across tiles; deduplicate by id. Features intersecting coverage boxes can extend beyond their edges. Structure-only tiles retain complete bridge spans beyond pavement coverage to prevent mid-span streaming loss.",
                           "limitations": "Roadbed, sidewalk, curb, and parking footprints are 2D exports draped onto measured bare-earth terrain. Transport outlines retain ArcGIS Polygon Z in US survey feet converted to meters NAVD88; deck interiors require interpolation, and tunnel footprints are not ground surfaces. No material, lane marking, curb height, or unseen bridge detail is inferred. Data may predate later changes; unchanged features can originate in earlier surveys.", "transportVerticalReference": {"datum": "NAVD88", "sourceUnits": "US survey feet", "units": "meters", "metersPerSourceUnit": US_SURVEY_FOOT, "documentation": CAPTURE_RULES, "arcgisMetadata": "https://www.arcgis.com/sharing/rest/content/items/898e386eb4c049d2b60e61252e1bcd10/info/metadata/metadata.xml"}},
                "stats": {"features": len(features), "byKind": dict(Counter(f["kind"] for f in features)),
                          "holes": sum(len(f.get("holes", [])) for f in features), "cells": len(tiles),
                          "featuresWithSourceElevations": sum("sourceElevations" in f for f in features),
                          "surveyedStructures": sum(f.get("elevationStatus") == "surveyed" for f in features),
                          "structuresWithoutVerifiedElevation": sum(f.get("elevationStatus") == "unavailable" for f in features),
                          "subtypes": dict(Counter(f["subtype"] for f in features))}}
    for (x, z), tile in sorted(tiles.items()):
        filename = f"{x}_{z}.json"
        size = compact_write(directory / filename, tile)
        manifest["cells"][f"{x},{z}"] = {"url": f"./street-detail/{filename}", "bounds": cell_bounds(x, z),
                                          "count": len(tile["surfaces"]) + len(tile["curbs"]) + len(tile["structures"]), "bytes": size}
    manifest["stats"]["bytes"] = sum(cell["bytes"] for cell in manifest["cells"].values())
    compact_write(output / "street-detail-index.json", manifest)
    print(json.dumps(manifest["stats"], indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--download", action="store_true", help="Fetch missing bounded official source files before building")
    parser.add_argument("--all-regions", action="store_true", help="Include five landscape samples, parking lots, and bridge approaches")
    parser.add_argument("--landscape-index", type=Path, default=ROOT / "dist/landscape-index.json")
    args = parser.parse_args()
    regions = coverage_regions(args.all_regions, args.landscape_index)
    kinds = tuple(LAYERS) if args.all_regions else BASE_LAYERS
    if args.download:
        download_inputs(args.cache, regions, kinds)
    build(args.cache, args.output, regions, kinds)


if __name__ == "__main__":
    main()
