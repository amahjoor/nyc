#!/usr/bin/env python3
"""Build a park from what is measured and mapped inside it: its ground, its water, its trees and what covers the ground.

The aerial photograph is no guide to a park: it was taken in March. For each
park listed in PARKS this lays out, in a frame turned to fit the park, a
terrain grid every 2.5 m from the 2017 lidar elevation model, the lakes at
the level that model gives them, one record for every tree crown the 2013-14
lidar found, and two images that say what the ground is (path, lawn, bare
earth, rock, woodland, court) from the city's survey and, where a park asks
for it, OpenStreetMap.

  central-park    4 km by 800 m, turned 29 degrees with the avenues; its lawns, woods and rock from
                  OpenStreetMap; its four transverse roads cut through under their bridges
  liberty-island, ellis-island, governors-island: surveyed shorelines, piers, walks and lawns
  prospect-park   Brooklyn crowns, surveyed water and bridges, and mapped woodland and trails

Dependencies (in a virtual environment): numpy scipy rasterio pyproj shapely
pyshp py7zr pillow.

First build: python scripts/build-park.py --park central-park --download --cache /tmp/nyc-parks
Afterwards the same cache rebuilds offline. Only the sampled grid, the tree
records and the two images ship with the game.
"""

import argparse
import hashlib
import json
import math
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = {"lat": 40.7235, "lon": -74.0015}
EARTH_RADIUS = 6371008.8
COS0 = math.cos(math.radians(ORIGIN["lat"]))

# Each park: the box its sources are asked for (west, south, east, north), how its outline is found, which survey
# layers it draws on, and where a visitor arrives (x, z, heading).
PARKS = {
    "central-park": {
        "name": "Central Park", "borough": "Manhattan", "bbox": (-73.9830, 40.7630, -73.9480, 40.8015),
        "outline": ("park", "Central Park"), "layers": ("Park_2022", "Sidewalk_2022", "Plaza_2022", "Roadbed_2022"),
        "osm": True, "transverses": True, "replaces": ("central-park-south",),
        # Arrivals come in by the Pond, at the park's south-east corner.
        "view": (2182.62, -4681.313, 0),
    },
    "liberty-island": {
        "name": "Liberty Island", "borough": "Manhattan", "bbox": (-74.0482, 40.6872, -74.0412, 40.6918),
        # The island is federal ground and no city park: its outline is the surveyed shoreline round the statue.
        "outline": ("shoreline", (-74.0445, 40.6892)), "layers": ("Park_2022", "Sidewalk_2022", "Plaza_2022", "Roadbed_2022", "Hydro_Structure_2022", "BUILDING_view"),
        "osm": False, "transverses": False, "lawn": "rest",
        # On the flagpole plaza behind the statue, looking at her (liberty.js). No street reaches the island,
        # so a visitor is set down at exactly this spot.
        "view": (-3693.7, 3708.5, .588), "exact": True,
    },
    "ellis-island": {
        "name": "Ellis Island", "borough": "Manhattan", "bbox": (-74.0449, 40.6954, -74.0365, 40.7018),
        "outline": ("shoreline", (-74.0395, 40.6994)),
        "layers": ("Park_2022", "Sidewalk_2022", "Plaza_2022", "Roadbed_2022", "Hydro_Structure_2022", "BUILDING_view"),
        "osm": False, "transverses": False, "lawn": "rest",
        # A surveyed promenade on the museum side of the ferry basin.
        "view": (-3141.955, 2715.799, -2.1), "exact": True,
    },
    "governors-island": {
        "name": "Governors Island", "borough": "Manhattan", "bbox": (-74.0283, 40.6803, -74.0090, 40.6963),
        "outline": ("shoreline", (-74.019, 40.689)),
        "layers": ("Park_2022", "Sidewalk_2022", "Plaza_2022", "Roadbed_2022", "Hydro_Structure_2022", "BUILDING_view"),
        "osm": False, "transverses": False, "lawn": "rest",
        "view": (-1025.222, 3592.533, -1.15), "exact": True,
    },
    "prospect-park": {
        "name": "Prospect Park", "borough": "Brooklyn", "bbox": (-73.9844, 40.6501, -73.9568, 40.6734),
        "outline": ("park", "Prospect Park"), "layers": ("Park_2022", "Sidewalk_2022", "Plaza_2022", "Roadbed_2022"),
        "osm": True, "transverses": False, "bridges": True, "replaces": ("prospect-lake",),
        "view": (2365.935, 6233.852, .72), "exact": True,
        "presets": [{"name": "Brooklyn · Prospect Lake", "x": 2717.742, "z": 7473.467, "heading": 0}],
    },
}
BBOX = PARKS["central-park"]["bbox"]   # set for the park being built by configure()
STEP = 2.5        # metres between terrain nodes
MARGIN = 40       # metres of ground kept beyond the park's edge
COVER = 1.0       # metres to a pixel of the surface image
CANOPY = 2.0      # metres to a pixel of the canopy image
FINE = 0.5        # metres to a pixel while drawing either
REACH = 4.0       # the surface image holds distances to an edge up to this far
DEPTH = 1.8       # how far the lake beds are cut below the water
HEIGHT_OFFSET, HEIGHT_SCALE = -20.0, 0.01

DEM = "https://elevation.its.ny.gov/arcgis/rest/services/NYC_TopoBathymetric_2017_1_meter/ImageServer"
DEM_STEP = (1.2e-5, 9e-6)   # degrees of longitude and latitude to a pixel: about a metre
SURVEY = "https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services"
LAYERS = {"Park_2022": 12, "Sidewalk_2022": 22, "Plaza_2022": 16, "Roadbed_2022": 20, "Transport_Structure_2022": 25,
          "Shoreline_2022": 21, "Hydro_Structure_2022": 7, "BUILDING_view": 0}
SHAPES = PARKS["central-park"]["layers"]


def configure(park):
    """Point the source requests at one park."""
    global BBOX, SHAPES
    BBOX, SHAPES = park["bbox"], park["layers"]

US_SURVEY_FOOT = 1200 / 3937
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
CROWNS = {
    "NY_CHM_10Int260m.tif": ("https://ndownloader.figshare.com/files/36733827", 243383277, "84e375d1ecfd090c8f5425a38fc6e957"),
    "TreeSeg.7z": ("https://ndownloader.figshare.com/files/36735456", 205333511, "88d2bd29782d1a667fd8b6817cefca61"),
}

# What an OpenStreetMap way is surfaced with, where it says.
UNPAVED = {"dirt", "ground", "unpaved", "fine_gravel", "compacted", "gravel", "woodchips", "sand", "clay", "mulch", "earth", "pebblestone", "grass"}
HARD_PITCH = {"asphalt", "acrylic", "concrete", "clay", "paved", "tartan", "rubber", "artificial_turf"}
# Half-widths, in metres, of ways that are mapped as lines.
HALF_WIDTH = {"footway": 1.4, "path": 1.0, "steps": 1.3, "cycleway": 1.6, "pedestrian": 2.6, "service": 2.0, "track": 1.6, "bridleway": 2.2}


def project(lon, lat):
    return (EARTH_RADIUS * math.radians(lon - ORIGIN["lon"]) * COS0, -EARTH_RADIUS * math.radians(lat - ORIGIN["lat"]))


def unproject(x, z):
    return (ORIGIN["lon"] + math.degrees(x / EARTH_RADIUS) / COS0, ORIGIN["lat"] - math.degrees(z / EARTH_RADIUS))


def digest(path, algorithm="sha256"):
    value = hashlib.new(algorithm)
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest()


def fetch(url, target, data=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".download")
    command = ["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "3", "--max-time", "900",
               "--user-agent", "nyc-game-build", url, "--output", str(temporary)]
    if data:
        command += ["--data-urlencode", data]
    try:
        subprocess.run(command, check=True)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def need(path, download, what):
    if not path.exists() and not download:
        raise FileNotFoundError(f"Missing {what} ({path.name}); rerun with --download")
    return not path.exists()


# --- Sources ---------------------------------------------------------------------

