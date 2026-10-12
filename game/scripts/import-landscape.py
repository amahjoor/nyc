#!/usr/bin/env python3
"""Reconstruct measured NYC terrain, water and LiDAR-segmented tree crowns.

Dependencies: numpy rasterio pyproj shapely pyshp py7zr (install in a venv).
First build: python scripts/import-landscape.py --download --cache /tmp/nyc-landscape
Repeat offline from the same cache. --bbox W S E N --region-id ID imports another
bounded region while retaining earlier regions in the index. Source downloads
remain outside the game: only sampled grids and clipped source features ship.
Use --all-regions to reproduce the five shipped borough demonstration areas.
"""

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import subprocess
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 40.7235, "lon": -74.0015}
EARTH_RADIUS = 6371008.8
CITY_BBOX = [-74.28, 40.48, -73.68, 40.93]
PILOT_BBOX = [-73.9808, 40.7642, -73.9698, 40.7732]
REGIONS = [
    {"id": "central-park-south", "name": "Central Park · The Pond", "borough": "Manhattan", "bbox": PILOT_BBOX},
    {"id": "prospect-lake", "name": "Brooklyn · Prospect Lake", "borough": "Brooklyn", "bbox": [-73.973, 40.653, -73.9655, 40.6585]},
    {"id": "meadow-lake", "name": "Queens · Meadow Lake", "borough": "Queens", "bbox": [-73.846, 40.733, -73.8385, 40.7385]},
    {"id": "bronx-garden", "name": "Bronx · Botanical Garden", "borough": "Bronx", "bbox": [-73.8815, 40.8603, -73.874, 40.8658]},
    {"id": "clove-lake", "name": "Staten Island · Clove Lake", "borough": "Staten Island", "bbox": [-74.114, 40.6145, -74.1065, 40.6200]},
]
DEM = "https://elevation.its.ny.gov/arcgis/rest/services/NYC_TopoBathymetric_2017_1_meter/ImageServer"
WATER = "https://data.cityofnewyork.us/resource/pjs3-c3z5.json"
CROWNS_DOI = "https://doi.org/10.6084/m9.figshare.20522895.v2"
FILES = {
    "NY_CHM_10Int260m.tif": ("https://ndownloader.figshare.com/files/36733827", 243383277, "84e375d1ecfd090c8f5425a38fc6e957"),
    "TreeSeg.7z": ("https://ndownloader.figshare.com/files/36735456", 205333511, "88d2bd29782d1a667fd8b6817cefca61"),
}


def finite(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def validate_bbox(bbox):
    if len(bbox) != 4 or not all(finite(v) for v in bbox):
        raise ValueError("A bounding box needs four finite coordinates")
    w, s, e, n = bbox
    if not (CITY_BBOX[0] <= w < e <= CITY_BBOX[2] and CITY_BBOX[1] <= s < n <= CITY_BBOX[3]):
        raise ValueError("Bounding box must be inside NYC coverage")
    return list(bbox)


def validate_region_id(region_id):
    if not isinstance(region_id, str) or not region_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in region_id):
        raise ValueError("Region id may contain lowercase letters, digits, hyphens and underscores")
    return region_id


