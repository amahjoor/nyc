"""Export the NYC planimetric pier/deck polygons with surveyed heights in local metres."""
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

dist = Path(__file__).resolve().parents[1] / "dist"
origin = json.loads((dist / "boroughs.json").read_bytes())["origin"]
scale = math.pi * 6371008.8 / 180
source = "https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Hydro_Structure_2022/FeatureServer/7"
piers = []
offset = 0
while True:
    params = dict(where="FEATURE_CODE=2800 AND SUB_FEATURE_CODE IN (280000,280030,280050)", outFields="OBJECTID,Elevation", outSR=4326, f="geojson",
                  orderByFields="OBJECTID", resultRecordCount=500, resultOffset=offset)
    with urlopen(source + "/query?" + urlencode(params), timeout=90) as response:
        features = json.load(response)["features"]
    for f in features:
        g, props = f["geometry"], f["properties"]
        if not g or props["Elevation"] is None:
            continue
        for rings in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]):
            world = [[[round((lon-origin["lon"])*scale*math.cos(math.radians(origin["lat"])), 2),
                       round((origin["lat"]-lat)*scale, 2)] for lon, lat, *_ in ring[:-1]] for ring in rings]
            piers.append([props["OBJECTID"], round(props["Elevation"]*1200/3937, 2), world])
    if len(features) < 500:
        break
    offset += len(features)
(dist / "landscape" / "piers.json").write_text(json.dumps(dict(source=source, piers=piers), separators=(",", ":"))+"\n")