def survey_layer(cache, name, download):
    """Every feature of one planimetric layer that touches the park's surroundings."""
    path = cache / f"{name}-{LAYERS[name]}.geojson"
    if need(path, download, f"survey layer {name}"):
        features, offset = [], 0
        while True:
            query = urlencode({"where": "1=1", "geometry": ",".join(map(str, BBOX)), "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                               "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "outSR": 4326, "returnZ": "true", "f": "geojson",
                               "resultOffset": offset, "resultRecordCount": 1000})
            page_path = cache / f"{name}-page.json"
            fetch(f"{SURVEY}/{name}/FeatureServer/{LAYERS[name]}/query?{query}", page_path)
            page = json.loads(page_path.read_bytes())
            page_path.unlink()
            if "features" not in page:
                raise ValueError(f"Invalid {name} survey response: {page.get('error', page)}")
            got = page["features"]
            features += got
            offset += len(got)
            if len(got) < 1000:
                break
        path.write_text(json.dumps({"type": "FeatureCollection", "name": name, "features": features}))
    return json.loads(path.read_bytes())["features"]


def osm_extract(cache, download):
    path = cache / "osm.json"
    if need(path, download, "OpenStreetMap extract"):
        w, s, e, n = BBOX
        query = f"data=[out:json][timeout:240][maxsize:536870912];(nwr({s},{w},{n},{e}););out body geom;"
        for host in OVERPASS:
            try:
                fetch(host, path, data=query)
                json.loads(path.read_bytes())["elements"]
                break
            except Exception as error:  # a busy server answers with a page, not with data
                print("Overpass refused:", host, error, file=sys.stderr)
                path.unlink(missing_ok=True)
        else:
            raise RuntimeError("No Overpass server answered; try again later")
    data = json.loads(path.read_bytes())
    return data["elements"], data.get("osm3s", {}).get("timestamp_osm_base")


def elevation_model(cache, download):
    """The one-metre elevation model around the park, as one array, north row first."""
    import numpy as np
    import rasterio
    w, s, e, n = BBOX
    columns, rows = math.ceil((e - w) / DEM_STEP[0]), math.ceil((n - s) / DEM_STEP[1])
    path = cache / "dem.npy"
    if need(path, download, "elevation model"):
        model = np.full((rows, columns), np.nan, dtype=np.float32)
        tile = 1500
        for row in range(0, rows, tile):
            for column in range(0, columns, tile):
                high, wide = min(tile, rows - row), min(tile, columns - column)
                box = [w + column * DEM_STEP[0], n - (row + high) * DEM_STEP[1], w + (column + wide) * DEM_STEP[0], n - row * DEM_STEP[1]]
                query = urlencode({"bbox": ",".join(map(repr, box)), "bboxSR": 4326, "imageSR": 4326, "size": f"{wide},{high}",
                                   "adjustAspectRatio": "false", "format": "tiff", "pixelType": "F32",
                                   "interpolation": "RSP_BilinearInterpolation", "f": "json"})
                answer = cache / f"dem-{row}-{column}.json"
                fetch(f"{DEM}/exportImage?{query}", answer)
                reply = json.loads(answer.read_bytes())
                if reply.get("width") != wide or reply.get("height") != high or not reply.get("href"):
                    raise ValueError(f"Unexpected elevation answer: {reply}")
                image = cache / f"dem-{row}-{column}.tif"
                fetch(reply["href"].replace("http:", "https:"), image)
                with rasterio.open(image) as raster:
                    model[row:row + high, column:column + wide] = raster.read(1, masked=True).filled(np.nan)
                answer.unlink()
                image.unlink()
        np.save(path, model)
    model = np.load(path)
    if model.shape != (rows, columns):
        raise ValueError("Cached elevation model does not match the park's extent")
    bad = ~np.isfinite(model) | (model < -50) | (model > 200)
    if bad.mean() > 0.001:
        raise ValueError("Elevation model has holes")
    if bad.any():
        from scipy import ndimage
        nearest = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
        model = model[tuple(nearest)]
    return model


def crown_sources(cache, download, borough):
    import py7zr
    for name, (url, size, md5) in CROWNS.items():
        path = cache / name
        if name == "TreeSeg.7z" and (cache / "crowns" / ".complete").exists():
            continue
        if need(path, download, name):
            fetch(url, path)
        if path.stat().st_size != size or digest(path, "md5") != md5:
            raise ValueError(f"Source checksum mismatch: {name}")
    target = cache / "crowns"
    if not (target / ".complete").exists():
        target.mkdir(parents=True, exist_ok=True)
        with py7zr.SevenZipFile(cache / "TreeSeg.7z", "r") as archive:
            if any(Path(name).is_absolute() or ".." in Path(name).parts for name in archive.getnames()):
                raise ValueError("Unsafe tree archive path")
            archive.extractall(target)
        (target / ".complete").write_text("verified source archive extracted\n")
    prefix = {"Manhattan": "manh", "Brooklyn": "brooklyn"}[borough]
    return next(path for path in target.rglob("*.shp") if path.name.lower().startswith(prefix))


# --- The park's frame --------------------------------------------------------------

class Frame:
    """A rectangle turned with the park. Local x runs east across it, local z downtown along it."""

    def __init__(self, park):
        corners = list(park.minimum_rotated_rectangle.exterior.coords)[:4]
        edges = [(corners[(i + 1) % 4][0] - corners[i][0], corners[(i + 1) % 4][1] - corners[i][1]) for i in range(4)]
        dx, dz = min(edges, key=lambda edge: math.hypot(*edge))
        if dx < 0:
            dx, dz = -dx, -dz
        self.angle = round(math.atan2(dz, dx), 6)
        self.cos, self.sin = math.cos(self.angle), math.sin(self.angle)
        turned = [(x * self.cos + z * self.sin, -x * self.sin + z * self.cos) for x, z in park.exterior.coords]
        low_x, low_z = min(p[0] for p in turned) - MARGIN, min(p[1] for p in turned) - MARGIN
        self.x = round(low_x * self.cos - low_z * self.sin, 3)
        self.z = round(low_x * self.sin + low_z * self.cos, 3)
        self.width = math.ceil((max(p[0] for p in turned) + MARGIN - low_x) / 10) * 10
        self.depth = math.ceil((max(p[1] for p in turned) + MARGIN - low_z) / 10) * 10

    def local(self, x, z):
        dx, dz = x - self.x, z - self.z
        return dx * self.cos + dz * self.sin, -dx * self.sin + dz * self.cos

    def world(self, x, z):
        return self.x + x * self.cos - z * self.sin, self.z + x * self.sin + z * self.cos

    def lonlat_to_local(self, lon, lat, _=None):
        import numpy as np
        x = EARTH_RADIUS * np.radians(np.asarray(lon) - ORIGIN["lon"]) * COS0
        z = -EARTH_RADIUS * np.radians(np.asarray(lat) - ORIGIN["lat"])
        return self.local(x, z)

    def describe(self):
        return {"x": self.x, "z": self.z, "cos": self.cos, "sin": self.sin, "angle": self.angle}


def sampler(model):
    """Heights from the elevation model at world positions (arrays)."""
    import numpy as np
    from scipy import ndimage
    w, _, _, n = BBOX

    def sample(x, z, source=model):
        lon = ORIGIN["lon"] + np.degrees(np.asarray(x) / EARTH_RADIUS) / COS0
        lat = ORIGIN["lat"] - np.degrees(np.asarray(z) / EARTH_RADIUS)
        return ndimage.map_coordinates(source, [(n - lat) / DEM_STEP[1] - .5, (lon - w) / DEM_STEP[0] - .5], order=1, mode="nearest")
    return sample


def draw(shapes, frame, scale=FINE, window=None):
    """Polygons in the park's frame as a mask, `scale` metres to a pixel."""
    import numpy as np
    from affine import Affine
    from rasterio.features import rasterize
    x0, z0, wide, deep = window or (0, 0, frame.width, frame.depth)
    shape = (round(deep / scale), round(wide / scale))
    shapes = [shape_ for shape_ in shapes if shape_ is not None and not shape_.is_empty]
    if not shapes:
        return np.zeros(shape, dtype=bool)
    return rasterize([(shape_, 1) for shape_ in shapes], out_shape=shape, transform=Affine(scale, 0, x0, 0, scale, z0), fill=0, dtype="uint8").astype(bool)


def signed_distance(mask, scale=FINE):
    """Metres to the mask's edge: positive inside it."""
    from scipy import ndimage
    return (ndimage.distance_transform_edt(mask) - ndimage.distance_transform_edt(~mask)) * scale


