#!/usr/bin/env python3
"""Rebuild the bounded Meadow Lake road pilot from traceable NYC source data.

Install scripts/requirements-reconstruction-ai.txt in a virtual environment.
Offline: python scripts/build-road-pilot.py
Refresh: python scripts/build-road-pilot.py --download --cache /tmp/nyc-road-pilot

The bundled source snapshots make ordinary rebuilds network-independent. Source
polygons define pavement coverage. Survey elevations constrain a measured DEM;
no image model predicts heights, curb dimensions or missing bridge approaches.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('landscape_import', ROOT / 'scripts/import-landscape.py')
LAND = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAND)
ARCGIS = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/'
LAYERS = {'elevation': 'Elevation_2022/FeatureServer/6', 'pavement-edge': 'Pavement_Edge_2022/FeatureServer/14',
          'curb-cut': 'Curb_Cut_2022/FeatureServer/5', 'transport': 'Transport_Structure_2022/FeatureServer/25'}
FOOT = 1200 / 3937
WIDTH, HEIGHT = 349, 465
BLEND_METERS = 20
CONSTRAINT_RADIUS = 20
MAX_GROUND_RESIDUAL = 1.0


def write(path, value):
    LAND.compact_write(Path(path), value)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def query_url(layer, bbox):
    return ARCGIS + LAYERS[layer] + '/query?' + urlencode({
        'where': '1=1', 'geometry': ','.join(map(str, bbox)), 'geometryType': 'esriGeometryEnvelope',
        'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'f': 'json', 'outFields': '*',
        'outSR': 4326, 'returnZ': 'true', 'resultRecordCount': 2000, 'orderByFields': 'OBJECTID'})


def validate_response(data):
    if data.get('error') or data.get('exceededTransferLimit') or not isinstance(data.get('features'), list):
        raise ValueError('Invalid or truncated official survey response')
    if len(data['features']) >= 2000:
        raise ValueError('Survey snapshot may be truncated')
    return data['features']


def acquire(cache, source, bbox, download):
    source.mkdir(parents=True, exist_ok=True)
    if download:
        cache.mkdir(parents=True, exist_ok=True)
        for kind in LAYERS:
            path = cache / f'{kind}.json'
            # Reuse only the exact bounded request recorded beside a download.
            request = cache / f'{kind}-request.json'
            url = query_url(kind, bbox)
            if not path.exists() or not request.exists() or json.loads(request.read_text()) != url:
                LAND.fetch(url, path)
                write(request, url)
            validate_response(json.loads(path.read_bytes()))
            shutil.copyfile(path, source / f'{kind}.json')
        dem_path, metadata = LAND.acquire_dem(cache, 'meadow-road-pilot', bbox, WIDTH, HEIGHT, True)
        raw = LAND.decode_terrain(dem_path, bbox, WIDTH, HEIGHT)
        raw['sourceQuery'] = metadata['url']
        write(source / 'raw-dem.json', raw)
    for name in [*(f'{kind}.json' for kind in LAYERS), 'raw-dem.json']:
        if not (source / name).exists():
            raise FileNotFoundError(f'Missing {name}; run with --download')


def sample_grid(grid, x, z):
    """Use exactly the north-west/south-east triangle split in landscape.js."""
    b, width, height = grid['bounds'], grid['width'], grid['height']
    if not b['minX'] - 1e-7 <= x <= b['maxX'] + 1e-7 or not b['minZ'] - 1e-7 <= z <= b['maxZ'] + 1e-7:
        return None
    gx = min(width - 1, max(0, (x - b['minX']) / (b['maxX'] - b['minX']) * (width - 1)))
    gz = min(height - 1, max(0, (z - b['minZ']) / (b['maxZ'] - b['minZ']) * (height - 1)))
    column, row = min(width - 2, int(gx)), min(height - 2, int(gz))
    u, v = gx - column, gz - row
    a = row * width + column
    if u + v <= 1:
        indices = [a, a + 1, a + width]
    else:
        indices = [a + width + 1, a + width, a + 1]
        u, v = 1 - u, 1 - v
    values = [grid['heights'][i] for i in indices]
    if any(y is None for y in values):
        return None
    return values[0] + (values[1] - values[0]) * u + (values[2] - values[0]) * v


def grid_nodes(grid):
    b = grid['bounds']
    for row in range(grid['height']):
        z = b['minZ'] + row * (b['maxZ'] - b['minZ']) / (grid['height'] - 1)
        for column in range(grid['width']):
            x = b['minX'] + column * (b['maxX'] - b['minX']) / (grid['width'] - 1)
            yield row * grid['width'] + column, x, z


def edge_distance(bounds, x, z):
    return min(x - bounds['minX'], bounds['maxX'] - x, z - bounds['minZ'], bounds['maxZ'] - z)


def blend_grid(grid, baseline, margin=BLEND_METERS):
    result = {**grid, 'heights': list(grid['heights'])}
    for index, x, z in grid_nodes(grid):
        distance = edge_distance(grid['bounds'], x, z)
        if distance >= margin or grid['heights'][index] is None:
            continue
        y = baseline(x, z)
        if y is not None:
            weight = max(0, distance / margin)
            result['heights'][index] = y * (1 - weight) + grid['heights'][index] * weight
    return result


def parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [part for child in getattr(geometry, 'geoms', []) for part in parts(child)]


def local_shape(geojson):
    import numpy as np
    from shapely import transform
    from shapely.geometry import shape
    def project(coordinates):
        longitude, latitude = coordinates[:, 0], coordinates[:, 1]
        return np.column_stack((LAND.EARTH_RADIUS * np.radians(longitude - LAND.ORIGIN['lon']) * math.cos(math.radians(LAND.ORIGIN['lat'])),
                                -LAND.EARTH_RADIUS * np.radians(latitude - LAND.ORIGIN['lat'])))
    return transform(shape(geojson), project)


def transport_polygons(data, bounds):
    from shapely.geometry import Polygon, box
    from shapely.ops import unary_union
    region = box(bounds['minX'], bounds['minZ'], bounds['maxX'], bounds['maxZ'])
    output = []
    for feature in validate_response(data):
        props = feature['attributes']
        if props['FEATURE_CODE'] not in (2300, 2350):
            continue
        rings = [[LAND.project(*p[:2]) for p in ring] for ring in feature['geometry']['rings']]
        # These bounded official records contain one exterior each. Reject an
        # unsupported ring arrangement rather than silently filling a hole.
        if len(rings) != 1:
            raise ValueError('Review bridge multipart/ring topology before import')
        polygon = Polygon(rings[0])
        if not polygon.is_valid:
            raise ValueError('Invalid bridge source footprint')
        clipped = polygon.intersection(region)
        for index, part in enumerate(parts(clipped)):
            output.append({'id': f"transport:arcgis-{props['OBJECTID']}:{index}", 'sourceId': str(props['SOURCE_ID']),
                           'polygon': part, 'sourceSubcode': props['SUB_FEATURE_CODE']})
    return output, unary_union([item['polygon'] for item in output])


def survey_points(data, raw, pavement, bridge_mask):
    from shapely.geometry import Point
    accepted, rejected, points = [], [], []
    for feature in validate_response(data):
        props, geometry = feature['attributes'], feature['geometry']
        x, z = LAND.project(geometry['x'], geometry['y'])
        y = props['ELEVATION'] * FOOT
        if not all(math.isfinite(v) for v in [x, y, z]):
            raise ValueError('Non-finite official elevation')
        point = Point(x, z)
        kind = 'bridge' if props['SUB_FEATURE_CODE'] == 300020 else 'ground' if props['SUB_FEATURE_CODE'] == 300000 else 'building'
        record = {'id': f"elevation:{props['OBJECTID']}", 'sourceId': str(props['SOURCE_ID']), 'kind': kind,
                  'x': round(x, 6), 'y': round(y, 6), 'z': round(z, 6), 'sourceFeet': props['ELEVATION']}
        measured = sample_grid(raw, x, z)
        record['demResidual'] = round(y - measured, 6) if measured is not None else None
        # Some nominal SPOT records occur on bridge approaches/decks. Spatial
        # separation is essential: using them as bare earth would fill underpasses.
        if kind != 'ground':
            reason = 'Separate elevated or building surface'
        elif bridge_mask.buffer(2).covers(point):
            reason = 'Inside elevated transport footprint'
        elif pavement.distance(point) > 1:
            reason = 'Outside mapped ground pavement'
        elif measured is None or abs(y - measured) > MAX_GROUND_RESIDUAL:
            reason = 'Survey/DEM disagreement exceeds 1 m; requires review'
        elif edge_distance(raw['bounds'], x, z) < BLEND_METERS:
            reason = 'Inside terrain edge transition; retain as review evidence'
        else:
            reason = None
        record['usedAsGroundConstraint'] = reason is None
        if reason:
            record['reason'] = reason
            rejected.append(record)
        else:
            accepted.append(record)
        points.append(record)
    return points, accepted, rejected


def constrain_ground(raw, constraints, pavement, bridge_mask):
    """Smooth residual correction, never mix a deck's height into bare earth.

    A compact inverse-distance field reconciles nearby 2022 road spots with the
    2017 DEM. The DEM's local grade remains, and the correction fades over 3 m
    outside mapped pavement. Interpolated nodes are not additional measurements.
    """
    import numpy as np
    from scipy.spatial import cKDTree
    from shapely.geometry import Point
    result = {**raw, 'heights': list(raw['heights'])}
    if not constraints:
        return result
    points = np.array([[p['x'], p['z']] for p in constraints])
    residuals = np.array([p['demResidual'] for p in constraints])
    tree = cKDTree(points)
    for index, x, z in grid_nodes(raw):
        if raw['heights'][index] is None:
            continue
        point = Point(x, z)
        distance_to_pavement = pavement.distance(point)
        if distance_to_pavement >= 3 or bridge_mask.covers(point):
            continue
        nearby = tree.query_ball_point([x, z], CONSTRAINT_RADIUS)
        if not nearby:
            continue
        distances = np.linalg.norm(points[nearby] - [x, z], axis=1)
        weights = (1 - distances / CONSTRAINT_RADIUS) ** 2 / np.maximum(distances, 0.05) ** 2
        # The added unit denominator makes the compact field approach zero at
        # its outer support boundary, avoiding a seam at the last survey point.
        exactness = min(1, float(distances.min()) / 0.5) ** 2
        correction = float(np.dot(weights, residuals[nearby]) / (weights.sum() + 0.005 * exactness))
        result['heights'][index] += correction * (1 - distance_to_pavement / 3)
    return result


def clip_lines(data, bounds, kind):
    from shapely.geometry import LineString, box
    region = box(bounds['minX'], bounds['minZ'], bounds['maxX'], bounds['maxZ'])
    records = []
    for feature in validate_response(data):
        props = feature['attributes']
        for path_index, path in enumerate(feature['geometry'].get('paths', [])):
            values = [[*LAND.project(*p[:2]), p[2] * FOOT] for p in path]
            line = LineString(values).intersection(region)
            lines = [line] if line.geom_type == 'LineString' else list(getattr(line, 'geoms', []))
            for index, piece in enumerate(lines):
                if piece.geom_type != 'LineString' or piece.is_empty:
                    continue
                records.append({'id': f"{kind}:{props['OBJECTID']}:{path_index}:{index}", 'sourceId': str(props['SOURCE_ID']),
                                'subcode': props['SUB_FEATURE_CODE'],
                                'points': [[round(x, 6), round(y, 6), round(z, 6)] for x, z, y in piece.coords]})
    return records


def mesh_from_grid(polygon, terrain):
    """Clip every underlying terrain triangle, keeping holes and shared heights."""
    import numpy as np
    from shapely import constrained_delaunay_triangles
    from shapely.geometry import Polygon
    b, w, h = terrain['bounds'], terrain['width'], terrain['height']
    dx, dz = (b['maxX'] - b['minX']) / (w - 1), (b['maxZ'] - b['minZ']) / (h - 1)
    minx, minz, maxx, maxz = polygon.bounds
    positions, indices, vertices = [], [], {}
    def vertex(x, z):
        # Float32 is the renderer's actual storage. Quantize XZ first and sample
        # that coordinate so collision and visual vertices remain colocated.
        x, z = float(np.float32(x)), float(np.float32(z))
        y = sample_grid(terrain, x, z)
        if y is None:
            x = max(b['minX'], min(b['maxX'], x)); z = max(b['minZ'], min(b['maxZ'], z))
            y = sample_grid(terrain, x, z)
        key = (x, float(np.float32(y)), z)
        if key not in vertices:
            vertices[key] = len(positions) // 3
            positions.extend(round(v, 7) for v in key)
        return vertices[key]
    for row in range(max(0, int((minz - b['minZ']) / dz)), min(h - 2, int((maxz - b['minZ']) / dz)) + 1):
        z0, z1 = b['minZ'] + row * dz, b['minZ'] + (row + 1) * dz
        for col in range(max(0, int((minx - b['minX']) / dx)), min(w - 2, int((maxx - b['minX']) / dx)) + 1):
            x0, x1 = b['minX'] + col * dx, b['minX'] + (col + 1) * dx
            for points in [[(x0,z0),(x0,z1),(x1,z0)], [(x1,z0),(x0,z1),(x1,z1)]]:
                triangle = Polygon(points)
                for part in parts(polygon.intersection(triangle)):
                    if part.area < 1e-8:
                        continue
                    for face in constrained_delaunay_triangles(part).geoms:
                        coords = list(face.exterior.coords)[:3]
                        signed = (coords[1][0]-coords[0][0])*(coords[2][1]-coords[0][1])-(coords[1][1]-coords[0][1])*(coords[2][0]-coords[0][0])
                        if signed > 0:
                            coords.reverse()
                        face_indices = [vertex(x,z) for x,z in coords]
                        if len(set(face_indices)) == 3:
                            indices.extend(face_indices)
    return {'positions': positions, 'indices': indices}


def partition_coverage(footprints):
    """One ground owner per square metre, with stable source-based precedence.

    NYC roadbed and parking classes can overlap along shared entrances. Both
    remain source evidence, but drawing both introduces coplanar flicker. Keep
    roadbeds before parking and subtract previously accepted source coverage.
    This changes ownership only; it adds neither pavement nor invented edges.
    """
    from shapely.geometry import GeometryCollection
    from shapely.ops import unary_union
    accepted, repairs = [], []
    coverage = GeometryCollection()
    order = sorted(footprints, key=lambda item: (0 if item[0]['kind'] == 'roadbed' else 1,
                                                item[0]['sourceFeatureId'], item[1]))
    counters = {}
    for props, _, polygon in order:
        overlaps = [{'sourceFeatureId': previous['sourceFeatureId'], 'areaSquareMeters': round(polygon.intersection(shape).area, 6)}
                    for previous, _, shape in accepted if polygon.intersection(shape).area > 1e-7]
        remaining = polygon.difference(coverage)
        if overlaps:
            repairs.append({'sourceFeatureId': props['sourceFeatureId'], 'removedAreaSquareMeters': round(polygon.area - remaining.area, 6),
                            'retainedBy': overlaps, 'method': 'Earlier roadbed/parking source footprint owns intersecting ground area'})
        for part in sorted(parts(remaining), key=lambda shape: (*shape.bounds, shape.area)):
            if part.area <= 0.01:
                continue
            index = counters.get(props['sourceFeatureId'], 0)
            counters[props['sourceFeatureId']] = index + 1
            accepted.append((props, index, part))
        coverage = unary_union([coverage, remaining])
    return accepted, repairs


def boundary_error(grid, baseline, spacing=.25):
    """Quantify interpolation error between the patch edge and its parent LOD."""
    bounds = grid['bounds']
    maximum = 0
    for side in ('west', 'east', 'north', 'south'):
        length = bounds['maxZ'] - bounds['minZ'] if side in ('west', 'east') else bounds['maxX'] - bounds['minX']
        steps = math.ceil(length / spacing)
        for index in range(steps + 1):
            t = index / steps
            x = bounds['minX'] if side == 'west' else bounds['maxX'] if side == 'east' else bounds['minX'] + t * (bounds['maxX'] - bounds['minX'])
            z = bounds['minZ'] if side == 'north' else bounds['maxZ'] if side == 'south' else bounds['minZ'] + t * (bounds['maxZ'] - bounds['minZ'])
            expected, actual = baseline(x, z), sample_grid(grid, x, z)
            if expected is None or actual is None:
                raise ValueError('Terrain seam requires complete baseline and overlay coverage')
            maximum = max(maximum, abs(expected - actual))
    return maximum


def build(output, source):
    from shapely.geometry import Point
    from shapely.ops import unary_union
    review = json.loads((output / 'road-reconstruction-review.json').read_bytes())
    reference = json.loads((output / 'road-reconstruction/reference.geojson').read_bytes())
    raw = json.loads((source / 'raw-dem.json').read_bytes())
    bridges, bridge_mask = transport_polygons(json.loads((source / 'transport.json').read_bytes()), raw['bounds'])
    footprints, skipped = [], []
    for feature in reference['features']:
        props = feature['properties']
        if props['kind'] == 'roadbed' and str(props['sourceSubcode']) != '350000':
            skipped.append({'id': props['sourceFeatureId'], 'reason': 'Shoulder/island subtype retained as original imagery'})
            continue
        polygon = local_shape(feature['geometry'])
        if not polygon.is_valid:
            raise ValueError('Invalid mapped road footprint')
        ground = polygon.difference(bridge_mask)
        for index, part in enumerate(parts(ground)):
            if part.area > 0.01:
                footprints.append((props, index, part))
    footprints, repairs = partition_coverage(footprints)
    pavement = unary_union([part for _, _, part in footprints])
    points, constraints, rejected = survey_points(json.loads((source / 'elevation.json').read_bytes()), raw, pavement, bridge_mask)
    constrained = constrain_ground(raw, constraints, pavement, bridge_mask)
    base = json.loads((output / 'landscape/nyc-terrain.json').read_bytes())
    detail_raw = json.loads((output / 'landscape/meadow-lake-terrain.json').read_bytes())
    detail = blend_grid(detail_raw, lambda x,z: sample_grid(base,x,z))
    baseline = lambda x,z: sample_grid(detail,x,z) if sample_grid(detail,x,z) is not None else sample_grid(base,x,z)
    terrain = blend_grid(constrained, baseline)
    terrain['range'] = [min(y for y in terrain['heights'] if y is not None), max(y for y in terrain['heights'] if y is not None)]
    terrain.update({'sourceId': 'road-pilot-survey-terrain', 'heights': [None if y is None else round(y,6) for y in terrain['heights']],
                    'rawSourceId': raw['sourceId'], 'rawGridUrl': './raw-dem.json', 'alreadyBlended': True,
                    'edgeBlendMeters': BLEND_METERS, 'constraintMethod': 'Bounded inverse-distance residuals from vetted 2022 ground road spots; 20m support; 3m outside-pavement fade',
                    'constraintIds': [p['id'] for p in constraints], 'verticalDatum': 'NAVD88',
                    'baselineHashes': {'base': sha(output/'landscape/nyc-terrain.json'), 'meadowLake': sha(output/'landscape/meadow-lake-terrain.json')}})
    seam_error = boundary_error(terrain, baseline)
    if seam_error > .05:
        raise ValueError(f'Road pilot terrain seam exceeds 5 cm: {seam_error:.4f} m')
    write(source / 'terrain.json', terrain)
    features = []
    for props, index, polygon in footprints:
        geometry = mesh_from_grid(polygon, terrain)
        features.append({'id': props['sourceFeatureId'] + (f':ground-{index}' if index else ''), 'sourceFeatureId': props['sourceFeatureId'],
                         'sourceId': props['sourceId'], 'sourceUrl': props['sourceUrl'], 'kind': props['kind'],
                         'sourceSubcode': props['sourceSubcode'], 'elevationSource': terrain['sourceId'],
                         'outer': [[round(x,6),round(z,6)] for x,z in list(polygon.exterior.coords)[:-1]],
                         'holes': [[[round(x,6),round(z,6)] for x,z in list(ring.coords)[:-1]] for ring in polygon.interiors],
                         'geometry': geometry, 'areaSquareMeters': round(polygon.area,3)})
    survey = {'elevationPoints': points, 'pavementEdges': clip_lines(json.loads((source/'pavement-edge.json').read_bytes()),raw['bounds'],'pavement-edge'),
              'curbCuts': clip_lines(json.loads((source/'curb-cut.json').read_bytes()),raw['bounds'],'curb-cut'), 'bridges': []}
    for bridge in bridges:
        near = [p for p in points if bridge['polygon'].buffer(2).covers(Point(p['x'],p['z']))]
        survey['bridges'].append({'id': bridge['id'], 'sourceId': bridge['sourceId'], 'outer': [[round(x,6),round(z,6)] for x,z in list(bridge['polygon'].exterior.coords)[:-1]],
                                  'elevationPointIds': [p['id'] for p in near], 'status': 'review-required',
                                  'reason': 'Footprint Z values are placeholder zero; sparse deck spots do not establish transverse grade and connected approaches. Not baked into ground.'})
    write(source / 'survey-review.json', survey)
    sources = {kind: {'title': f'NYC OTI 2022 {kind}', 'url': ARCGIS+layer, 'queryUrl': query_url(kind,review['imagery']['bbox']),
                     'captureYear':2022,'units':'US survey feet','verticalDatum':'NAVD88','snapshotUrl':f'./road-pilot-source/{kind}.json',
                     'sha256':sha(source/f'{kind}.json'), 'records':len(validate_response(json.loads((source/f'{kind}.json').read_bytes())))} for kind,layer in LAYERS.items()}
    sources['dem']={'title':'NYC 2017 topobathymetric LiDAR DEM','url':LAND.DEM,'queryUrl':raw['sourceQuery'],
                    'units':'meters','verticalDatum':'NAVD88 Geoid 12B','snapshotUrl':'./road-pilot-source/raw-dem.json',
                    'sha256':sha(source/'raw-dem.json'),'sourceTiffSha256':raw['sourceSha256'],'captureYear':2017}
    sources['footprints']={'title':'NYC OTI 2022 roadbed and parking footprints','url':'./road-reconstruction/reference.geojson',
                          'sha256':sha(output/'road-reconstruction/reference.geojson'),'captureYear':2022}
    errors=[abs(sample_grid(terrain,p['x'],p['z'])-p['y']) for p in constraints]
    result={'version':1,'id':'meadow-lake-road-pilot','name':'Meadow Lake road reconstruction','origin':LAND.ORIGIN,'bbox':review['imagery']['bbox'],
            'bounds':raw['bounds'],'units':'meters','elevationUnits':'meters','verticalDatum':'NAVD88',
            'spawn':{'x':13787.56,'z':-1396.235,'angle':-0.3609033336059268,'roadId':'cscl:111892:2'},
            'terrain':{'url':'./road-pilot-source/terrain.json','bounds':raw['bounds'],'sourceId':terrain['sourceId'],'alreadyBlended':True,'edgeBlendMeters':BLEND_METERS,
                       'requiredRegions':['meadow-lake'],'baselineHashes':terrain['baselineHashes'],'sha256':sha(source/'terrain.json')},
            'features':features,'survey':{'url':'./road-pilot-source/survey-review.json','sha256':sha(source/'survey-review.json')},'sources':sources,
            'topologyRepairs':{'policy':'roadbed before parking, then stable sourceFeatureId; subtract already accepted ground coverage',
                               'features':repairs,'removedOverlapSquareMeters':round(sum(item['removedAreaSquareMeters'] for item in repairs),6)},
            'stats':{'features':len(features),'vertices':sum(len(f['geometry']['positions'])//3 for f in features),'triangles':sum(len(f['geometry']['indices'])//3 for f in features),
                     'areaSquareMeters':round(sum(f['areaSquareMeters'] for f in features),2),'terrainNodes':WIDTH*HEIGHT,'groundConstraints':len(constraints),
                     'elevationPoints':len(points),'pavementEdges':len(survey['pavementEdges']),'curbCuts':len(survey['curbCuts']),'bridgesDeferred':len(bridges),
                     'maxBoundaryErrorMeters':round(seam_error,6),
                     'maxGroundConstraintErrorMeters':round(max(errors,default=0),4),'meanGroundConstraintErrorMeters':round(sum(errors)/max(1,len(errors)),4)},
            'skipped':skipped,'limitations':['Bounded pilot, not citywide reconstructed pavement.',
                'Survey spots from 2022 and bare-earth DEM from 2017 differ in capture date and sampling; interpolated node heights are estimates.',
                'Sparse elevated bridge survey points are review evidence only; no guessed bridge joins, curb heights, lamps or lane markings.',
                'Ground is blended to existing DEM levels over the outer 20m for continuous travel. Native raw DEM and survey snapshots are retained.',
                'Pavement edges and curb cuts are preserved as surveyed review evidence; no curb dimensions are inferred.']}
    write(output/'road-pilot.json',result)
    write(output/'road-pilot-index.json', {key: result[key] for key in ('version','id','name','bounds','spawn')} | {
        'manifestUrl':'./road-pilot.json','terrainUrl':'./road-pilot-source/terrain.json','appearanceUrl':'./road-pilot-appearance.json'})
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download',action='store_true')
    parser.add_argument('--cache',type=Path,default=Path('/tmp/nyc-road-pilot'))
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    args=parser.parse_args()
    review=json.loads((args.output/'road-reconstruction-review.json').read_bytes())
    source=args.output/'road-pilot-source'
    acquire(args.cache,source,review['imagery']['bbox'],args.download)
    result=build(args.output,source)
    print(json.dumps(result['stats'],indent=2))


if __name__=='__main__':
    main()
