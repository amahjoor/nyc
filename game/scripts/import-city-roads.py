#!/usr/bin/env python3
"""Import official NYC CSCL streets and shoreline boroughs into 1 km cells.

With --download the public NYC endpoints are fetched into --cache. Existing
cache files allow a fully offline rebuild. Geometry is projected into the same
meter coordinate system as the game; no street paths or islands are invented.
"""

import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import subprocess
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 40.7235, "lon": -74.0015}
RADIUS = 6371008.8
CELL_SIZE = 1000
STREETS_URL = "https://data.cityofnewyork.us/resource/inkn-q76z.json"
BOROUGHS_URL = "https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Borough_Boundary/FeatureServer/0/query"
BOROUGHS = {1: "Manhattan", 2: "Bronx", 3: "Brooklyn", 4: "Queens", 5: "Staten Island"}
KINDS = {1: "residential", 2: "motorway", 3: "bridge", 4: "tunnel", 9: "ramp", 10: "service", 13: "service"}
FIELDS = "the_geom,objectid,physicalid,full_street_name,boroughcode,streetwidth,trafdir,rw_type,from_level_code,to_level_code,posted_speed,number_travel_lanes"
PLACE_TARGETS = [
    ("SoHo", 1, -74.0003, 40.7244),
    ("Midtown / Times Square", 1, -73.9855, 40.7580),
    ("DUMBO", 3, -73.9891, 40.7032),
    ("Long Island City", 4, -73.9490, 40.7448),
    ("Grand Concourse", 2, -73.9228, 40.8274),
    ("St. George", 5, -74.0772, 40.6428),
]