def shrink(image, factor):
    high, wide = image.shape[0] // factor * factor, image.shape[1] // factor * factor
    return image[:high, :wide].reshape(high // factor, factor, wide // factor, factor).mean(axis=(1, 3))


# --- OpenStreetMap ------------------------------------------------------------------

def osm_shapes(elements, frame, park):
    """Areas and lines of the park, in its frame, keyed by what they are."""
    from shapely.geometry import LineString, Polygon, Point
    from shapely.ops import polygonize, unary_union
    from shapely.prepared import prep
    inside = prep(park.buffer(5))
    areas = {key: [] for key in ("wood", "grass", "rock", "sand", "pitch_soft", "pitch_hard", "playground", "garden", "paved", "building")}
    lines = {"paved": [], "bare": []}
    points = {key: [] for key in ("bench", "lamp", "statue", "fountain", "tree")}

    def local(geometry):
        return [frame.lonlat_to_local(point["lon"], point["lat"]) for point in geometry]

    def ring(geometry):
        coords = local(geometry)
        return Polygon(coords) if len(coords) >= 4 and coords[0] == coords[-1] else None

    def classify(tags):
        natural, landuse, leisure, highway, surface = (tags.get(key) for key in ("natural", "landuse", "leisure", "highway", "surface"))
        if tags.get("building") and tags.get("building") != "no":
            return "building"
        if natural in ("wood", "scrub") or landuse == "forest":
            return "wood"
        if natural in ("bare_rock", "scree", "rock", "stone"):
            return "rock"
        if natural == "sand" or (leisure == "pitch" and surface in ("sand", "dirt", "clay") and tags.get("sport") in ("baseball", "softball", "volleyball", "beachvolleyball", "equestrian")):
            return "sand"
        if leisure == "pitch":
            return "pitch_hard" if surface in HARD_PITCH or tags.get("sport") in ("tennis", "basketball", "handball") else "pitch_soft"
        if leisure == "playground":
            return "playground"
        if landuse in ("grass", "meadow", "recreation_ground", "village_green") or natural == "grassland" or leisure in ("golf_course",):
            return "grass"
        if leisure == "garden" or landuse == "flowerbed" or natural == "shrubbery":
            return "garden"
        if highway == "pedestrian" and (tags.get("area") == "yes" or tags.get("type") == "multipolygon"):
            return "paved"
        return None

    for element in elements:
        tags = element.get("tags") or {}
        if element["type"] == "node":
            kind = ("bench" if tags.get("amenity") == "bench" else "lamp" if tags.get("highway") == "street_lamp"
                    else "statue" if tags.get("artwork_type") in ("statue", "bust", "sculpture") or tags.get("historic") in ("memorial", "monument") and tags.get("memorial") not in ("plaque", "bench", "ghost_bike")
                    else "fountain" if tags.get("amenity") == "fountain" else "tree" if tags.get("natural") == "tree" else None)
            if kind:
                x, z = frame.lonlat_to_local(element["lon"], element["lat"])
                if inside.contains(Point(x, z)):
                    points[kind].append({"x": float(x), "z": float(z), "tags": tags})
            continue
        kind = classify(tags)
        if element["type"] == "way" and element.get("geometry"):
            polygon = ring(element["geometry"])
            if kind and polygon is not None:
                polygon = polygon if polygon.is_valid else polygon.buffer(0)
                if inside.intersects(polygon):
                    areas[kind].append(polygon)
                continue
            highway = tags.get("highway")
            if highway in HALF_WIDTH and tags.get("tunnel") not in ("yes", "building_passage") and tags.get("indoor") != "yes" and tags.get("area") != "yes":
                coords = local(element["geometry"])
                if len(coords) < 2:
                    continue
                line = LineString(coords)
                if not inside.intersects(line):
                    continue
                try:
                    half = float(str(tags.get("width", "")).split()[0]) / 2
                except (ValueError, IndexError):
                    half = HALF_WIDTH[highway]
                bare = highway == "bridleway" or tags.get("surface") in UNPAVED
                lines["bare" if bare else "paved"].append(line.buffer(min(max(half, .6), 6), cap_style=2, join_style=1))
        elif element["type"] == "relation" and kind and tags.get("type") == "multipolygon":
            outer = [LineString(local(member["geometry"])) for member in element.get("members", []) if member.get("role") != "inner" and member.get("geometry") and len(member["geometry"]) > 1]
            inner = [LineString(local(member["geometry"])) for member in element.get("members", []) if member.get("role") == "inner" and member.get("geometry") and len(member["geometry"]) > 1]
            shell = unary_union(list(polygonize(unary_union(outer)))) if outer else None
            if shell is None or shell.is_empty:
                continue
            holes = unary_union(list(polygonize(unary_union(inner)))) if inner else None
            polygon = shell.difference(holes) if holes is not None and not holes.is_empty else shell
            if inside.intersects(polygon):
                areas[kind].append(polygon)
    return areas, lines, points


# --- Stages ---------------------------------------------------------------------------

def survey_shapes(cache, download, frame=None):
    from shapely.geometry import shape
    from shapely.ops import transform
    result = {}
    for name in SHAPES:
        result[name] = []
        for feature in survey_layer(cache, name, download):
            if not feature.get("geometry"):
                continue
            geometry = shape(feature["geometry"])
            if not geometry.is_valid:
                geometry = geometry.buffer(0)
            if frame:
                geometry = transform(frame.lonlat_to_local, geometry)
            result[name].append((feature["properties"], geometry))
    return result


def park_outline(cache, download, park):
    """The park's own outline in world metres: the largest piece the survey gives that name, or the shoreline round a point."""
    from shapely.geometry import shape, Point, Polygon
    from shapely.ops import transform
    import numpy as np
    kind, which = park["outline"]
    if kind == "park":
        pieces = [shape(feature["geometry"]) for feature in survey_layer(cache, "Park_2022", download)
                  if feature["properties"].get("FEATURE_CODE") == 4980 and feature["properties"].get("PARK_NAME") == which]
        outline = max(pieces, key=lambda piece: piece.area)
    else:
        rings = []
        for feature in survey_layer(cache, "Shoreline_2022", download):
            geometry = feature.get("geometry") or {}
            for line in ([geometry["coordinates"]] if geometry.get("type") == "LineString" else geometry.get("coordinates", [])):
                if len(line) > 3 and line[0][:2] == line[-1][:2]:
                    rings.append(Polygon([point[:2] for point in line]))
        outline = next(ring for ring in sorted(rings, key=lambda ring: ring.area) if ring.contains(Point(*which)))

    def to_world(lon, lat, _=None):
        return (EARTH_RADIUS * np.radians(np.asarray(lon) - ORIGIN["lon"]) * COS0, -EARTH_RADIUS * np.radians(np.asarray(lat) - ORIGIN["lat"]))
    return transform(to_world, outline)


def water_features(base_path, frame, park, sample):
    """The mapped lakes and ponds of the park, each at the level the elevation model gives it."""
    import numpy as np
    from shapely.geometry import Polygon
    from shapely.ops import transform
    features = []
    for feature in json.loads(base_path.read_bytes())["water"]:
        polygon = Polygon(feature["polygon"], feature.get("holes") or [])
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        local = transform(lambda x, z, _=None: frame.local(np.asarray(x), np.asarray(z)), polygon)
        if local.is_empty or local.intersection(park).area < .5 * local.area:
            continue
        # The model is flattened across open water, so its heights well inside the shore agree.
        inner = local.buffer(-2.5)
        inner = inner if not inner.is_empty else local
        x0, z0, x1, z1 = inner.bounds
        xs, zs = np.meshgrid(np.arange(x0, x1 + 1, 1.5), np.arange(z0, z1 + 1, 1.5))
        from shapely import contains_xy
        keep = contains_xy(inner, xs, zs)
        if keep.sum() < 3:
            point = local.representative_point()
            xs, zs, keep = np.array([point.x]), np.array([point.y]), np.array([True])
        heights = sample(*frame.world(xs[keep], zs[keep]))
        level = float(np.percentile(heights, 30))
        features.append({**feature, "elevation": round(level, 3), "elevationSamples": int(keep.sum()),
                         "elevationSpread": round(float(np.percentile(heights, 90) - np.percentile(heights, 10)), 3),
                         "elevationMethod": "30th percentile of the 2017 one-metre elevation model well inside the mapped shore",
                         "local": local})
    return features


def terrain_grid(frame, model, sample, water):
    """Node heights of the park's frame, with every lake bed cut below its water."""
    import numpy as np
    from scipy import ndimage
    columns, rows = round(frame.width / STEP) + 1, round(frame.depth / STEP) + 1
    xs, zs = np.meshgrid(np.arange(columns) * STEP, np.arange(rows) * STEP)
    # A node stands for the ground a pace or so around it.
    smooth = ndimage.gaussian_filter(model, sigma=.9)
    heights = sample(*frame.world(xs, zs), source=smooth).astype(np.float64)
    for feature in water:
        x0, z0, x1, z1 = feature["local"].bounds
        pad = 10
        window = (math.floor(x0 - pad), math.floor(z0 - pad), math.ceil(x1 + pad) - math.floor(x0 - pad), math.ceil(z1 + pad) - math.floor(z0 - pad))
        distance = -signed_distance(draw([feature["local"]], frame, FINE, window))   # positive on land
        c0, c1 = max(0, math.ceil(window[0] / STEP)), min(columns - 1, math.floor((window[0] + window[2]) / STEP))
        r0, r1 = max(0, math.ceil(window[1] / STEP)), min(rows - 1, math.floor((window[1] + window[3]) / STEP))
        if c1 < c0 or r1 < r0:
            continue
        nx, nz = np.meshgrid(np.arange(c0, c1 + 1) * STEP, np.arange(r0, r1 + 1) * STEP)
        at = ndimage.map_coordinates(distance, [(nz - window[1]) / FINE - .5, (nx - window[0]) / FINE - .5], order=1, mode="nearest")
        part = heights[r0:r1 + 1, c0:c1 + 1]
        level = feature["elevation"]
        # Height runs evenly through the shore, so the water's edge falls on the mapped line.
        bed = level + np.maximum(-DEPTH, .35 * at)
        bank = np.maximum(part, level + np.minimum(.3, .1 * at))
        heights[r0:r1 + 1, c0:c1 + 1] = np.where(at < 0, bed, np.where(at < 6, bank, part))
    return heights


def grid_height(heights, x, z):
    """The terrain mesh's own height at frame positions: its two triangles a cell, as the game samples them."""
    import numpy as np
    rows, columns = heights.shape
    gx, gz = np.asarray(x) / STEP, np.asarray(z) / STEP
    column, row = np.clip(np.floor(gx).astype(int), 0, columns - 2), np.clip(np.floor(gz).astype(int), 0, rows - 2)
    u, v = gx - column, gz - row
    a, b, c, d = heights[row, column], heights[row, column + 1], heights[row + 1, column], heights[row + 1, column + 1]
    return np.where(u + v <= 1, a + (b - a) * u + (c - a) * v, d + (c - d) * (1 - u) + (b - d) * (1 - v))


def crown_candidates(cache, download, frame, park, borough):
    """Every crown the lidar found over the park: where its top is, how tall, and its outline. Kept in the cache."""
    import pickle
    import numpy as np
    import rasterio
    import shapefile
    from pyproj import CRS, Transformer
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds
    from shapely import wkb
    from shapely.geometry import shape, box, mapping
    from shapely.ops import transform
    from shapely.prepared import prep
    kept = cache / f"crowns-{frame.x:.0f}-{frame.z:.0f}-{frame.angle:.4f}.pickle"
    if kept.exists():
        return [(x, z, top, low, wkb.loads(outline)) for x, z, top, low, outline in pickle.loads(kept.read_bytes())]
    path = crown_sources(cache.parent, download, borough)
    source = CRS.from_wkt(path.with_suffix(".prj").read_text())
    to_source = Transformer.from_crs(4326, source, always_xy=True)
    to_wgs = Transformer.from_crs(source, 4326, always_xy=True)
    region = transform(to_source.transform, box(*BBOX))
    inside = prep(park)
    found, short = [], 0
    with rasterio.open(cache.parent / "NY_CHM_10Int260m.tif") as raster, shapefile.Reader(str(path)) as reader:
        to_raster = Transformer.from_crs(source, raster.crs, always_xy=True)
        from_raster = Transformer.from_crs(raster.crs, 4326, always_xy=True)
        for feature in reader.iterShapeRecords(bbox=region.bounds):
            geometry = shape(feature.shape.__geo_interface__)
            if not geometry.is_valid:
                geometry = geometry.buffer(0)
            if geometry.is_empty:
                continue
            crown = transform(lambda x, y, _=None: frame.lonlat_to_local(*to_wgs.transform(x, y)), geometry)
            if not inside.intersects(crown):
                continue
            lidar = transform(to_raster.transform, geometry)
            window = from_bounds(*lidar.bounds, raster.transform).round_offsets().round_lengths()
            if window.width < 1 or window.height < 1:
                continue
            outside = (window.col_off < 0 or window.row_off < 0 or
                       window.col_off + window.width > raster.width or window.row_off + window.height > raster.height)
            band = raster.read(1, window=window, boundless=outside, fill_value=0).astype(np.float64)
            covered = geometry_mask([mapping(lidar)], out_shape=band.shape, transform=raster.window_transform(window), invert=True)
            # The canopy model is in decimetres; outside 2 to 60 m it is not vegetation.
            valid = covered & (band >= 20) & (band <= 600)
            if valid.sum() < 2 or band[valid].max() < 50:
                short += 1
                continue
            values = band[valid] / 10
            top = np.unravel_index(np.argmax(np.where(valid, band, -1)), band.shape)
            tx, ty = raster.window_transform(window) * (top[1] + .5, top[0] + .5)
            x, z = frame.lonlat_to_local(*from_raster.transform(tx, ty))
            found.append((float(x), float(z), float(values.max()), float(np.percentile(values, 10)), crown))
    print("Crowns over the park:", len(found), "under five metres and left out:", short)
    kept.write_bytes(pickle.dumps([(x, z, top, low, wkb.dumps(outline)) for x, z, top, low, outline in found]))
    return found


def tree_records(candidates, frame, park, row_walks, blocked, heights):
    """
    One record for each tree: where it stands, how tall, how wide. A trunk stands under its crown's highest
    point, unless that is over water, a roadway, a path or a roof: then on the nearest clear ground the crown covers.
    """
    import numpy as np
    from scipy import ndimage
    from shapely.geometry import Point
    from shapely.ops import unary_union
    from shapely.prepared import prep
    inside = prep(park)
    street = prep(unary_union(row_walks).buffer(1.5)) if row_walks else None
    # How far each spot is from anything a trunk cannot stand in.
    clear = ndimage.distance_transform_edt(~draw(blocked, frame)) * FINE
    rows, columns = clear.shape
    records, footprints, count = [], [], {"moved": 0, "no ground under the crown": 0, "outside": 0, "street": 0}
    for x, z, top, low, crown in candidates:
        row, column = int(z / FINE), int(x / FINE)
        if not (0 <= row < rows and 0 <= column < columns):
            count["outside"] += 1
            continue
        if street and street.contains(Point(x, z)):
            # The street tree census draws the trees of the sidewalk outside the wall.
            count["street"] += 1
            continue
        if clear[row, column] < .6:
            x0, z0, x1, z1 = crown.bounds
            wx, wz = math.floor(x0), math.floor(z0)
            covered = draw([crown], frame, FINE, (wx, wz, math.ceil(x1) - wx + 1, math.ceil(z1) - wz + 1))
            r0, c0 = round(wz / FINE), round(wx / FINE)
            if r0 < 0 or c0 < 0 or r0 + covered.shape[0] > rows or c0 + covered.shape[1] > columns:
                count["no ground under the crown"] += 1
                continue
            free = covered & (clear[r0:r0 + covered.shape[0], c0:c0 + covered.shape[1]] >= .8)
            if not free.any():
                count["no ground under the crown"] += 1
                continue
            rr, cc = np.nonzero(free)
            px, pz = wx + (cc + .5) * FINE, wz + (rr + .5) * FINE
            nearest = int(np.argmin((px - x) ** 2 + (pz - z) ** 2))
            x, z = float(px[nearest]), float(pz[nearest])
            count["moved"] += 1
        point = Point(x, z)
        if not inside.contains(point):
            count["outside"] += 1
            continue
        records.append((x, z, top, math.sqrt(crown.area / math.pi), low))
        footprints.append(crown)
    print("Trees:", len(records), count)
    data = np.array(records)
    # A record holds a position to the decimetre: the ground is read where the record will say the tree is.
    data[:, 0:2] = np.round(data[:, 0:2] * 10) / 10
    ground = grid_height(heights, data[:, 0], data[:, 1])
    order = np.lexsort((data[:, 0], np.floor(data[:, 1] / 100)))
    packed = np.stack([data[:, 0] * 10, data[:, 1] * 10, (ground - HEIGHT_OFFSET) / HEIGHT_SCALE, data[:, 2] * 100, np.minimum(data[:, 3], 30) * 100, data[:, 4] * 100], axis=1)[order]
    return np.clip(np.round(packed), 0, 65535).astype("<u2"), [footprints[i] for i in order]


def transverse_cuts(elements, frame, park, sample):
    """
    The four transverse roads cross the park in cuttings. Where a drive, a path or a hillside passes over one,
    the elevation model records the top, so the road would meet a wall. Find each covered stretch from
    OpenStreetMap's tunnels, and work out the roadway through it: its floor, falling evenly from one open
    end to the other; its width, from the cutting on either side; and the lid, at the heights the model has.
    """
    import numpy as np
    from shapely.geometry import LineString
    from shapely.ops import linemerge, unary_union, substring
    roads, tunnels = {}, {}
    for element in elements:
        tags = element.get("tags") or {}
        name = tags.get("name") or ""
        if element["type"] != "way" or "Transverse" not in name or tags.get("highway") not in ("primary", "secondary", "tertiary", "residential", "unclassified", "trunk"):
            continue
        line = LineString([frame.lonlat_to_local(point["lon"], point["lat"]) for point in element["geometry"]])
        roads.setdefault(name, []).append(line)
        if tags.get("tunnel") == "yes" or tags.get("covered") == "yes":
            tunnels.setdefault(name, []).append(line)
    spot = lambda point: (round(point[0], 2), round(point[1], 2))

    def onward(ways, start, heading, reach):
        """The road beyond one end of a tunnel: whichever way leaves that end most nearly straight on, and so on."""
        path, travelled, used = [], 0.0, set()
        while travelled < reach:
            best = None
            for number, way in enumerate(ways):
                for coords in (list(way.coords), list(way.coords)[::-1]):
                    if number in used or spot(coords[0]) != spot(start):
                        continue
                    dx, dz = coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]
                    straight = (dx * heading[0] + dz * heading[1]) / ((math.hypot(dx, dz) or 1) * (math.hypot(*heading) or 1))
                    if straight > .5 and (best is None or straight > best[0]):
                        best = (straight, number, coords)
            if best is None:
                break
            _, number, coords = best
            used.add(number)
            path += coords[1:]
            travelled += LineString(coords).length
            start, heading = coords[-1], (coords[-1][0] - coords[-2][0], coords[-1][1] - coords[-2][1])
        return path

    cuts = []
    for name, lines in sorted(tunnels.items()):
        covered = linemerge(unary_union(lines))
        open_ways = [way for way in roads[name] if not any(way.equals(line) for line in lines)]
        for tunnel in (list(covered.geoms) if covered.geom_type == "MultiLineString" else [covered]):
            if not park.intersects(tunnel):
                continue
            inside = list(tunnel.coords)
            before = onward(open_ways, inside[0], (inside[0][0] - inside[1][0], inside[0][1] - inside[1][1]), 45)
            after = onward(open_ways, inside[-1], (inside[-1][0] - inside[-2][0], inside[-1][1] - inside[-2][1]), 45)
            if not before or not after:
                print(f"  {name}: a covered stretch of {tunnel.length:.0f} m has no open road at one end and is left alone")
                continue
            road = LineString(before[::-1] + inside + after)
            s0 = LineString(before[::-1] + inside[:1]).length
            s1 = s0 + tunnel.length
            reach = 30
            stations = np.arange(max(0, s0 - reach), min(road.length, s1 + reach) + .5, 1.0)
            points = [road.interpolate(float(s)) for s in stations]
            xs, zs = np.array([p.x for p in points]), np.array([p.y for p in points])
            profile = sample(*frame.world(xs, zs))
            # The open road either side: the lowest ground within reach of each end.
            left, right = stations < s0, stations > s1
            if not left.any() or not right.any():
                continue
            low_left, low_right = profile[left].min(), profile[right].min()
            a0 = stations[left][np.where(profile[left] <= low_left + .4)[0][-1]]
            a1 = stations[right][np.where(profile[right] <= low_right + .4)[0][0]]
            h0, h1 = float(profile[stations == a0][0]), float(profile[stations == a1][0])
            floor = lambda s: h0 + (h1 - h0) * (np.asarray(s) - a0) / (a1 - a0)
            rise = profile - floor(stations)
            between = (stations >= a0) & (stations <= a1)
            bump = float(rise[between].max())
            if bump < 2.5:
                continue
            lidded = stations[between & (rise > .6 * bump)]
            p0, p1 = float(lidded[0]), float(lidded[-1])
            # How wide the cutting is, measured just outside each mouth: out from the centre line to where the ground stands up.
            def half_width(station, side):
                here = road.interpolate(float(station)); ahead = road.interpolate(float(min(road.length, station + 1)))
                tx, tz = ahead.x - here.x, ahead.y - here.y
                length = math.hypot(tx, tz) or 1
                nx, nz = -tz / length * side, tx / length * side
                steps = np.arange(0, 12.5, .5)
                across = sample(*frame.world(here.x + nx * steps, here.y + nz * steps))
                wall = np.where(across - across[0] > 1.2)[0]
                return float(steps[wall[0]]) if len(wall) else None
            widths = {}
            for side in (1, -1):
                measured = [w for w in (half_width(a0 - 3, side), half_width(a1 + 3, side), half_width(a0 - 8, side), half_width(a1 + 8, side)) if w]
                widths[side] = min(9.0, max(4.5, float(np.median(measured)) + .5)) if measured else 6.0
            centre = substring(road, a0, a1)
            def corridor(line, extra, widths=widths):
                # The strip either side of the centre line, square at its ends.
                sides = [line.buffer(side * (widths[side] + extra), single_sided=True, join_style=2) for side in (1, -1)]
                strip = unary_union(sides).buffer(.05, join_style=2)
                return max(strip.geoms, key=lambda part: part.area) if strip.geom_type == "MultiPolygon" else strip
            cuts.append({"name": name, "road": road, "from": a0, "to": a1, "h0": h0, "h1": h1, "lid": (p0, p1), "bump": bump, "widths": widths,
                         "cut": corridor(centre, 0), "corridor": corridor})
            print(f"  {name}: covered for {a1 - a0:.0f} m, {bump:.1f} m under the top, {widths[1] + widths[-1]:.1f} m wide")
    return cuts