def project(lon, lat):
    if not finite(lon) or not finite(lat):
        raise ValueError("Coordinates must be finite")
    return [EARTH_RADIUS * math.radians(lon - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"])),
            -EARTH_RADIUS * math.radians(lat - ORIGIN["lat"])]


def unproject(x, z):
    return [ORIGIN["lon"] + math.degrees(x / EARTH_RADIUS) / math.cos(math.radians(ORIGIN["lat"])),
            ORIGIN["lat"] - math.degrees(z / EARTH_RADIUS)]


def local_bounds(bbox):
    w, s, e, n = validate_bbox(bbox)
    min_x, min_z = project(w, n)
    max_x, max_z = project(e, s)
    return {"minX": min_x, "maxX": max_x, "minZ": min_z, "maxZ": max_z}


def export_query(bbox, width, height):
    validate_bbox(bbox)
    if not isinstance(width, int) or not isinstance(height, int) or min(width, height) < 2:
        raise ValueError("Terrain grids require at least two nodes per axis")
    w, s, e, n = bbox
    dx, dy = (e - w) / (width - 1), (n - s) / (height - 1)
    # ArcGIS exports pixel centers. Half a cell of padding makes those centers
    # land exactly on mesh nodes, including both geographic boundary endpoints.
    return {"bbox": ",".join(map(str, [w - dx / 2, s - dy / 2, e + dx / 2, n + dy / 2])),
            "bboxSR": 4326, "imageSR": 4326, "size": f"{width},{height}", "adjustAspectRatio": "false",
            "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation", "f": "json"}


def compact_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()
    path.write_bytes(raw)
    return len(raw)


def digest(path, algorithm="sha256"):
    value = hashlib.new(algorithm)
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def fetch(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".download")
    try:
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2",
                        "--max-time", "600", url, "--output", str(temporary)], check=True)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def acquire_dem(cache, label, bbox, width, height, download):
    target = cache / f"{label}-dem.tif"
    metadata = cache / f"{label}-dem-export.json"
    url = DEM + "/exportImage?" + urlencode(export_query(bbox, width, height))
    if not target.exists() or not metadata.exists():
        if not download:
            raise FileNotFoundError(f"Missing {label} DEM; rerun with --download")
        response_path = cache / f"{label}-dem-response.json"
        fetch(url, response_path)
        response = json.loads(response_path.read_bytes())
        if not response.get("href") or response.get("width") != width or response.get("height") != height:
            raise ValueError(f"Invalid DEM response: {response}")
        fetch(response["href"].replace("http:", "https:"), target)
        compact_write(metadata, {"url": url, "result": response})
    cached = json.loads(metadata.read_bytes())
    if cached["url"] != url:
        raise ValueError(f"Cached {label} DEM has different dimensions/bounds; use a new cache region id")
    return target, cached


def decode_terrain(path, bbox, width, height):
    import numpy as np
    import rasterio
    with rasterio.open(path) as raster:
        if raster.count != 1 or raster.width != width or raster.height != height or raster.crs.to_epsg() != 4326:
            raise ValueError("DEM must be a single-band WGS84 raster of the requested size")
        first, last = raster.xy(0, 0), raster.xy(height - 1, width - 1)
        expected = [bbox[0], bbox[3], bbox[2], bbox[1]]
        if any(abs(a - b) > 1e-8 for a, b in zip([*first, *last], expected)):
            raise ValueError("DEM pixel centers do not align with the requested mesh nodes")
        data = raster.read(1, masked=True)
        values = data.filled(float("nan")).astype(float)
        valid = np.isfinite(values) & (values > -100) & (values < 300)
        if valid.sum() < values.size * 0.8:
            raise ValueError("DEM has insufficient measured coverage")
        heights = [round(float(v), 3) if ok else None for v, ok in zip(values.flat, valid.flat)]
    return {"version": 1, "bounds": local_bounds(bbox), "width": width, "height": height, "heights": heights,
            "units": "meters", "verticalDatum": "NAVD88 Geoid 12B", "noData": None,
            "nodeOrder": "row-major; north/minZ first; nodes include bounds", "sourceId": "nyc-dem-2017",
            "sourceSha256": digest(path), "range": [float(values[valid].min()), float(values[valid].max())]}


def sample_height(grid, x, z):
    b, width, height = grid["bounds"], grid["width"], grid["height"]
    if not b["minX"] <= x <= b["maxX"] or not b["minZ"] <= z <= b["maxZ"]:
        return None
    u = (x - b["minX"]) / (b["maxX"] - b["minX"]) * (width - 1)
    v = (z - b["minZ"]) / (b["maxZ"] - b["minZ"]) * (height - 1)
    i, j = min(width - 2, int(u)), min(height - 2, int(v))
    a, c = u - i, v - j
    entries = [(j * width + i, (1 - a) * (1 - c)), (j * width + i + 1, a * (1 - c)),
               ((j + 1) * width + i, (1 - a) * c), ((j + 1) * width + i + 1, a * c)]
    if any(grid["heights"][index] is None and weight > 1e-12 for index, weight in entries):
        return None
    return sum((grid["heights"][index] or 0) * weight for index, weight in entries)


def local_polygon(polygon, transform):
    def ring(points):
        result = [[round(v, 3) for v in transform(*point[:2])] for point in points]
        if result[0] == result[-1]:
            result.pop()
        return result
    return {"polygon": ring(polygon.exterior.coords), "holes": [ring(hole.coords) for hole in polygon.interiors]}


