#!/usr/bin/env python3
"""Convert NYC's surveyed CityGML surfaces to browser-ready indexed geometry.

Setup: python -m pip install -r game/scripts/requirements-survey.txt
Rebuild: python game/scripts/import-survey.py
To replace the bundled extract, use --input DA12.gml --save-extract PATH.gz.
All surface vertices are measured data, including roof setbacks. No inferred
heights, replacement facades, or artificial background buildings are generated.
"""

import argparse
import gzip
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import mapbox_earcut
import numpy as np
from pyproj import Transformer


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 40.7235, "lon": -74.0015}
BBOX = [40.721, -74.005, 40.726, -73.998]
EARTH_RADIUS = 6371008.8
US_FOOT_METERS = 1200 / 3937
SOURCE_URL = "https://maps.nyc.gov/download/3dmodel/DA_WISE_GML.zip"
NS = {
    "core": "http://www.opengis.net/citygml/1.0",
    "bldg": "http://www.opengis.net/citygml/building/1.0",
    "gml": "http://www.opengis.net/gml",
    "gen": "http://www.opengis.net/citygml/generics/1.0",
}
SURFACE_TYPES = {"WallSurface": "wall", "RoofSurface": "roof", "GroundSurface": "ground"}
TO_WGS84 = Transformer.from_crs("EPSG:2263", "EPSG:4326", always_xy=True)
TO_SOURCE = Transformer.from_crs("EPSG:4326", "EPSG:2263", always_xy=True)