def carve(heights, cuts):
    """Lower the terrain nodes of each covered stretch to its roadway."""
    import numpy as np
    from shapely import contains_xy, line_locate_point, points
    carved = heights.copy()
    for cut in cuts:
        x0, z0, x1, z1 = cut["cut"].bounds
        c0, c1, r0, r1 = max(0, math.floor(x0 / STEP)), math.ceil(x1 / STEP), max(0, math.floor(z0 / STEP)), math.ceil(z1 / STEP)
        xs, zs = np.meshgrid(np.arange(c0, c1 + 1) * STEP, np.arange(r0, r1 + 1) * STEP)
        inside = contains_xy(cut["cut"], xs, zs)
        along = line_locate_point(cut["road"], points(xs[inside], zs[inside]))
        floor = cut["h0"] + (cut["h1"] - cut["h0"]) * (np.clip(along, cut["from"], cut["to"]) - cut["from"]) / (cut["to"] - cut["from"])
        part = carved[r0:r1 + 1, c0:c1 + 1]
        part[inside] = np.minimum(part[inside], floor)
    return carved


def lids(cuts, frame, sample, bridges):
    """
    What covers each stretch: a deck at the heights the elevation model has there, wide enough to rest on the
    ground either side. Where the survey already outlines a bridge over the stretch, that bridge is the lid.
    """
    import numpy as np
    from shapely.geometry import Point
    from shapely.ops import substring
    features, outlines = [], []
    for number, cut in enumerate(cuts):
        p0, p1 = cut["lid"]
        if p1 - p0 < 4:
            continue
        line = substring(cut["road"], p0, p1)
        outline = cut["corridor"](line, STEP + 1.0)
        if any(bridge.intersection(outline).area > .55 * outline.area for bridge in bridges):
            continue
        ring = list(outline.exterior.coords)[:-1]
        # A vertex every few metres, so the lid follows the ground it meets.
        dense = []
        for i, a in enumerate(ring):
            b = ring[(i + 1) % len(ring)]
            pieces = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / 3))
            dense += [(a[0] + (b[0] - a[0]) * k / pieces, a[1] + (b[1] - a[1]) * k / pieces) for k in range(pieces)]
        # Heights come from just inside the lid's ends, clear of the model's slope down into the cutting.
        tops = []
        for x, z in dense:
            station = min(max(line.project(Point(x, z)), 2.0), max(2.0, line.length - 2.0))
            on = line.interpolate(station); near = line.interpolate(line.project(Point(x, z)))
            tops.append(float(sample(*frame.world(np.array([x + on.x - near.x]), np.array([z + on.y - near.y])))[0]))
        world = [frame.world(x, z) for x, z in dense]
        outlines.append(outline)
        features.append({"id": f"transport:central-park-lid:{number}", "sourceId": "nyc-dem-2017", "kind": "transport", "subtype": "bridge", "cover": "ground", "grade": True,
                         "name": cut["name"], "polygon": [[round(float(x), 3), round(float(z), 3)] for x, z in world], "holes": [],
                         "elevations": {"polygon": [round(v, 3) for v in tops], "holes": []}, "elevationUnits": "meters", "verticalDatum": "NAVD88",
                         "elevationStatus": "surveyed", "elevationMeaning": "The 2017 elevation model at the outline: the ground or bridge top over a covered roadway.",
                         "surfaceRole": "elevated transport outline"})
    return features, outlines