def canopy_height_statistics(raw_decimeters):
    """Filter documented CHM values and apply the paper's >=5m tree criterion."""
    values = sorted(value / 10 for value in raw_decimeters if finite(value) and 20 <= value <= 600)
    if len(values) < 2 or values[-1] < 5:
        return None
    p10_index = (len(values) - 1) * 0.1
    low, high = math.floor(p10_index), math.ceil(p10_index)
    p10 = values[low] + (values[high] - values[low]) * (p10_index - low)
    return {"maxHeight": round(values[-1], 2), "meanHeight": round(sum(values) / len(values), 2),
            "p10Height": round(p10, 2), "heightSamples": len(values)}


def choose_land_view(grid, water, preferred):
    """Place the preview on measured dry ground, never at a lake's bbox center."""
    from shapely.geometry import Point, Polygon
    shores = [Polygon(feature["polygon"], feature["holes"]).buffer(6) for feature in water]

    def dry(x, z):
        return sample_height(grid, x, z) is not None and not any(polygon.covers(Point(x, z)) for polygon in shores)

    px, pz = preferred
    if dry(px, pz):
        return {"x": px, "z": pz, "heading": 0}
    for radius in range(10, 501, 10):
        for angle in range(32):
            theta = angle * math.tau / 32
            x, z = px + math.cos(theta) * radius, pz + math.sin(theta) * radius
            if dry(x, z):
                return {"x": round(x, 3), "z": round(z, 3), "heading": math.atan2(px - x, pz - z)}
    raise ValueError("No measured dry preview point within 500m; choose a region with a shoreline")


