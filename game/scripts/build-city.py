#!/usr/bin/env python3
"""Build the playable SoHo database from an attributed OpenStreetMap extract.

Coordinates are local meters: +X east, +Z south. All geometry is from OSM;
unknown heights are reproducible estimates, recorded on each building.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET


ORIGIN = {"lat": 40.7235, "lon": -74.0015}
EARTH_RADIUS = 6371008.8
DRIVABLE = {"residential", "unclassified", "living_street", "tertiary", "secondary", "primary", "trunk", "service"}
WIDTHS = {"residential": 11, "unclassified": 11, "living_street": 9, "tertiary": 14, "secondary": 18, "primary": 20, "trunk": 22, "service": 7}


def project(lat, lon, origin=ORIGIN):
    """Equirectangular local projection, accurate to centimeters at this scale."""
    x = EARTH_RADIUS * math.radians(lon - origin["lon"]) * math.cos(math.radians(origin["lat"]))
    z = -EARTH_RADIUS * math.radians(lat - origin["lat"])
    return [round(x, 3), round(z, 3)]


def tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def length_value(value):
    """Read OSM metric/feet lengths; invalid strings remain unknown."""
    if not value:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(m|ft|feet|')?\s*", value)
    if not match:
        return None
    result = float(match[1]) * (0.3048 if match[2] in {"ft", "feet", "'"} else 1)
    return result if result > 0 else None


def building_dimensions(tag_map, identifier):
    height = length_value(tag_map.get("height"))
    levels = length_value(tag_map.get("building:levels"))
    if height is not None:
        source = "osm:height"
    elif levels is not None:
        height = levels * 3.4 + 1.2
        source = "osm:building:levels"
    else:
        # A stable digest avoids Python's randomized hash changing the city.
        height = 15 + int(hashlib.sha256(str(identifier).encode()).hexdigest()[:8], 16) % 151 / 10
        source = "estimated"
    floors = max(1, round(levels if levels is not None else (height - 1.2) / 3.4))
    return {"height": round(height, 2), "floors": floors, "heightEstimated": source != "osm:height", "heightSource": source}


def point_in_polygon(point, polygon):
    x, z = point
    inside = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > z) != (b[1] > z):
            at_x = (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]
            if x < at_x:
                inside = not inside
    return inside


def segment_distance(point, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    denom = dx * dx + dz * dz
    t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / denom)) if denom else 0
    return math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz)


def polygon_area(polygon):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(polygon, polygon[1:] + polygon[:1]))) / 2


def clip_segment(a, b, bounds):
    """Liang-Barsky clipping preserves intersections at the extract boundary."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    start, end = 0.0, 1.0
    for p, q in ((-dx, a[0] - bounds["minX"]), (dx, bounds["maxX"] - a[0]),
                 (-dz, a[1] - bounds["minZ"]), (dz, bounds["maxZ"] - a[1])):
        if abs(p) < 1e-12:
            if q < 0:
                return None
        elif p < 0:
            start = max(start, q / p)
        else:
            end = min(end, q / p)
        if start > end:
            return None
    result = [[round(a[0] + t * dx, 3), round(a[1] + t * dz, 3)] for t in (start, end)]
    return result if math.dist(*result) > 0.01 else None


def clip_polyline(points, bounds):
    paths, path = [], []
    for a, b in zip(points, points[1:]):
        clipped = clip_segment(a, b, bounds)
        if clipped is None:
            if path:
                paths.append(path)
                path = []
            continue
        if path and math.dist(path[-1], clipped[0]) < 0.01:
            path.append(clipped[1])
        else:
            if path:
                paths.append(path)
            path = clipped
    if path:
        paths.append(path)
    return paths


def in_bounds(point, bounds, margin=0):
    return bounds["minX"] + margin <= point[0] <= bounds["maxX"] - margin and bounds["minZ"] + margin <= point[1] <= bounds["maxZ"] - margin


def footprint_intersects(polygon, bounds):
    if any(in_bounds(point, bounds) for point in polygon):
        return True
    if any(clip_segment(a, b, bounds) for a, b in zip(polygon, polygon[1:] + polygon[:1])):
        return True
    return point_in_polygon([bounds["minX"], bounds["minZ"]], polygon)