def survey_bridges(cache, download, frame, park):
    """The bridges the survey outlines in the park, with the heights of their outlines, as the game's deck features."""
    from shapely.geometry import shape
    from shapely.ops import transform
    features, shapes = [], []
    for feature in survey_layer(cache, "Transport_Structure_2022", download):
        properties, geometry = feature["properties"], feature.get("geometry")
        subtype = {2300: "bridge", 2330: "pedestrian bridge"}.get(properties.get("FEATURE_CODE"))
        if not subtype or not geometry or geometry["type"] not in ("Polygon", "MultiPolygon"):
            continue
        for part, rings in enumerate([geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]):
            if any(len(point) < 3 or abs(point[2]) < 1e-8 for ring in rings for point in ring):
                continue   # no surveyed height
            local = transform(frame.lonlat_to_local, shape({"type": "Polygon", "coordinates": [[point[:2] for point in ring] for ring in rings]}))
            if not local.is_valid or not park.intersects(local):
                continue
            def chain(ring):
                ring = ring[:-1] if ring[0][:2] == ring[-1][:2] else ring
                return [[round(v, 3) for v in project(point[0], point[1])] for point in ring], [round(point[2] * US_SURVEY_FOOT, 5) for point in ring]
            chains = [chain(ring) for ring in rings]
            features.append({"id": f"transport:arcgis-{properties['OBJECTID']}:{part}", "sourceId": str(properties.get("SOURCE_ID")), "sourceRowId": f"arcgis-{properties['OBJECTID']}",
                             "kind": "transport", "featureCode": properties["FEATURE_CODE"], "subCode": properties.get("SUB_FEATURE_CODE"), "subtype": subtype,
                             # Every bridge in the park carries a drive or a path that is at grade either side of it.
                             "grade": True,
                             "status": properties.get("STATUS"), "name": properties.get("NAME") or "", "polygon": chains[0][0], "holes": [c[0] for c in chains[1:]],
                             "elevations": {"polygon": chains[0][1], "holes": [c[1] for c in chains[1:]]}, "elevationUnits": "meters", "verticalDatum": "NAVD88",
                             "sourceElevationUnits": "US survey feet", "elevationStatus": "surveyed",
                             "elevationMeaning": "Surveyed transport outline Z; deck interior is interpolated, not independently measured.", "surfaceRole": "elevated transport outline"})
            shapes.append(local)
    return features, shapes