def water_features(rows, grid, bbox):
    import numpy as np
    from shapely.geometry import shape, box, Point
    region = box(*bbox)
    records = []
    for row in rows:
        # Marshes, beaches and bathymetric river/ocean bottoms are not open lake
        # surfaces. Never turn those classes into falsely measured water planes.
        if str(row.get("feat_code")) not in ("2600", "2610"):
            continue
        geometry = shape(row["the_geom"])
        if not geometry.is_valid:
            raise ValueError(f"Invalid official water geometry {row.get('row_id')}")
        if not geometry.intersects(region):
            continue
        parts = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
        for part_index, polygon in enumerate(parts):
            if not polygon.intersects(region):
                continue
            clipped = polygon.intersection(region)
            parts_clipped = list(clipped.geoms) if clipped.geom_type == "MultiPolygon" else [clipped]
            for subpart, area in enumerate(parts_clipped):
                if area.geom_type != "Polygon" or area.is_empty:
                    continue
                local = local_polygon(area, project)
                # Use only grid nodes strictly inside the surveyed water polygon;
                # shoreline points can sample a raised bank instead of water.
                measurements = []
                bounds, w, h = grid["bounds"], grid["width"], grid["height"]
                min_x, min_z = project(area.bounds[0], area.bounds[3])
                max_x, max_z = project(area.bounds[2], area.bounds[1])
                col0 = max(0, math.ceil((min_x - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * (w - 1)))
                col1 = min(w - 1, math.floor((max_x - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * (w - 1)))
                row0 = max(0, math.ceil((min_z - bounds["minZ"]) / (bounds["maxZ"] - bounds["minZ"]) * (h - 1)))
                row1 = min(h - 1, math.floor((max_z - bounds["minZ"]) / (bounds["maxZ"] - bounds["minZ"]) * (h - 1)))
                for j in range(row0, row1 + 1):
                    for i in range(col0, col1 + 1):
                        x = bounds["minX"] + i / (w - 1) * (bounds["maxX"] - bounds["minX"])
                        z = bounds["minZ"] + j / (h - 1) * (bounds["maxZ"] - bounds["minZ"])
                        value = grid["heights"][j * w + i]
                        if value is not None and area.contains(Point(*unproject(x, z))):
                            measurements.append(value)
                # Require several agreeing samples. A coarse grid or a changed
                # pond outline cannot establish a water level; keep it unknown.
                level = None
                if len(measurements) >= 3 and float(np.percentile(measurements, 75) - np.percentile(measurements, 25)) <= 0.25:
                    level = round(float(np.median(measurements)), 3)
                records.append({"id": f"water:{row['row_id']}:{part_index}:{subpart}", **local,
                                "sourceId": "nyc-water-2022", "sourceFeatureId": str(row["source_id"]),
                                "name": row.get("name", "unset"), "featureCode": int(row["feat_code"]),
                                "elevation": level, "elevationSamples": len(measurements),
                                "elevationMethod": "median of interior 2017 hydroflattened DEM samples; unknown when sparse or inconsistent"})
    return records


def acquire_sources(cache, download):
    for name, (url, size, md5) in FILES.items():
        path = cache / name
        if not path.exists():
            if not download:
                raise FileNotFoundError(f"Missing {name}; rerun with --download")
            fetch(url, path)
        if path.stat().st_size != size or digest(path, "md5") != md5:
            raise ValueError(f"Source checksum mismatch: {name}")
    water_path = cache / "nyc-water.json"
    if not water_path.exists():
        if not download:
            raise FileNotFoundError("Missing NYC water source; rerun with --download")
        fetch(WATER + "?" + urlencode({"$limit": 10000, "$select": ":id as row_id,the_geom,name,source_id,feat_code,sub_code,status"}), water_path)
    rows = json.loads(water_path.read_bytes())
    if not isinstance(rows, list) or not 1000 < len(rows) < 10000:
        raise ValueError("Water response is empty, invalid or potentially truncated")
    return rows


def extract_crowns(cache):
    import py7zr
    target = cache / "crowns"
    marker = target / ".complete"
    if not marker.exists():
        target.mkdir(parents=True, exist_ok=True)
        with py7zr.SevenZipFile(cache / "TreeSeg.7z", "r") as archive:
            # The pinned public archive should never escape the source cache.
            if any(Path(name).is_absolute() or ".." in Path(name).parts for name in archive.getnames()):
                raise ValueError("Unsafe tree archive path")
            archive.extractall(target)
        marker.write_text("verified source archive extracted\n")
    return sorted(target.rglob("*.shp"))


def canopy_features(cache, grid, bbox, region_id="central-park-south"):
    import rasterio
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds
    from pyproj import CRS, Transformer
    import shapefile
    from shapely.geometry import shape, box, mapping
    from shapely.ops import transform as transform_geometry
    region = box(*bbox)
    result, references, stats = [], [], Counter()
    with rasterio.open(cache / "NY_CHM_10Int260m.tif") as raster:
        for shp_path in extract_crowns(cache):
            source_crs = CRS.from_wkt(shp_path.with_suffix(".prj").read_text())
            to_source = Transformer.from_crs(4326, source_crs, always_xy=True)
            source_wgs = Transformer.from_crs(source_crs, 4326, always_xy=True)
            source_chm = Transformer.from_crs(source_crs, raster.crs, always_xy=True)
            source_region = transform_geometry(to_source.transform, region)
            with shapefile.Reader(str(shp_path)) as reader:
                if not box(*reader.bbox).intersects(source_region):
                    continue
                for feature in reader.iterShapeRecords(bbox=source_region.bounds):
                    stats["candidates"] += 1
                    geometry = shape(feature.shape.__geo_interface__)
                    if not geometry.is_valid:
                        stats["invalidSkipped"] += 1
                        continue
                    geo = transform_geometry(source_wgs.transform, geometry)
                    if not geo.intersects(region):
                        continue
                    # Retain whole source crowns at the border. The renderer can
                    # fade region edges; clipping would change measured crown size.
                    chm_polygon = transform_geometry(source_chm.transform, geometry)
                    window = from_bounds(*chm_polygon.bounds, raster.transform).round_offsets().round_lengths()
                    if window.width < 1 or window.height < 1:
                        stats["smallSkipped"] += 1
                        continue
                    band = raster.read(1, window=window, boundless=True, fill_value=0)
                    mask = geometry_mask([mapping(chm_polygon)], out_shape=band.shape,
                                         transform=raster.window_transform(window), invert=True)
                    # The published CHM is decimeters, not meters. Values outside
                    # its documented 2–60m vegetation range are excluded entirely.
                    # The paper's final individual-tree inventory excludes crowns
                    # below 5m. The distributed segmentation archive also contains
                    # shorter vegetation; do not reinterpret those shrubs as trees.
                    heights = canopy_height_statistics(band[mask].astype(float).tolist())
                    if heights is None:
                        stats["shortOrUnmeasuredVegetationSkipped"] += 1
                        continue
                    parts = list(geo.geoms) if geo.geom_type == "MultiPolygon" else [geo]
                    for part_id, polygon in enumerate(parts):
                        point = polygon.representative_point()
                        x, z = project(point.x, point.y)
                        base = sample_height(grid, x, z)
                        if base is None:
                            stats["outsideGroundSkipped"] += 1
                            continue
                        record_id = f"canopy:{shp_path.stem}:{feature.shape.oid}:{part_id}"
                        result.append({"id": record_id, **local_polygon(polygon, project), **heights,
                                       "height": heights["maxHeight"], "x": round(x, 3), "z": round(z, 3),
                                       "baseElevation": round(base, 3), "sourceId": "ma-nyc-crowns-2022", "individualTree": True,
                                       "sourceFeatureId": str(feature.shape.oid), "sourceLayer": shp_path.stem})
                        references.append({"type": "Feature", "geometry": mapping(polygon),
                                           "properties": {"id": record_id, **heights, "sourceId": "ma-nyc-crowns-2022"}})
    collection = {"type": "FeatureCollection", "features": references}
    compact_write(cache / f"{region_id}-canopies.geojson", collection)
    if region_id == "central-park-south":
        compact_write(cache / "pilot-canopies.geojson", collection)
    print("Canopy import:", dict(stats), "retained", len(result))
    return result


def build(cache, output, bbox=PILOT_BBOX, region_id="central-park-south", name="Central Park · The Pond", download=False):
    validate_bbox(bbox)
    validate_region_id(region_id)
    b = local_bounds(bbox)
    if (b["maxX"] - b["minX"]) * (b["maxZ"] - b["minZ"]) > 16_000_000:
        raise ValueError("Import regions no larger than 16 square kilometers; use multiple tiled regions")
    cache.mkdir(parents=True, exist_ok=True)
    print(f"Importing {region_id} from verified measured sources", flush=True)
    rows = acquire_sources(cache, download)
    base_path, base_export = acquire_dem(cache, "nyc", CITY_BBOX, 801, 701, download)
    fine_path, fine_export = acquire_dem(cache, region_id, bbox, 257, 257, download)
    base = decode_terrain(base_path, CITY_BBOX, 801, 701)
    fine = decode_terrain(fine_path, bbox, 257, 257)
    base["sourceQuery"], fine["sourceQuery"] = base_export["url"], fine_export["url"]
    features = {"version": 1, "water": water_features(rows, fine, bbox), "canopies": canopy_features(cache, fine, bbox, region_id)}
    # Water outside the pilot is still source geometry. Unknown elevations stay
    # null rather than borrowing a bank height from a coarse terrain grid.
    base_features = {"version": 1, "water": water_features(rows, base, CITY_BBOX), "canopies": []}
    out = output / "landscape"
    paths = {"base": out / "nyc-terrain.json", "fine": out / f"{region_id}-terrain.json",
             "features": out / f"{region_id}-features.json", "baseFeatures": out / "nyc-water.json"}
    sizes = {key: compact_write(paths[key], data) for key, data in
             [("base", base), ("fine", fine), ("features", features), ("baseFeatures", base_features)]}
    source = {"nyc-dem-2017": {"title": "NYC 2017 topobathymetric LiDAR DEM", "url": DEM,
              "captureDates": "2017-05-03 through 2017-07-26", "verticalDatum": "NAVD88 Geoid 12B", "units": "meters",
              "attribution": "City of New York; Quantum Spatial; NYS ITS Geospatial Services",
              "metadata": "https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_LiDAR_Summary.md",
              "baseQuery": base_export["url"],
              "limitations": "Bare-earth LiDAR sampled onto regular grids. Water can be hydroflattened or bathymetric. Ground under dense vegetation may be interpolated. Capture predates the 2024 aerial photographs."},
              "nyc-water-2022": {"title": "NYC OTI 2022 Planimetric Hydrography", "url": "https://data.cityofnewyork.us/d/pjs3-c3z5",
              "captureYear": 2022, "attribution": "City of New York, Office of Technology and Innovation",
              "sha256": digest(cache / "nyc-water.json"), "records": len(rows),
              "limitations": "Mapped lake and pond boundaries only. Mean water level is not asserted where DEM samples are sparse or disagree. Elevation and outline surveys have different dates."},
              "ma-nyc-crowns-2022": {"title": "Trees in New York City", "url": CROWNS_DOI,
              "citation": "Ma, Qin (2022). Trees in New York City. figshare. https://doi.org/10.6084/m9.figshare.20522895.v2",
              "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/", "publicationDate": "2022-12-29",
              "captureDates": "2013-08-05 and 2014-03 through 2014-04",
              "paper": "https://www.nature.com/articles/s41597-023-02000-w",
              "heightStatisticsMeaning": "p10Height, meanHeight and maxHeight describe the upper canopy surface relative to ground, not crown underside or trunk dimensions",
              "attribution": "Qin Ma (2022), Trees in New York City, CC BY 4.0",
              "sourceFiles": [{"name": key, "url": value[0], "bytes": value[1], "md5": value[2], "sha256": digest(cache / key)} for key, value in FILES.items()],
              "modifications": "Clipped by region selection, projected to local meters, CHM decimeters converted to meters; crown height statistics sampled within original source polygon. Browser crown envelopes are geometric approximations, not measured individual branches.",
              "limitations": "Individual crowns segmented from 2013–2014 LiDAR using marker-controlled watershed; published in 2022. Crown boundaries and height samples can contain segmentation errors. Approximate rendered crown undersides and trunks are not measurements. No species, branch or current tree-presence claim is inferred."}}
    manifest_path = output / "landscape-index.json"
    previous = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else {}
    regions = [region for region in previous.get("regions", []) if region["id"] != region_id]
    for region in regions:
        export_path = cache / f"{region['id']}-dem-export.json"
        if export_path.exists():
            region["terrainSourceQuery"] = json.loads(export_path.read_bytes())["url"]
    view_x, view_z = project(-73.9756, 40.7656) if region_id == "central-park-south" else project((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
    regions.append({"id": region_id, "name": name, "bounds": fine["bounds"], "bbox": bbox,
                    "terrainUrl": f"./landscape/{paths['fine'].name}", "featuresUrl": f"./landscape/{paths['features'].name}",
                    "terrainSourceQuery": fine_export["url"],
                    "sourceId": "nyc-dem-2017", "view": choose_land_view(fine, features["water"], [view_x, view_z]),
                    "stats": {"water": len(features["water"]), "canopies": len(features["canopies"]), "terrainNodes": len(fine["heights"])}})
    region_info = {region["id"]: region for region in REGIONS}
    region_order = {region["id"]: i for i, region in enumerate(REGIONS)}
    for region in regions:
        if region["id"] in region_info:
            region["borough"] = region_info[region["id"]]["borough"]
    regions.sort(key=lambda region: (region_order.get(region["id"], len(REGIONS)), region["id"]))
    manifest = {"version": 1, "origin": ORIGIN, "name": "Measured NYC landscape reconstruction", "sources": source,
                "baseTerrain": {"url": "./landscape/nyc-terrain.json", "bounds": base["bounds"], "resolution": 72},
                "baseFeaturesUrl": "./landscape/nyc-water.json", "regions": regions,
                "stats": {"bytes": sum(file.stat().st_size for file in out.glob("*.json")), "baseTerrainNodes": len(base["heights"]), "mappedWaterBodies": len(base_features["water"]),
                          "canopies": sum(region["stats"]["canopies"] for region in regions)}}
    compact_write(manifest_path, manifest)
    print(json.dumps({"region": region_id, "sizes": sizes, "stats": manifest["stats"]}, indent=2))
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/nyc-landscape"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--all-regions", action="store_true", help="Rebuild all five shipped borough demonstration regions")
    parser.add_argument("--bbox", nargs=4, type=float, default=PILOT_BBOX)
    parser.add_argument("--region-id", default="central-park-south")
    parser.add_argument("--name", default="Central Park · The Pond")
    args = parser.parse_args(argv)
    if args.all_regions:
        for region in REGIONS:
            build(args.cache, args.output, region["bbox"], region["id"], region["name"], args.download)
    else:
        build(args.cache, args.output, args.bbox, args.region_id, args.name, args.download)


if __name__ == "__main__":
    main()
