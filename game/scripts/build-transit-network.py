"""Bundle MTA regular GTFS shapes, boarding patterns and bus departures for an offline game week."""
import argparse
import csv
import datetime as dt
import io
import json
import math
import zipfile
from collections import defaultdict
from itertools import groupby
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1] / 'dist'
ORIGIN = json.loads((ROOT / 'boroughs.json').read_text())['origin']
METRE = math.pi / 180 * 6371008.8
FEEDS = ('subway', 'm', 'bx', 'b', 'q', 'si', 'busco')


def point(lat, lon):
    return (round((float(lon) - ORIGIN['lon']) * METRE * math.cos(math.radians(ORIGIN['lat']))),
            round((ORIGIN['lat'] - float(lat)) * METRE))


def simplify(points):
    """Keep bends more than two metres from a chord."""
    kept = {0, len(points)-1}
    todo = [(0, len(points)-1)]
    while todo:
        lo, hi = todo.pop()
        ax, az = points[lo]
        dx, dz = points[hi][0]-ax, points[hi][1]-az
        length = dx*dx + dz*dz or 1
        worst, split = 4, None
        for i in range(lo+1, hi):
            x, z = points[i][0]-ax, points[i][1]-az
            t = max(0, min(1, (x*dx+z*dz)/length))
            error = (x-t*dx)**2 + (z-t*dz)**2
            if error > worst:
                worst, split = error, i
        if split is not None:
            kept.add(split)
            todo.extend(((lo, split), (split, hi)))
    return [v for i in sorted(kept) for v in points[i]]


def seconds(value):
    h, m, s = map(int, value.split(':'))
    return 3600*h + 60*m + s


def build(cache, monday):
    subway = json.loads((ROOT / 'transit.json').read_text())
    stations = {s['id']:s for s in subway['stations']}
    stops, stop_index, shapes, lines, patterns, schedules, versions = [], {}, [], {}, [], [], {}
    for feed in FEEDS:
        path = cache / (feed + '.zip')
        if not path.exists():
            download = path.with_suffix('.download')
            urlretrieve('https://rrgtfsfeeds.s3.amazonaws.com/gtfs_' + feed + '.zip', download)
            download.replace(path)
        with zipfile.ZipFile(path) as archive:
            def rows(name):
                return csv.DictReader(io.TextIOWrapper(archive.open(name+'.txt'), encoding='utf-8-sig'))
            versions[feed] = next(rows('feed_info'))
            rail = feed == 'subway'
            routes = {r['route_id']:r for r in rows('routes')}
            dates = [(monday+dt.timedelta(days=i)).strftime('%Y%m%d') for i in range(7)]
            masks = {r['service_id']:sum(1<<i for i,day in enumerate('monday tuesday wednesday thursday friday saturday sunday'.split())
                     if r[day]=='1' and r['start_date']<=dates[i]<=r['end_date']) for r in rows('calendar')}
            for r in rows('calendar_dates'):
                if r['date'] in dates:
                    day = 1 << dates.index(r['date'])
                    old = masks.get(r['service_id'], 0)
                    masks[r['service_id']] = old | day if r['exception_type']=='1' else old & ~day
            local_stops = {}
            for r in rows('stops'):
                if rail:
                    platform = subway['platforms'].get(r.get('parent_station'))
                    if not platform:
                        continue
                    station = stations[platform['complex']]
                    key = 'rail:'+station['id']
                    x,z = station['entrances'][0][:2]
                    name = station['name']
                else:
                    x,z = point(r['stop_lat'],r['stop_lon'])
                    key = 'bus:'+r['stop_id']
                    name = r['stop_name']
                idx = stop_index.setdefault(key, len(stops))
                if idx == len(stops):
                    stops.append([x,z,name,key])
                local_stops[r['stop_id']] = idx
            raw = defaultdict(list)
            for r in rows('shapes'):
                raw[r['shape_id']].append((int(r['shape_pt_sequence']),point(r['shape_pt_lat'],r['shape_pt_lon'])))
            paths = {}
            trips = {r['trip_id']:r for r in rows('trips') if masks.get(r['service_id'],0)}
            seen = {}
            for trip_id, group in groupby(rows('stop_times'), lambda r:r['trip_id']):
                trip = trips.get(trip_id)
                if not trip:
                    continue
                calls = sorted(group,key=lambda r:int(r['stop_sequence']))
                if len(calls)<2 or any(r['stop_id'] not in local_stops for r in calls):
                    continue
                route = routes[trip['route_id']]
                line = ('rail:' if rail else 'bus:') + (trip['route_id'] if rail else route['route_short_name'])
                shape = trip['shape_id']
                sequence = tuple(local_stops[r['stop_id']] for r in calls)
                pickup = tuple(i for i,r in enumerate(calls) if r.get('pickup_type')=='1')
                drop = tuple(i for i,r in enumerate(calls) if r.get('drop_off_type')=='1')
                direction = trip.get('direction_id','')
                key = (line,shape,direction,trip['trip_headsign'],sequence,pickup,drop)
                if key not in seen:
                    if shape not in paths:
                        if not raw.get(shape):
                            raise ValueError(f'Missing shape {feed}/{shape}')
                        paths[shape] = len(shapes)
                        shapes.append(simplify([p for _,p in sorted(raw[shape])]))
                    lines[line] = [route['route_short_name'],route['route_long_name'],route['route_color'] or ('0074b9' if not rail else '888888')]
                    seen[key] = len(patterns)
                    patterns.append(dict(line=line,shape=paths[shape],direction=direction,head=trip['trip_headsign'],stops=sequence,noBoard=pickup,noExit=drop))
                    schedules.append({} if not rail else None)
                if not rail:
                    departure = seconds(calls[0]['departure_time'])
                    # Reuse timing profiles across departures; retain every published stop time.
                    offsets = tuple(seconds(r['arrival_time'])-departure for r in calls)
                    dwells = tuple((i,seconds(r['departure_time'])-seconds(r['arrival_time'])) for i,r in enumerate(calls) if r['departure_time']!=r['arrival_time'])
                    profile = schedules[seen[key]].setdefault((offsets,dwells), {})
                    profile[departure] = profile.get(departure,0) | masks[trip['service_id']]
            if not seen:
                raise ValueError(f'No {feed} service for the week starting {monday}')
            print(feed,len(seen),'patterns',flush=True)
    timetable = [None if groups is None else [[offsets,dwells,sorted(runs.items())] for (offsets,dwells),runs in groups.items()] for groups in schedules]
    for name,data in [('transit-network',dict(week=str(monday),feeds=versions,stops=stops,lines=lines,shapes=shapes,patterns=patterns)),('bus-timetable',dict(week=str(monday),profiles=timetable))]:
        target = ROOT / (name+'.json')
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
        temporary.replace(target)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--week',type=dt.date.fromisoformat,required=True)
    args=parser.parse_args()
    if args.week.weekday()!=0:
        parser.error('--week must be a Monday within the downloaded feeds')
    args.cache.mkdir(parents=True,exist_ok=True)
    build(args.cache,args.week)