def ground_cover(frame, park, survey, osm_areas, osm_lines, water, crowns, rest_is_lawn=False, ground=None):
    """Two images in the park's frame: what the ground is surfaced with, and what stands over it."""
    import numpy as np
    from scipy import ndimage
    from shapely.ops import unary_union
    from shapely.prepared import prep
    near = prep(park.buffer(3))
    of = lambda name, test=lambda properties: True: [geometry for properties, geometry in survey.get(name, []) if test(properties) and near.intersects(geometry)]
    walks = of("Sidewalk_2022")
    # Piers and landings are decked; a seawall is stone; a building's footprint is not ground at all.
    piers, seawall, roofs = of("Hydro_Structure_2022", lambda p: p.get("FEATURE_CODE") == 2800), of("Hydro_Structure_2022", lambda p: p.get("FEATURE_CODE") == 2820), of("BUILDING_view")
    plazas = [geometry for properties, geometry in survey["Plaza_2022"] if near.intersects(geometry)]
    roads = [geometry for properties, geometry in survey["Roadbed_2022"] if near.intersects(geometry)]
    diamonds = [geometry for properties, geometry in survey["Park_2022"] if properties.get("FEATURE_CODE") == 4900 and near.intersects(geometry)]
    courts = [geometry for properties, geometry in survey["Park_2022"] if properties.get("FEATURE_CODE") in (4910, 4970) and near.intersects(geometry)]
    lakes = unary_union([feature["local"] for feature in water]) if water else None
    # A path OpenStreetMap draws as a line is kept only where the survey has no outline within a few paces of it.
    surveyed = draw(walks + plazas + roads + piers, frame)
    unsurveyed = ndimage.distance_transform_edt(~surveyed) * FINE > 2.5
    masks = {
        "paved": surveyed | draw(osm_areas["paved"], frame) | (draw(osm_lines["paved"], frame) & unsurveyed),
        "lawn": draw(osm_areas["grass"] + osm_areas["pitch_soft"] + osm_areas["garden"], frame),
        "bare": (draw(osm_lines["bare"], frame) & unsurveyed) | draw(osm_areas["sand"] + diamonds, frame),
        "rock": draw(osm_areas["rock"] + seawall, frame),
    }
    wet = draw([lakes], frame) if lakes is not None else np.zeros_like(masks["paved"])
    if rest_is_lawn:
        # Where nobody has mapped the lawns, they are what is left of the park once paving, stone and buildings are taken out.
        masks["lawn"] |= draw([park.buffer(-1.5)], frame) & ~masks["paved"] & ~masks["rock"] & ~draw([roof.buffer(1) for roof in roofs], frame)
    masks["bare"] &= ~masks["paved"]
    for name in ("lawn", "bare", "rock"):
        masks[name] &= ~wet
    surface = np.stack([np.clip(np.round(127.5 + shrink(np.clip(signed_distance(masks[name]), -REACH, REACH), round(COVER / FINE)) / REACH * 127.5), 0, 255)
                        for name in ("paved", "lawn", "bare", "rock")], axis=-1).astype(np.uint8)
    factor = round(CANOPY / FINE)

    def soft(mask, sigma):
        return np.clip(np.round(shrink(ndimage.gaussian_filter(mask.astype(np.float32), sigma / FINE), factor) * 255), 0, 255)
    over = np.stack([soft(draw(crowns, frame), 1.2), soft(draw(osm_areas["wood"], frame) & ~wet, 2.5),
                     soft(draw(courts + osm_areas["pitch_hard"] + osm_areas["playground"], frame), .6), soft(draw([ground or park], frame), .8)], axis=-1).astype(np.uint8)
    shares = {name: round(float((mask & draw([park], frame)).mean() * frame.width * frame.depth / park.area), 4) for name, mask in masks.items()}
    return surface, over, shares


def piers_of(survey, park):
    """The piers and landings the survey outlines at the park's shore: each outline, and the height of its deck in metres."""
    found = []
    for properties, geometry in survey.get("Hydro_Structure_2022", []):
        if properties.get("FEATURE_CODE") == 2800 and geometry.distance(park) < 12:
            level = properties.get("Elevation")
            found.append((geometry, float(level) * US_SURVEY_FOOT if isinstance(level, (int, float)) else 1.5))
    return found


