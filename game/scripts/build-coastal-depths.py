"""Sample NOAA CUDEM on the game's local grid. Requires rasterio and numpy.

Pass a directory of downloaded NOAA northeast_sandy GeoTIFFs. Source tiles are
listed in the generated manifest. Values are NAVD88 elevations in decimetres.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import Affine

dist = Path(__file__).resolve().parents[1] / "dist"
catalog = "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/dem/NCEI_ninth_Topobathy_2014_8483/northeast_sandy/"
origin = json.loads((dist / "boroughs.json").read_bytes())["origin"]
bounds = json.loads((dist / "road-index.json").read_bytes())["bounds"]
step = 48
x0, z0 = [math.floor(bounds[key] / step) * step for key in ("minX", "minZ")]
cols = math.ceil((bounds["maxX"] - x0) / step) + 1
rows = math.ceil((bounds["maxZ"] - z0) / step) + 1
m_lat = math.radians(1) * 6371008.8
m_lon = m_lat * math.cos(math.radians(origin["lat"]))
transform = Affine(step / m_lon, 0, origin["lon"] + (x0 - step / 2) / m_lon,
                   0, -step / m_lat, origin["lat"] - (z0 - step / 2) / m_lat)
heights = np.full((rows, cols), -9999, np.float32)
sources = []
for tile in sorted(Path(sys.argv[1]).glob("ncei19_*.tif")):
    with rasterio.open(tile) as src:
        reproject(rasterio.band(src, 1), heights, dst_transform=transform, dst_crs="EPSG:4326",
                  dst_nodata=-9999, init_dest_nodata=False, resampling=Resampling.average)
    sources.append(catalog + tile.name)
if not sources:
    raise SystemExit("Supply the NOAA CUDEM tiles listed in coastal-depths.json.")
valid = heights != -9999
encoded = np.full(heights.shape, -32768, dtype="<i2")
encoded[valid] = np.rint(heights[valid] * 10).astype("<i2")
out = dist / "landscape"
(out / "coastal-depths.bin").write_bytes(encoded.tobytes())
(out / "coastal-depths.json").write_text(json.dumps(dict(x=x0, z=z0, step=step, cols=cols, rows=rows,
    scale=.1, noData=-32768, verticalDatum="NAVD88", origin=origin, units="metres", sources=sources), indent=2) + "\n")
print(cols, rows, int(valid.sum()), "surveyed samples")