def join_rings(chains):
    """Join relation members using shared OSM node IDs, in either orientation."""
    remaining = [list(chain) for chain in chains if len(chain) > 1]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        while ring[0] != ring[-1]:
            for index, chain in enumerate(remaining):
                if ring[-1] == chain[0]:
                    ring.extend(chain[1:])
                elif ring[-1] == chain[-1]:
                    ring.extend(reversed(chain[:-1]))
                else:
                    continue
                remaining.pop(index)
                break
            else:
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def clear_of_buildings(point, buildings, clearance=3):
    for building in buildings:
        polygon = building["polygon"]
        # Cheap bounds pruning matters when sampling many road points.
        if not (min(p[0] for p in polygon) - clearance <= point[0] <= max(p[0] for p in polygon) + clearance
                and min(p[1] for p in polygon) - clearance <= point[1] <= max(p[1] for p in polygon) + clearance):
            continue
        if point_in_polygon(point, polygon):
            return False
        if any(segment_distance(point, a, b) < clearance for a, b in zip(polygon, polygon[1:] + polygon[:1])):
            return False
    return True


def road_candidates(roads, buildings, bounds):
    candidates = []
    for road in roads:
        if road["kind"] == "service":
            continue
        for a, b in zip(road["points"], road["points"][1:]):
            distance = math.dist(a, b)
            # Dense deterministic sampling keeps missions on the real street graph.
            steps = max(1, math.ceil(distance / 14))
            for index in range(steps):
                fraction = (index + 0.5) / steps
                point = [round(a[i] + (b[i] - a[i]) * fraction, 3) for i in (0, 1)]
                if in_bounds(point, bounds, 28) and clear_of_buildings(point, buildings):
                    candidates.append({"x": point[0], "z": point[1], "name": road["name"], "roadId": road["id"],
                                       "angle": math.atan2(b[0] - a[0], b[1] - a[1])})
    return candidates


