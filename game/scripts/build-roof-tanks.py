"""Pack NYC's 2022 surveyed water tank centres, radii, base elevations and heights."""
import json
import math
import struct
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

LAYER = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Water_Tank_2022/FeatureServer/27/query'
DIST = Path(__file__).resolve().parents[1] / 'dist'


def query(**params):
    with urlopen(LAYER + '?' + urlencode(dict(f='json', **params)), timeout=90) as response:
        data = json.load(response)
    if 'error' in data:
        raise RuntimeError(data['error'])
    return data


def build():
    origin = json.loads((DIST / 'city-index.json').read_text())['origin']
    metres = 6371008.8 * math.pi / 180
    ids = sorted(query(where='1=1', returnIdsOnly='true')['objectIds'])
    records = bytearray()
    for start in range(0, len(ids), 400):
        batch = ids[start:start + 400]
        rows = query(where=f'OBJECTID >= {batch[0]} AND OBJECTID <= {batch[-1]}', outSR=4326,
                     outFields='OBJECTID,HEIGHT,BASE_ELEVATION,Shape__Area')['features']
        if {row['attributes']['OBJECTID'] for row in rows} != set(batch):
            raise ValueError('Incomplete water tank page')
        for row in sorted(rows, key=lambda r: r['attributes']['OBJECTID']):
            a = row['attributes']
            ring = row['geometry']['rings'][0]
            lon, lat = zip(*ring)
            x = ((min(lon) + max(lon)) / 2 - origin['lon']) * metres * math.cos(math.radians(origin['lat']))
            z = (origin['lat'] - (min(lat) + max(lat)) / 2) * metres
            radius = math.sqrt(a['Shape__Area'] / math.pi) * .3048
            if not a['HEIGHT'] or a['HEIGHT'] <= 0 or a['BASE_ELEVATION'] is None:
                continue
            records.extend(struct.pack('<iiHhH', round(x*100), round(z*100), round(radius*100),
                                       round(a['BASE_ELEVATION']*3.048), round(a['HEIGHT']*30.48)))
    (DIST / 'roof-tanks.bin').write_bytes(records)
    print(f'{len(records)//14} usable tanks from {len(ids)} footprints')


if __name__ == '__main__':
    build()