def deck_piers(heights, piers):
    """A pier's deck is not in the elevation model, which sees the water under it: raise the ground to the surveyed deck."""
    import numpy as np
    from shapely import contains_xy
    raised = heights.copy()
    for outline, level in piers:
        x0, z0, x1, z1 = outline.buffer(1.5).bounds
        c0, c1, r0, r1 = max(0, math.floor(x0 / STEP)), min(heights.shape[1] - 1, math.ceil(x1 / STEP)), max(0, math.floor(z0 / STEP)), min(heights.shape[0] - 1, math.ceil(z1 / STEP))
        if c1 < c0 or r1 < r0:
            continue
        xs, zs = np.meshgrid(np.arange(c0, c1 + 1) * STEP, np.arange(r0, r1 + 1) * STEP)
        inside = contains_xy(outline.buffer(1.5), xs, zs)
        part = raised[r0:r1 + 1, c0:c1 + 1]
        part[inside] = np.maximum(part[inside], level)
    return raised


def redraw_shore(output, frame, ground, borough):
    """
    The borough outlines give a small island in a few dozen points, some of them tens of metres out in the bay.
    Where a park's shore is surveyed, put that shore in their place, so land and water part where the seawall is.
    """
    from shapely.geometry import Polygon
    path = output / "boroughs.json"
    if not path.exists():
        return 0
    land = json.loads(path.read_bytes())
    parts = [part for part in getattr(ground, "geoms", [ground]) if part.area > 20]
    world = [Polygon([frame.world(x, z) for x, z in part.exterior.coords]) for part in parts]
    reach = [shape_.buffer(60) for shape_ in world]
    replaced = 0
    for entry in land["boroughs"]:
        if entry["name"] != borough:
            continue
        kept = []
        for polygon in entry["polygons"]:
            outline = Polygon(polygon["outer"])
            # An outline that lies almost wholly within reach of the surveyed shore is the same piece of land, drawn coarsely.
            if any(outline.intersection(zone).area > .8 * outline.area for zone in reach):
                replaced += 1
            else:
                kept.append(polygon)
        entry["polygons"] = kept + [{"outer": [[round(float(x), 2), round(float(z), 2)] for x, z in list(shape_.exterior.coords)[:-1]], "holes": []} for shape_ in world]
    path.write_text(json.dumps(land, separators=(",", ":"), ensure_ascii=False) + "\n")
    return replaced


def furniture(points, frame, park, heights):
    """Benches, lamps and statues where OpenStreetMap maps them, in the park's frame."""
    import numpy as np
    result = {}
    for kind in ("bench", "lamp", "statue", "fountain"):
        items = []
        for point in points[kind]:
            tags = point["tags"]
            record = [round(point["x"], 2), round(point["z"], 2)]
            if kind == "bench":
                try:
                    record.append(round(float(tags.get("direction")), 1))
                except (TypeError, ValueError):
                    record.append(None)
            if kind in ("statue", "fountain"):
                record.append(tags.get("name") or "")
            items.append(record)
        result[kind] = items
    return result