def project(lon, lat):
    return [round(RADIUS * math.radians(lon - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"])), 2),
            round(-RADIUS * math.radians(lat - ORIGIN["lat"]), 2)]


def number(value, fallback=0):
    try:
        result = float(value)
        return result if math.isfinite(result) else fallback
    except (ValueError, TypeError):
        return fallback


def convert_road(row):
    roadway_type = int(number(row.get("rw_type")))
    borough = int(number(row.get("boroughcode")))
    if roadway_type not in KINDS or borough not in BOROUGHS or row.get("trafdir") == "NV":
        return []
    if "status" in row and row["status"] != "2":
        return []
    geometry = row.get("the_geom", {})
    lines = geometry.get("coordinates", [])
    if geometry.get("type") == "LineString":
        lines = [lines]
    elif geometry.get("type") != "MultiLineString":
        return []
    width_feet = number(row.get("streetwidth"))
    width = round(width_feet * 0.3048, 2) if width_feet > 0 else round(max(7, number(row.get("number_travel_lanes"), 2) * 3.4), 2)
    direction = row.get("trafdir")
    output = []
    for index, line in enumerate(lines):
        points = []
        for lon, lat, *_ in line:
            point = project(lon, lat)
            if not points or points[-1] != point:
                points.append(point)
        if len(points) < 2:
            continue
        identifier = f"cscl:{row['objectid']}" + (f":{index}" if len(lines) > 1 else "")
        road = {"id": identifier, "name": row.get("full_street_name", "Unnamed street"), "points": points,
                "width": width, "oneway": "yes" if direction == "FT" else "-1" if direction == "TF" else False,
                "kind": KINDS[roadway_type], "surface": "unknown", "roadwayType": roadway_type, "borough": borough,
                "fromLevel": int(number(row.get("from_level_code"), 13)), "toLevel": int(number(row.get("to_level_code"), 13))}
        if width_feet <= 0:
            road["widthEstimated"] = True
        output.append(road)
    return output


def point_segment(point, a, b, interior=False):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dz * dz
    t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2 if length2 else 0
    t = min(0.92 if interior else 1, max(0.08 if interior else 0, t))
    projected = [a[0] + t * dx, a[1] + t * dz]
    return math.dist(point, projected), projected


def road_cells(road, cell_size=CELL_SIZE):
    """Include edge-adjacent pavement, avoiding holes when a road crosses cells."""
    cells = set()
    padding = road["width"] / 2
    for a, b in zip(road["points"], road["points"][1:]):
        for x in range(math.floor((min(a[0], b[0]) - padding) / cell_size), math.floor((max(a[0], b[0]) + padding) / cell_size) + 1):
            for z in range(math.floor((min(a[1], b[1]) - padding) / cell_size), math.floor((max(a[1], b[1]) + padding) / cell_size) + 1):
                cells.add((x, z))
    return cells


def signed_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def simplify_line(points, tolerance):
    """Iterative Douglas-Peucker keeps large coastal rings below recursion limits."""
    if len(points) < 3:
        return points
    keep, pending = {0, len(points) - 1}, [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        farthest, distance = None, tolerance
        for index in range(first + 1, last):
            candidate = point_segment(points[index], points[first], points[last])[0]
            if candidate > distance:
                farthest, distance = index, candidate
        if farthest is not None:
            keep.add(farthest)
            pending.extend([(first, farthest), (farthest, last)])
    return [points[index] for index in sorted(keep)]


def simplify_ring(coordinates, tolerance=1):
    points = [project(lon, lat) for lon, lat, *_ in coordinates]
    if points and points[0] == points[-1]:
        points.pop()
    if len(points) < 4:
        return points
    # Split a closed ring across a distant vertex, because treating its identical
    # start/end as a normal line can discard important shoreline structure.
    split = max(range(1, len(points)), key=lambda i: math.dist(points[0], points[i]))
    ring = simplify_line(points[:split + 1], tolerance)[:-1] + simplify_line(points[split:] + points[:1], tolerance)[:-1]
    return ring if len(ring) >= 3 else points


def centroid(ring):
    area = signed_area(ring)
    if abs(area) < 0.001:
        return {"x": ring[0][0], "z": ring[0][1]}
    x = z = 0
    for a, b in zip(ring, ring[1:] + ring[:1]):
        cross = a[0] * b[1] - b[0] * a[1]
        x += (a[0] + b[0]) * cross
        z += (a[1] + b[1]) * cross
    return {"x": round(x / (6 * area), 2), "z": round(z / (6 * area), 2)}


def convert_boroughs(geojson):
    boroughs = []
    for feature in geojson["features"]:
        geometry, properties = feature["geometry"], feature["properties"]
        coordinates = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        polygons = [{"outer": simplify_ring(rings[0]), "holes": [simplify_ring(ring) for ring in rings[1:]]} for rings in coordinates]
        polygons = [polygon for polygon in polygons if len(polygon["outer"]) >= 3]
        largest = max(polygons, key=lambda polygon: abs(signed_area(polygon["outer"])))
        boroughs.append({"name": properties["BoroName"], "code": properties["BoroCode"], "polygons": polygons, "label": centroid(largest["outer"])})
    return {"origin": ORIGIN, "boroughs": sorted(boroughs, key=lambda b: b["code"]),
            "source": {"title": "NYC DCP borough boundaries clipped to shoreline", "url": BOROUGHS_URL.rsplit("/query", 1)[0],
                       "attribution": "City of New York, Department of City Planning", "modifications": "Projected into local meters; shoreline simplified within 1 meter; original holes and islands retained."}}


def snap_places(roads):
    places = []
    for name, code, lon, lat in PLACE_TARGETS:
        target = project(lon, lat)
        best = None
        for road in roads:
            if road["borough"] != code or road["roadwayType"] != 1:
                continue
            for a, b in zip(road["points"], road["points"][1:]):
                distance, point = point_segment(target, a, b, interior=True)
                if best is None or distance < best[0]:
                    angle = math.atan2(b[0] - a[0], b[1] - a[1]) + (math.pi if road["oneway"] == "-1" else 0)
                    best = (distance, {"name": name, "borough": BOROUGHS[code], "x": round(point[0], 2), "z": round(point[1], 2),
                                       "angle": round(angle, 8), "street": road["name"], "roadId": road["id"]})
        if best is None or best[0] > 250:
            raise ValueError(f"No nearby constructed street for {name}")
        places.append(best[1])
    return places


def download_inputs(cache):
    cache.mkdir(parents=True, exist_ok=True)
    queries = []
    for borough in BOROUGHS:
        query = {"$select": FIELDS, "$where": f"boroughcode='{borough}' AND status='2' AND rw_type in(1,2,3,4,9,10,13) AND (trafdir != 'NV' OR trafdir IS NULL)", "$limit": 50000, "$order": "objectid"}
        queries.append((STREETS_URL + "?" + urlencode(query), cache / f"nyc-cscl-boro-{borough}.json"))
    queries.append((BOROUGHS_URL + "?" + urlencode({"where": "1=1", "outFields": "BoroCode,BoroName", "outSR": 4326, "f": "geojson"}), cache / "nyc-borough-land.geojson"))
    for url, path in queries:
        if path.exists():
            continue
        temporary = path.with_suffix(".download")
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2", "--max-time", "180", url, "--output", str(temporary)], check=True)
        json.loads(temporary.read_bytes())
        temporary.replace(path)


def build(cache, output):
    roads, sources = [], []
    for borough in BOROUGHS:
        path = cache / f"nyc-cscl-boro-{borough}.json"
        raw = path.read_bytes()
        rows = json.loads(raw)
        if not isinstance(rows, list) or not rows or len(rows) >= 50000:
            raise ValueError(f"Invalid or potentially truncated source: {path}")
        sources.append({"borough": BOROUGHS[borough], "records": len(rows), "sha256": hashlib.sha256(raw).hexdigest()})
        roads.extend(road for row in rows for road in convert_road(row))
    if len({road["id"] for road in roads}) != len(roads):
        raise ValueError("Duplicate road source IDs")
    land = convert_boroughs(json.loads((cache / "nyc-borough-land.geojson").read_bytes()))
    points = [point for road in roads for point in road["points"]]
    points.extend(point for borough in land["boroughs"] for polygon in borough["polygons"] for point in polygon["outer"])
    bounds = {"minX": math.floor(min(p[0] for p in points)) - 100, "maxX": math.ceil(max(p[0] for p in points)) + 100,
              "minZ": math.floor(min(p[1] for p in points)) - 100, "maxZ": math.ceil(max(p[1] for p in points)) + 100}
    cells = defaultdict(list)
    for road in roads:
        for key in road_cells(road):
            cells[key].append(road)
    road_directory = output / "roads"
    road_directory.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "origin": ORIGIN, "bounds": bounds, "cellSize": CELL_SIZE, "cells": {}, "places": snap_places(roads),
                "source": {"title": "NYC OTI Citywide Street Centerline (CSCL)", "url": "https://data.cityofnewyork.us/City-Government/Centerline/inkn-q76z",
                           "api": STREETS_URL, "metadata": "https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_StreetCenterline.md",
                           "attribution": "City of New York, Office of Technology and Innovation; NYC Open Data",
                           "termsUrl": "https://opendata.cityofnewyork.us/overview/#termsofuse", "snapshotDate": str(date.today()),
                           "filter": "Constructed (status 2), boroughs 1-5, vehicular streets/highways/bridges/tunnels/ramps/alleys/U-turns. Excludes nonphysical streets, trails, ferries and nonvehicular segments.",
                           "modifications": "Projected to local meters at centimeter precision; paved widths converted from feet; original centerline geometry and traffic directions retained. Whole road segments overlap cell boundaries and are deduplicated by ID at runtime.",
                           "limitations": "Grade codes describe relative roadway levels, not measured elevations. Bridge/tunnel centerlines are present but height-separated navigation requires gameplay support. Surface materials are unspecified in CSCL; rendering is illustrative.", "files": sources},
                "stats": {"roads": len(roads), "vertices": sum(len(road["points"]) for road in roads), "cells": len(cells),
                          "byBorough": {BOROUGHS[code]: count for code, count in sorted(Counter(road["borough"] for road in roads).items())},
                          "bridges": sum(road["roadwayType"] == 3 for road in roads), "tunnels": sum(road["roadwayType"] == 4 for road in roads)}}
    for (x, z), group in sorted(cells.items()):
        filename = f"{x}_{z}.json"
        blob = json.dumps({"roads": group}, separators=(",", ":"), ensure_ascii=False).encode()
        (road_directory / filename).write_bytes(blob)
        manifest["cells"][f"{x},{z}"] = {"url": "./roads/" + filename, "bounds": {"minX": x * CELL_SIZE, "maxX": (x + 1) * CELL_SIZE, "minZ": z * CELL_SIZE, "maxZ": (z + 1) * CELL_SIZE}, "count": len(group), "bytes": len(blob)}
    (output / "road-index.json").write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False) + "\n")
    (output / "boroughs.json").write_text(json.dumps(land, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(json.dumps(manifest["stats"], indent=2))
    print(f"Largest cell: {max(cell['bytes'] for cell in manifest['cells'].values()):,} bytes")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--download", action="store_true", help="Fetch any missing source files from the official public endpoints")
    args = parser.parse_args()
    if args.download:
        download_inputs(args.cache)
    build(args.cache, args.output)


if __name__ == "__main__":
    main()
