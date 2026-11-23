"""Bundle park basketball and soccer footprints. Requires Shapely.

python scripts/build-courts.py [saved-survey.json]
"""
import json
import math
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from shapely import affinity
from shapely.geometry import Point, Polygon, box

SOURCE = "https://data.cityofnewyork.us/resource/y6ja-fw4f.json"
SPORTS = {"491010": "basketball", "493000": "soccer"}
BOROUGHS = {"M": 1, "X": 2, "B": 3, "Q": 4, "R": 5}
METRES = math.pi / 180 * 6371008.8


def project(point):
    lon, lat = point[:2]
    return ((lon + 74.0015) * METRES * math.cos(math.radians(40.7235)), (40.7235 - lat) * METRES)


def fit(rings, sport):
    """Fit one playable rectangle inside the surveyed area, including its runoff."""
    poly = Polygon([project(p) for p in rings[0]], [[project(p) for p in r] for r in rings[1:]])
    if not poly.is_valid or poly.area < 50:
        return
    bounds = poly.minimum_rotated_rectangle
    points = list(bounds.exterior.coords)
    dx, dz = max(((b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])),
                 key=lambda edge: math.hypot(*edge))
    angle = math.atan2(dz, dx)
    center = bounds.centroid
    local = affinity.rotate(poly, -angle, origin=center, use_radians=True)
    x0, z0, x1, z1 = local.bounds
    max_length, max_width = (30, 16) if sport == "basketball" else (105, 68)
    length, width = min(x1 - x0 - 1, max_length), min(z1 - z0 - 1, max_width)
    # Some outlines include a path, a clipped corner or several playing areas.
    # Shrink the rectangle until even its corners fit inside the surveyed ground.
    while length >= 10 and width >= 6:
        x, z = center.x, center.y
        if local.covers(box(x - length/2, z - width/2, x + length/2, z + width/2)):
            return dict(x=round(x, 2), z=round(z, 2), angle=round(angle, 6),
                        length=round(length, 2), width=round(width, 2))
        length *= .94
        width *= .94


def main():
    if len(sys.argv) > 1:
        rows = json.loads(Path(sys.argv[1]).read_text())
    else:
        query = urlencode({"$select": "the_geom,park_name,parknum,sub_code,source_id",
                           "$where": "sub_code in (491010,493000)", "$order": "source_id", "$limit": 50000})
        with urlopen(SOURCE + "?" + query, timeout=60) as response:
            rows = json.load(response)
    dist = Path(__file__).resolve().parents[1] / "dist"
    borough_shapes = [(b["code"], Polygon(p["outer"], p["holes"]))
                      for b in json.loads((dist / "boroughs.json").read_text())["boroughs"] for p in b["polygons"]]
    courts = []
    for row in rows:
        sport = SPORTS[row["sub_code"]]
        for rings in row["the_geom"]["coordinates"]:
            frame = fit(rings, sport)
            if frame:
                borough = BOROUGHS.get(row.get("parknum", "")[:1])
                if not borough:
                    center = Point(frame["x"], frame["z"])
                    borough = next((code for code, shape in borough_shapes if shape.covers(center)), 0)
                courts.append(dict(sport=sport, park=row.get("park_name", ""), borough=borough, **frame))
    courts.sort(key=lambda c: (c["park"], c["sport"], c["x"], c["z"]))
    target = dist / "courts.json"
    target.write_text(json.dumps({"source": "https://data.cityofnewyork.us/d/y6ja-fw4f", "courts": courts},
                                 separators=(",", ":"), ensure_ascii=False))
    print(f"{len(courts)} fitted playing areas")


if __name__ == "__main__":
    main()