def build_city(source):
    root = ET.parse(source).getroot()
    bbox = root.find("bounds")
    if bbox is None:
        raise ValueError("OSM extract must include bounds")
    southwest = project(float(bbox.attrib["minlat"]), float(bbox.attrib["minlon"]))
    northeast = project(float(bbox.attrib["maxlat"]), float(bbox.attrib["maxlon"]))
    bounds = {"minX": southwest[0], "maxX": northeast[0], "minZ": northeast[1], "maxZ": southwest[1]}
    nodes = {element.attrib["id"]: project(float(element.attrib["lat"]), float(element.attrib["lon"])) for element in root.findall("node")}
    ways = {element.attrib["id"]: element for element in root.findall("way")}
    references = {identifier: [node.attrib["ref"] for node in element.findall("nd")] for identifier, element in ways.items()}
    roads = []
    for identifier, element in ways.items():
        tag_map = tags(element)
        kind = tag_map.get("highway")
        if kind not in DRIVABLE or tag_map.get("area") == "yes":
            continue
        if any(tag_map.get(key) in {"no", "private"} for key in ("access", "vehicle", "motor_vehicle")):
            continue
        if tag_map.get("service") in {"driveway", "parking_aisle"} or tag_map.get("tunnel") == "yes":
            continue
        # Missing extract nodes must break a way, never create a false shortcut.
        runs, run = [], []
        for reference in references[identifier]:
            if reference in nodes:
                run.append(nodes[reference])
            elif run:
                runs.append(run)
                run = []
        if run:
            runs.append(run)
        paths = [path for run in runs for path in clip_polyline(run, bounds)]
        for index, points in enumerate(paths):
            direction = tag_map.get("oneway", "no")
            if direction == "-1":
                points.reverse()
            roads.append({"id": identifier if len(paths) == 1 else f"{identifier}:{index}",
                          "name": tag_map.get("name", "Service road"), "points": points,
                          "width": round(length_value(tag_map.get("width")) or WIDTHS[kind], 2),
                          "surface": tag_map.get("surface", "asphalt"), "oneway": direction in {"yes", "1", "true", "-1"}, "kind": kind})

    buildings, relation_members = [], set()

    def add_building(identifier, node_ids, tag_map, is_part=False):
        if len(node_ids) < 4 or node_ids[0] != node_ids[-1] or any(ref not in nodes for ref in node_ids):
            return
        polygon = [nodes[ref] for ref in node_ids[:-1]]
        if polygon_area(polygon) < 12 or not footprint_intersects(polygon, bounds):
            return
        buildings.append({"id": identifier, "name": tag_map.get("name", ""), "polygon": polygon,
                          **building_dimensions(tag_map, identifier), "kind": tag_map.get("building", "yes"), "_part": is_part})

    for relation in root.findall("relation"):
        tag_map = tags(relation)
        if tag_map.get("building") in {None, "no"} or tag_map.get("type") != "multipolygon":
            continue
        outer_ids = [member.attrib["ref"] for member in relation.findall("member")
                     if member.attrib["type"] == "way" and member.attrib.get("role", "outer") in {"", "outer"}]
        rings = join_rings([references[ref] for ref in outer_ids if ref in references])
        if rings:
            relation_members.update(outer_ids)
        for index, ring in enumerate(rings):
            add_building(f"relation:{relation.attrib['id']}:{index}", ring, tag_map)
    for identifier, element in ways.items():
        tag_map = tags(element)
        if identifier in relation_members or tag_map.get("building") in {None, "no"}:
            continue
        add_building(identifier, references[identifier], tag_map, tag_map.get("building:part") not in {None, "no"})
    outlines = [building for building in buildings if not building["_part"]]
    filtered = []
    for building in buildings:
        if building["_part"]:
            # Keep standalone parts, but avoid rendering them over a parent outline.
            polygon = building["polygon"]
            center = [sum(p[i] for p in polygon) / len(polygon) for i in (0, 1)]
            if any(point_in_polygon(center, outline["polygon"]) for outline in outlines):
                continue
        del building["_part"]
        filtered.append(building)
    buildings = filtered

    candidates = road_candidates(roads, buildings, bounds)
    if len(candidates) < 7:
        raise ValueError("Not enough safe street positions for the playable area")
    # Start near Greene/Prince using actual surveyed street coordinates.
    target = project(40.72458, -74.00034)
    spawn_candidates = [c for c in candidates if c["name"] == "Greene Street"] or candidates
    spawn = min(spawn_candidates, key=lambda c: math.dist([c["x"], c["z"]], target)).copy()
    selected = [spawn]
    missions = []
    for _ in range(6):
        unused = [c for c in candidates if c["name"] not in {p["name"] for p in selected}]
        pool = unused or [c for c in candidates if c not in selected]
        chosen = max(pool, key=lambda c: min(math.hypot(c["x"] - p["x"], c["z"] - p["z"]) for p in selected))
        selected.append(chosen)
        missions.append({"x": chosen["x"], "z": chosen["z"], "name": chosen["name"], "roadId": chosen["roadId"]})
    landmarks = []
    for building in buildings:
        if building["name"]:
            polygon = building["polygon"]
            center = [round(sum(p[i] for p in polygon) / len(polygon), 3) for i in (0, 1)]
            if in_bounds(center, bounds):
                landmarks.append({"x": center[0], "z": center[1], "name": building["name"], "kind": "building", "buildingId": building["id"]})
    return {"name": "SoHo", "origin": ORIGIN, "bounds": bounds, "roads": roads, "buildings": buildings,
            "spawn": spawn, "missionPoints": missions, "landmarks": landmarks,
            "attribution": {"text": "© OpenStreetMap contributors", "url": "https://www.openstreetmap.org/copyright", "license": "ODbL 1.0"},
            "sourceBounds": {"south": float(bbox.attrib["minlat"]), "west": float(bbox.attrib["minlon"]), "north": float(bbox.attrib["maxlat"]), "east": float(bbox.attrib["maxlon"])},
            "geometryNotes": "Real OSM road centerlines and building footprints. Road widths may use road-class defaults. Heights without height tags are estimated from levels or a deterministic 15–30 m fallback. Building courtyards are filled for collision geometry."}


def main():
    base = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=base / "data" / "soho.osm")
    parser.add_argument("--output", type=Path, default=base / "dist" / "city.json")
    args = parser.parse_args()
    city = build_city(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(city, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {args.output}: {len(city['roads'])} road sections, {len(city['buildings'])} footprints, {len(city['landmarks'])} named landmarks")


if __name__ == "__main__":
    main()