def project(lon, lat):
    return (
        EARTH_RADIUS * math.radians(lon - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"])),
        -EARTH_RADIUS * math.radians(lat - ORIGIN["lat"]),
    )


def source_to_local(points):
    """Match the OSM game's projection exactly, including its south-positive Z."""
    data = np.asarray(points, dtype=np.float64)
    lon, lat = TO_WGS84.transform(data[:, 0].tolist(), data[:, 1].tolist())
    lon, lat = np.asarray(lon), np.asarray(lat)
    x = EARTH_RADIUS * np.radians(lon - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"]))
    z = -EARTH_RADIUS * np.radians(lat - ORIGIN["lat"])
    return np.column_stack((x, data[:, 2] * US_FOOT_METERS, z))


def read_ring(element):
    position = element.find(".//gml:posList", NS)
    if position is None or not position.text:
        return []
    values = [float(value) for value in position.text.split()]
    if len(values) % 3:
        raise ValueError("Survey ring does not contain XYZ triples")
    points = [values[index:index + 3] for index in range(0, len(values), 3)]
    # CityGML rings repeat their first point. Earcut expects each vertex once.
    if points and points[0] == points[-1]:
        points.pop()
    return points


def triangulate_rings(rings):
    """Triangulate on the dominant plane, retaining source polygon winding.

    Walls cannot be triangulated on XZ because that projection collapses their
    height. Newell's normal selects a stable 2D plane for walls and sloped roofs.
    Interior rings are passed to Earcut so courtyard holes remain empty.
    """
    outer = np.asarray(rings[0], dtype=np.float64)
    if len(outer) < 3:
        return [], []
    following = np.roll(outer, -1, axis=0)
    normal = np.sum(np.cross(outer - outer[0], following - outer[0]), axis=0)
    if np.linalg.norm(normal) < 1e-10:
        return [], []
    coordinates = np.concatenate([np.asarray(ring, dtype=np.float64) for ring in rings])
    axes = [axis for axis in range(3) if axis != int(np.argmax(np.abs(normal)))]
    ends = np.cumsum([len(ring) for ring in rings], dtype=np.uint32)
    indices = mapbox_earcut.triangulate_float64(np.ascontiguousarray(coordinates[:, axes]), ends)
    triangles = indices.reshape((-1, 3))
    for triangle in triangles:
        a, b, c = coordinates[triangle]
        if np.dot(np.cross(b - a, c - a), normal) < 0:
            triangle[1], triangle[2] = triangle[2], triangle[1]
    return coordinates.tolist(), triangles.flatten().tolist()


def source_bounds(bbox):
    south, west, north, east = bbox
    corners = [TO_SOURCE.transform(lon, lat) for lon in (west, east) for lat in (south, north)]
    return [min(p[0] for p in corners), min(p[1] for p in corners),
            max(p[0] for p in corners), max(p[1] for p in corners)]


def intersects(points, bounds, margin_m=0):
    if not points:
        return False
    padding = margin_m / US_FOOT_METERS
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (max(xs) >= bounds[0] - padding and min(xs) <= bounds[2] + padding
            and max(ys) >= bounds[1] - padding and min(ys) <= bounds[3] + padding)


def convert_building(element, bounds, margin_m):
    polygons = []
    for boundary in element.findall("bldg:boundedBy", NS):
        for surface in boundary:
            surface_type = SURFACE_TYPES.get(surface.tag.rsplit("}", 1)[-1])
            if not surface_type:
                continue
            for polygon in surface.findall(".//gml:Polygon", NS):
                exterior = polygon.find("gml:exterior", NS)
                if exterior is None:
                    continue
                outer = read_ring(exterior)
                if len(outer) < 3:
                    continue
                holes = [read_ring(ring) for ring in polygon.findall("gml:interior", NS)]
                polygons.append((surface_type, [outer] + [hole for hole in holes if len(hole) >= 3]))
    source_points = [point for _, rings in polygons for ring in rings for point in ring]
    if not intersects(source_points, bounds, margin_m):
        return None
    attributes = {attribute.attrib["name"]: attribute.findtext("gen:value", namespaces=NS)
                  for attribute in element.findall("gen:stringAttribute", NS)}
    vertices, surfaces, footprints = [], {kind: [] for kind in SURFACE_TYPES.values()}, []
    vertex_map = {}
    base = min(point[2] for point in source_points) * US_FOOT_METERS
    maximum = max(point[2] for point in source_points) * US_FOOT_METERS
    for surface_type, rings in polygons:
        local_rings = [source_to_local(ring).tolist() for ring in rings]
        positions, indices = triangulate_rings(local_rings)
        if not indices:
            continue
        remap = []
        for point in positions:
            key = tuple(round(value, 3) for value in point)
            if key not in vertex_map:
                vertex_map[key] = len(vertices) // 3
                vertices.extend(key)
            remap.append(vertex_map[key])
        surfaces[surface_type].extend(remap[index] for index in indices)
        if surface_type == "ground":
            footprints.append({
                "outer": [[round(point[0], 3), round(point[2], 3)] for point in local_rings[0]],
                "holes": [[[round(point[0], 3), round(point[2], 3)] for point in ring]
                          for ring in local_rings[1:]],
            })
    if not vertices:
        return None
    return {
        "id": element.attrib.get(f"{{{NS['gml']}}}id"),
        "bin": attributes.get("BIN"), "doittId": attributes.get("DOITT_ID"),
        "sourceId": attributes.get("SOURCE_ID"),
        "inPlayableArea": intersects(source_points, bounds),
        "baseElevation": round(base, 3), "maxElevation": round(maximum, 3),
        "height": round(maximum - base, 3),
        "vertices": vertices, "surfaces": surfaces, "footprints": footprints,
    }


def build(input_path, margin_m=250, save_extract=None):
    bounds = source_bounds(BBOX)
    buildings = []
    opener = gzip.open if str(input_path).endswith(".gz") else open
    extract = gzip.GzipFile(filename=str(save_extract), mode="wb", mtime=0) if save_extract else None
    if extract:
        namespaces = " ".join(f'xmlns:{name}="{uri}"' for name, uri in NS.items())
        extract.write(f'<?xml version="1.0" encoding="UTF-8"?><core:CityModel {namespaces}>'.encode())
    try:
        with opener(input_path, "rb") as source:
            for _, member in ET.iterparse(source, events=("end",)):
                if member.tag != f"{{{NS['core']}}}cityObjectMember":
                    continue
                element = member.find("bldg:Building", NS)
                if element is not None:
                    converted = convert_building(element, bounds, margin_m)
                    if converted:
                        buildings.append(converted)
                        if extract:
                            extract.write(ET.tostring(member, encoding="utf-8"))
                member.clear()
    finally:
        if extract:
            extract.write(b"</core:CityModel>")
            extract.close()
    buildings.sort(key=lambda building: building["id"])
    min_x, max_z = project(BBOX[1], BBOX[0])
    max_x, min_z = project(BBOX[3], BBOX[2])
    return {
        "version": 1,
        "source": {
            "name": "NYC OTI 3-D Building Model", "surveyYear": 2014,
            "published": "2016-04-18", "url": SOURCE_URL,
            "archiveMember": "DA_WISE_GMLs/DA12_3D_Buildings_Merged.gml",
            "metadataUrl": "https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_3DBuildingModel.md",
            "termsUrl": "https://cityofnewyork.github.io/opendatatsm/publicpolicies.html",
            "attribution": "3D survey: City of New York, OTI (2014 aerial survey; published 2016).",
            "modifications": "SoHo subset; EPSG:2263 converted to local meters; polygon triangulation; 1 mm coordinate rounding. No generated heights or facades.",
            "limitations": "Untextured 2014 massing survey. Roof details are generalized; facade appearance and present-day changes are not captured.",
        },
        "origin": ORIGIN, "bbox": BBOX,
        "bounds": {"minX": round(min_x, 3), "minZ": round(min_z, 3),
                   "maxX": round(max_x, 3), "maxZ": round(max_z, 3)},
        "contextMarginMeters": margin_m,
        "coordinateSystem": {
            "source": "EPSG:2263", "sourceUnits": "US survey feet",
            "units": "meters", "x": "east", "z": "south",
            "y": "Original survey elevation converted to meters; not relative to building base.",
            "flatGameplayTransform": "To place a building on the flat playfield, subtract its baseElevation from every Y. This removes ground elevation differences between buildings, preserving each building's measured relative shape.",
        },
        "stats": {
            "buildings": len(buildings),
            "playableBuildings": sum(building["inPlayableArea"] for building in buildings),
            "triangles": sum(len(indices) // 3 for building in buildings for indices in building["surfaces"].values()),
        },
        "buildings": buildings,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "data/soho-survey.gml.gz")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/survey.json")
    parser.add_argument("--context-meters", type=float, default=250)
    parser.add_argument("--save-extract", type=Path)
    args = parser.parse_args()
    result = build(args.input, args.context_meters, args.save_extract)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps({**result["stats"], "bytes": args.output.stat().st_size, "output": str(args.output)}))


if __name__ == "__main__":
    main()