def build(cache, output, park_id="central-park", download=False, preview=None):
    import numpy as np
    from PIL import Image
    from shapely.ops import transform
    started = time.time()
    place = PARKS[park_id]
    configure(place)
    # Each park keeps its own downloads; the lidar crowns, which cover the whole city, are kept beside them.
    cache = cache / park_id
    cache.mkdir(parents=True, exist_ok=True)
    outline = park_outline(cache, download, place)
    frame = Frame(outline)
    park = transform(lambda x, z, _=None: frame.local(np.asarray(x), np.asarray(z)), outline)
    print(f"{place['name']}: frame {frame.width} by {frame.depth} m, turned {math.degrees(frame.angle):.2f} degrees; {park.area / 1e6:.3f} km2")
    model = elevation_model(cache, download)
    sample = sampler(model)
    water = water_features(output / "landscape" / "nyc-water.json", frame, park, sample)
    for feature in water:
        print(f"  water {feature.get('name')!s:12} level {feature['elevation']:.2f} m, spread {feature['elevationSpread']:.2f}, area {feature['local'].area:.0f} m2")
    heights = terrain_grid(frame, model, sample, water)
    survey = survey_shapes(cache, download, frame)
    # Where the survey outlines piers, they are part of the ground a visitor walks on, though not of the park.
    piers = piers_of(survey, park)
    ground = park
    if piers:
        from shapely.ops import unary_union
        ground = unary_union([park] + [outline for outline, level in piers]).buffer(.4).buffer(-.4)
        heights = deck_piers(heights, piers)
        print(f"Piers: {len(piers)}, decked at {', '.join(f'{level:.1f}' for outline, level in piers)} m")
    if place["osm"]:
        elements, osm_date = osm_extract(cache, download)
    else:
        elements, osm_date = [], None
    osm_areas, osm_lines, points = osm_shapes(elements, frame, park)
    if place["osm"]:
        print("OpenStreetMap:", {key: len(value) for key, value in osm_areas.items()}, {key: len(value) for key, value in osm_lines.items()}, {key: len(value) for key, value in points.items()})
    row_walks = [geometry for properties, geometry in survey["Sidewalk_2022"] if properties.get("SUB_FEATURE_CODE") == 380000 and geometry.intersects(park)]
    cuts, structures = [], []
    if place["transverses"]:
        print("Transverse roads under cover:")
        cuts = transverse_cuts(elements, frame, park, sample)
        bridges, bridge_shapes = survey_bridges(cache, download, frame, park)
        covers, cover_shapes = lids(cuts, frame, sample, bridge_shapes)
        # A surveyed bridge that mostly lies where a lid does would be drawn twice: the lid, which spans the whole cutting, stays.
        bridges = [bridge for bridge, outline in zip(bridges, bridge_shapes)
                   if not any(outline.intersection(cover).area > .4 * outline.area for cover in cover_shapes)]
        structures = covers + bridges
        print(f"Structures: {len(covers)} lids over the transverse roads, {len(bridges)} surveyed bridges")
        heights = carve(heights, cuts)
    elif place.get("bridges"):
        structures, _ = survey_bridges(cache, download, frame, park)
    # Trees stand on the ground as it ships: the same rounded heights the game will sample.
    shipped = np.clip(np.round((heights - HEIGHT_OFFSET) / HEIGHT_SCALE), 0, 65535) * HEIGHT_SCALE + HEIGHT_OFFSET
    near = park.buffer(3)
    blocked = ([feature["local"] for feature in water]
               + [geometry for name in ("Roadbed_2022", "Sidewalk_2022", "Plaza_2022", "BUILDING_view") for properties, geometry in survey.get(name, [])
                  if geometry.intersects(near) and properties.get("SUB_FEATURE_CODE") != 380000 and (name != "Plaza_2022" or not place["osm"])]
               + osm_areas["building"] + [cut["cut"].buffer(3) for cut in cuts])
    trees, crowns = tree_records(crown_candidates(cache, download, frame, park, place["borough"]), frame, park, row_walks, blocked, shipped)
    surface, over, shares = ground_cover(frame, park, survey, osm_areas, osm_lines, water, crowns, rest_is_lawn=place.get("lawn") == "rest", ground=ground)
    if place["outline"][0] == "shoreline":
        print("Shore: took the place of", redraw_shore(output, frame, ground, place["borough"]), "coarse outline(s) in boroughs.json")
    print("Ground:", shares)

    # --- Write.
    land = output / "landscape"
    park_dir = output / park_id
    park_dir.mkdir(parents=True, exist_ok=True)
    rows, columns = heights.shape
    encoded = np.clip(np.round((heights - HEIGHT_OFFSET) / HEIGHT_SCALE), 0, 65535).astype("<u2")
    (land / f"{park_id}-terrain.bin").write_bytes(encoded.tobytes())
    decoded = encoded.astype(np.float64) * HEIGHT_SCALE + HEIGHT_OFFSET
    corners = [frame.world(x, z) for x in (0, frame.width) for z in (0, frame.depth)]
    bounds = {"minX": min(c[0] for c in corners), "maxX": max(c[0] for c in corners), "minZ": min(c[1] for c in corners), "maxZ": max(c[1] for c in corners)}
    terrain = {"version": 1, "bounds": {"minX": 0, "maxX": frame.width, "minZ": 0, "maxZ": frame.depth}, "frame": frame.describe(),
               "width": columns, "height": rows, "heightsUrl": f"./{park_id}-terrain.bin",
               "heightEncoding": {"type": "uint16", "scale": HEIGHT_SCALE, "offset": HEIGHT_OFFSET},
               "units": "meters", "verticalDatum": "NAVD88 Geoid 12B", "sourceId": "nyc-dem-2017",
               "nodeOrder": "row-major in the park's frame: across the park first, then downtown; nodes include bounds",
               "range": [float(decoded.min()), float(decoded.max())],
               "note": "Lake beds are cut below the mapped water, and sunken roads are cut through under their bridges and tunnels; neither is measured."}
    if piers:
        terrain["note"] = "Pier footprints are raised to deck level above the bathymetric grid."
    elif water and not cuts:
        terrain["note"] = "Lake beds are cut up to 1.8 m below the mapped water surface."
    (land / f"{park_id}-terrain.json").write_text(json.dumps(terrain, separators=(",", ":")) + "\n")
    features = {"version": 1, "water": [{key: value for key, value in feature.items() if key != "local"} for feature in water], "canopies": []}
    (land / f"{park_id}-features.json").write_text(json.dumps(features, separators=(",", ":")) + "\n")
    Image.fromarray(surface, "RGBA").save(park_dir / "surface.png", optimize=True)
    Image.fromarray(over, "RGBA").save(park_dir / "canopy.png", optimize=True)
    (park_dir / "trees.bin").write_bytes(trees.tobytes())
    if structures:
        (park_dir / "structures.json").write_text(json.dumps({"version": 1, "structures": structures}, separators=(",", ":")) + "\n")
    manifest = {
        "version": 1, "id": park_id, "name": place["name"], "region": park_id, "origin": ORIGIN, "frame": frame.describe(),
        "size": {"width": frame.width, "depth": frame.depth}, "bounds": bounds,
        "surface": {"url": "./surface.png", "metresPerPixel": COVER, "reach": REACH, "channels": ["paved", "lawn", "bare", "rock"],
                    "encoding": "distance to the edge of each kind, positive inside: (value / 255 - 0.5) * 2 * reach metres"},
        "canopy": {"url": "./canopy.png", "metresPerPixel": CANOPY, "channels": ["crowns", "woodland", "courts", "park"]},
        "trees": {"url": "./trees.bin", "count": int(len(trees)), "record": ["x", "z", "ground", "height", "radius", "low"],
                  "scale": [.1, .1, HEIGHT_SCALE, .01, .01, .01], "offset": [0, 0, HEIGHT_OFFSET, 0, 0, 0],
                  "note": "x and z are in the park's frame. height is the crown's top above the ground, radius that of a circle of the crown's area, low the tenth percentile of the canopy's top surface."},
        "furniture": furniture(points, frame, park, heights),
        "ground": shares,
        "sources": {
            "terrain": {"title": "NYC 2017 topobathymetric LiDAR DEM", "url": DEM},
            "outlines": {"title": "NYC OTI 2022 planimetrics: " + ", ".join(place["layers"]) + (", Shoreline_2022" if place["outline"][0] == "shoreline" else ""), "url": SURVEY},
            "water": {"title": "NYC OTI 2022 Planimetric Hydrography", "url": "https://data.cityofnewyork.us/d/pjs3-c3z5"},
            "crowns": {"title": "Trees in New York City", "citation": "Ma, Qin (2022). Trees in New York City. figshare. https://doi.org/10.6084/m9.figshare.20522895.v2", "license": "CC BY 4.0"},
        },
    }
    if structures:
        manifest["structures"] = {"url": "./structures.json", "count": len(structures),
                                  "note": ("Bridges the survey outlines, and a lid over each stretch of sunken road that runs under a drive or a hillside: the terrain there is cut down to the roadway, and the lid stands at the heights the elevation model has."
                                           if cuts else "Bridge decks interpolated between the 2022 surveyed outline elevations.")}
    if place.get("bridges"):
        manifest["sources"]["outlines"]["title"] += ", Transport_Structure_2022"
    if place["osm"]:
        manifest["sources"]["cover"] = {"title": "OpenStreetMap", "attribution": "© OpenStreetMap contributors", "license": "ODbL 1.0", "url": "https://www.openstreetmap.org/copyright", "extractDate": osm_date,
                                        "use": "lawns, woods, rock, sand, playing fields, playgrounds, unsurveyed paths, benches, lamps and statues"}
    (park_dir / "park.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    # The list of parks the game draws this way.
    listed = output / "parks.json"
    parks = json.loads(listed.read_bytes())["parks"] if listed.exists() else []
    parks = [entry for entry in parks if entry["id"] != park_id] + [{"id": park_id, "name": place["name"], "base": f"./{park_id}/", "bounds": bounds}]
    parks.sort(key=lambda entry: list(PARKS).index(entry["id"]) if entry["id"] in PARKS else len(PARKS))
    listed.write_text(json.dumps({"version": 1, "parks": parks}, separators=(",", ":")) + "\n")

    # --- The landscape index: the park is a region of measured ground like any other, and takes the place of any patch it outgrew.
    index_path = output / "landscape-index.json"
    index = json.loads(index_path.read_bytes())
    view = place["view"]
    region = {"id": park_id, "name": place["name"], "borough": place["borough"], "bounds": bounds, "bbox": list(BBOX),
              "terrainUrl": f"./landscape/{park_id}-terrain.json", "featuresUrl": f"./landscape/{park_id}-features.json", "sourceId": "nyc-dem-2017",
              "view": {"x": round(float(view[0]), 3), "z": round(float(view[1]), 3), "heading": view[2], **({"angle": view[2], "exact": True} if place.get("exact") else {})},
              "stats": {"water": len(water), "canopies": 0, "trees": int(len(trees)), "terrainNodes": int(rows * columns)}}
    if place.get("presets"):
        region["presets"] = place["presets"]
    stale = set(place.get("replaces", ()))
    others = [other for other in index["regions"] if other["id"] != park_id and other["id"] not in stale]
    order = list(PARKS)
    mapped = sorted([other for other in others if other["id"] in PARKS] + [region], key=lambda entry: order.index(entry["id"]))
    index["regions"] = mapped + [other for other in others if other["id"] not in PARKS]
    for name in stale:
        for suffix in ("terrain.json", "features.json"):
            (land / f"{name}-{suffix}").unlink(missing_ok=True)
    index["stats"]["bytes"] = sum(path.stat().st_size for path in land.iterdir() if path.suffix in (".json", ".bin"))
    index["stats"]["canopies"] = sum(other["stats"]["canopies"] for other in index["regions"])
    index["stats"]["parkTrees"] = sum(other["stats"].get("trees", 0) for other in index["regions"])
    index_path.write_text(json.dumps(index, separators=(",", ":"), ensure_ascii=False) + "\n")

    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        tone = np.zeros(surface.shape[:2] + (3,), dtype=np.float32) + np.array([70, 92, 48], dtype=np.float32)
        big = np.repeat(np.repeat(over, 2, axis=0), 2, axis=1)[:surface.shape[0], :surface.shape[1]].astype(np.float32) / 255
        tone = tone * (1 - big[..., 1:2]) + np.array([48, 62, 36], dtype=np.float32) * big[..., 1:2]
        for channel, colour in ((1, (96, 140, 60)), (2, (176, 140, 100)), (3, (120, 120, 124)), (0, (60, 60, 64))):
            inside = (surface[..., channel] > 127)[..., None]
            tone = np.where(inside, np.array(colour, dtype=np.float32), tone)
        tone = np.where(big[..., 2:3] > .5, np.array([70, 110, 120], dtype=np.float32), tone)
        tone = tone * (1 - .45 * big[..., 0:1])
        tone = tone * big[..., 3:4] + np.array([30, 30, 30], dtype=np.float32) * (1 - big[..., 3:4])
        Image.fromarray(tone.astype(np.uint8), "RGB").save(preview / "cover.png")
        shade = (decoded - decoded.min()) / (decoded.max() - decoded.min())
        Image.fromarray((shade * 255).astype(np.uint8), "L").save(preview / "terrain.png")
    sizes = {path.name: path.stat().st_size for path in [land / f"{park_id}-terrain.bin", park_dir / "surface.png", park_dir / "canopy.png", park_dir / "trees.bin", park_dir / "park.json"]}
    print("Wrote", sizes, f"in {time.time() - started:.0f} s")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--park", choices=sorted(PARKS), default="central-park")
    parser.add_argument("--cache", type=Path, default=Path("/tmp/nyc-parks"), help="Downloads are kept here, each park's in a folder of its own")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--preview", type=Path, help="Also write flat pictures of the ground cover and the terrain here")
    arguments = parser.parse_args(argv)
    build(arguments.cache, arguments.output, arguments.park, arguments.download, arguments.preview)


if __name__ == "__main__":
    main()
