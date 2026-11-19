"""Build the playable subway from MTA station, entrance and regular GTFS data."""
import argparse
import csv
import io
import json
import math
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from urllib.request import urlopen

DIST = Path(__file__).resolve().parents[1] / 'dist'
FEED = 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip'
STATIONS = '39hk-dx4f'
ENTRANCES = 'i9wp-a4ja'


def fetch(url):
    with urlopen(url, timeout=90) as response:
        return response.read()


def build(archive, stations, entrances):
    def rows(name):
        return csv.DictReader(io.TextIOWrapper(archive.open(name + '.txt'), encoding='utf-8-sig'))

    origin = json.loads((DIST / 'boroughs.json').read_text())['origin']
    metre = math.pi / 180 * 6371008.8
    def project(lat, lon):
        return (round((float(lon)-origin['lon'])*metre*math.cos(math.radians(origin['lat']))),
                round((origin['lat']-float(lat))*metre))

    platforms = {}
    groups = defaultdict(list)
    for row in sorted(stations,key=lambda r:r['gtfs_stop_id']):
        stop, group = row['gtfs_stop_id'], row['complex_id']
        platforms[stop] = dict(complex=group, name=row['stop_name'], structure=row['structure'],
                               north=row['north_direction_label'], south=row['south_direction_label'])
        groups[group].append(row)
    doors = defaultdict(list)
    exits = defaultdict(list)
    names = defaultdict(Counter)
    for row in sorted(entrances,key=lambda r:(r['gtfs_stop_id'],r['entrance_latitude'],r['entrance_longitude'],r['entrance_type'])):
        stop = row['gtfs_stop_id'].split(';')[0].strip()
        group = platforms[stop]['complex']
        kind = row['entrance_type'].lower()
        x = round((float(row['entrance_longitude']) - origin['lon']) * metre * math.cos(math.radians(origin['lat'])))
        z = round((origin['lat'] - float(row['entrance_latitude'])) * metre)
        portal = [x, z, 1 if 'elevator' in kind else 0 if any(w in kind for w in ['stair','escalator','ramp']) else 2, stop]
        for allowed, result in [('entry_allowed', doors), ('exit_allowed', exits)]:
            if row.get(allowed) == 'YES' and not any(p[2] == portal[2] and math.hypot(p[0]-x,p[1]-z)<4 for p in result[group]):
                result[group].append(portal)
        names[group][row['stop_name'].replace('Square','Sq')] += 1
    complexes = []
    for group, members in groups.items():
        points = doors[group]
        if not points or not exits[group]:
            raise ValueError('No public entrance or exit for complex ' + group)
        routes = sorted({route for row in members for route in row['daytime_routes'].split()})
        complexes.append(dict(id=group, name=names[group].most_common(1)[0][0], routes=' '.join(routes),
                              x=round(sum(p[0] for p in points)/len(points)), z=round(sum(p[1] for p in points)/len(points)),
                              entrances=points, exits=exits[group], stops=[row['gtfs_stop_id'] for row in members]))
    complexes.sort(key=lambda s: (s['name'], s['id']))
    routes = {r['route_id']:dict(name=r['route_short_name'],description=r['route_long_name'],color=r['route_color']) for r in rows('routes')}
    days = 'monday tuesday wednesday thursday friday saturday sunday'.split()
    masks = {r['service_id']:sum(1 << i for i, day in enumerate(days) if r[day]=='1') for r in rows('calendar')}
    stops_data = list(rows('stops'))
    parents = {r['stop_id']:r['parent_station'] for r in stops_data}
    locations = {r['stop_id']:project(r['stop_lat'],r['stop_lon']) for r in stops_data}
    shapes = defaultdict(list)
    for r in rows('shapes'):
        shapes[r['shape_id']].append((int(r['shape_pt_sequence']),project(r['shape_pt_lat'],r['shape_pt_lon'])))
    shapes = {key:[p for _,p in sorted(seq)] for key,seq in shapes.items()}
    trips = {r['trip_id']:r for r in rows('trips')}
    times = defaultdict(list)

    def seconds(value):
        h,m,s = map(int,value.split(':'))
        return 3600*h+60*m+s

    for r in rows('stop_times'):
        times[r['trip_id']].append((int(r['stop_sequence']), parents[r['stop_id']], seconds(r['arrival_time']), seconds(r['departure_time'])))
    patterns = {}
    for trip_id, timetable in times.items():
        row = trips[trip_id]
        timetable.sort()
        stops = tuple(t[1] for t in timetable)
        if any(s not in platforms for s in stops):
            raise ValueError('Unmapped scheduled stop in ' + trip_id)
        key = (row['route_id'], row['direction_id'], row['trip_headsign'], stops, row['shape_id'])
        pattern = patterns.setdefault(key, dict(route=key[0],direction=int(key[1]),headsign=key[2],stops=stops,shape=key[4],profiles={},runs=[]))
        start = timetable[0][2]
        offsets = tuple(value-start for t in timetable for value in t[2:])
        profile = pattern['profiles'].setdefault(offsets,len(pattern['profiles']))
        pattern['runs'].append([start,masks[row['service_id']],profile])
    # Project each call onto its own ordered GTFS shape. Keep bends between
    # calls, including bypassed local stations on express runs. Directed
    # segments shared by trips are stored once in the offline ride data.
    candidates = defaultdict(Counter)
    folded = set()
    for pattern in patterns.values():
        points = shapes[pattern['shape']]
        marks = []
        previous = 0
        for stop in pattern['stops']:
            x,z = locations[stop]
            def nearest(i):
                ax,az = points[i]
                dx,dz = points[i+1][0]-ax,points[i+1][1]-az
                f = max(0,min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz or 1)))
                return ((ax+f*dx-x)**2+(az+f*dz-z)**2, i+f)
            _,at = min((nearest(i) for i in range(int(previous),len(points)-1)
                        if i+1>previous),key=lambda v:v[0])
            if marks and at<=previous:
                raise ValueError('Out-of-order stop on '+pattern['shape']+' at '+stop)
            marks.append(at)
            previous = at
        pattern['tracks'] = []
        for i,(lo,hi) in enumerate(zip(marks,marks[1:])):
            def sample(t):
                k = min(int(t),len(points)-2)
                return tuple(round(a+(b-a)*(t-k)) for a,b in zip(points[k],points[k+1]))
            line = [sample(lo), *points[int(lo)+1:math.ceil(hi)], sample(hi)]
            line = [p for n,p in enumerate(line) if n==0 or p!=line[n-1]]
            if len(line)<2:
                raise ValueError('Empty track segment on '+pattern['shape'])
            key = tuple(c for p in line for c in p)
            pattern['tracks'].append(key)
            # Some Broadway shapes include a dead-end spur followed immediately
            # by a U-turn between scheduled calls. Look for corroborating trips
            # only between these exact platforms and exact projected endpoints.
            for a,b,c in zip(line,line[1:],line[2:]):
                dx,dz = b[0]-a[0],b[1]-a[1]
                ex,ez = c[0]-b[0],c[1]-b[1]
                if dx*ex+dz*ez < math.cos(math.radians(150))*math.hypot(dx,dz)*math.hypot(ex,ez):
                    folded.add(key)
                    break
            if key not in folded:
                pair = (pattern['stops'][i:i+2],key[:2],key[-2:])
                candidates[pair][key] += len(pattern['runs'])
        pattern['profiles'] = list(pattern['profiles'])
        pattern['runs'].sort()
    tracks = {}
    repairs = set()
    headings = defaultdict(list)
    dock_points = defaultdict(Counter)
    for pattern in patterns.values():
        for i,key in enumerate(pattern['tracks']):
            start,end = pattern['stops'][i:i+2]
            pair = ((start,end),key[:2],key[-2:])
            if key in folded and candidates[pair]:
                key = candidates[pair].most_common(1)[0][0]
                repairs.add((pattern['shape'],start,end))
            pattern['tracks'][i] = tracks.setdefault(key,len(tracks))
            weight = len(pattern['runs'])
            sign = 1 if pattern['direction']==0 else -1
            for stop,dock,a,b in [(start,key[:2],key[:2],key[2:4]),(end,key[-2:],key[-4:-2],key[-2:])]:
                dock_points[stop][dock] += weight
                bearing = math.atan2(sign*(b[0]-a[0]),sign*(b[1]-a[1]))
                headings[stop].append((bearing,weight))
    for stop,p in platforms.items():
        p['x'],p['z'] = dock_points[stop].most_common(1)[0][0]
        dirs = headings[stop]
        p['angle'] = round(math.atan2(sum(math.sin(a)*w for a,w in dirs),sum(math.cos(a)*w for a,w in dirs)),5)
    return dict(version=3,tracks=list(tracks),trackRepairs=sorted(repairs), source=dict(name='MTA Subway Entrances and Exits: 2024',url='https://data.ny.gov/d/'+ENTRANCES),
                stationSource='https://data.ny.gov/d/'+STATIONS, scheduleSource=FEED, feed=next(rows('feed_info')),
                kinds=['stair','elevator','door'], stations=complexes, platforms=platforms, routes=routes, patterns=list(patterns.values()))


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--out',type=Path,default=DIST/'transit.json')
    args.add_argument('--gtfs',type=Path)
    args.add_argument('--stations',type=Path)
    args.add_argument('--entrances',type=Path)
    options = args.parse_args()
    def table(path, code):
        return json.loads(path.read_bytes() if path else fetch('https://data.ny.gov/resource/'+code+'.json?$limit=5000&$order=:id'))
    with zipfile.ZipFile(options.gtfs or io.BytesIO(fetch(FEED))) as archive:
        data = build(archive,table(options.stations,STATIONS),table(options.entrances,ENTRANCES))
    options.out.write_text(json.dumps(data, separators=(',',':'), ensure_ascii=False))
    print(f"{len(data['stations'])} complexes, {len(data['platforms'])} stops, {len(data['patterns'])} stopping patterns")
