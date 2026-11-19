"""Rebuild the offline lane layer from NYC DOT Bike Routes and the game's CSCL tiles."""
import argparse
import collections
import json
import math
import pathlib
import urllib.parse
import urllib.request

DIST = pathlib.Path(__file__).resolve().parents[1] / "dist"
SOURCE = "https://data.cityofnewyork.us/resource/mzxg-pwib.json"
FACILITIES = {"Protected": "protected", "Conventional": "lane", "Curbside": "lane",
              "Conventional Buffered": "buffer", "Curbside Buffered": "buffer",
              "Shared": "shared", "Signed Route": "signed", "Wide Parking Lane": "signed"}
CELL = 64


def project(point):
    lon, lat = point[:2]
    metres = 6371008.8 * math.pi / 180
    return ((lon + 74.0015) * metres * math.cos(math.radians(40.7235)), -(lat - 40.7235) * metres)


def cells(a, b, pad):
    return ((x, z) for x in range(math.floor((min(a[0], b[0])-pad)/CELL), math.floor((max(a[0], b[0])+pad)/CELL)+1)
            for z in range(math.floor((min(a[1], b[1])-pad)/CELL), math.floor((max(a[1], b[1])+pad)/CELL)+1))


def roads():
    grid, seen = collections.defaultdict(list), set()
    ends = collections.defaultdict(list)
    for path in sorted((DIST / "roads").glob("*.json")):
        for road in json.loads(path.read_text()).get("roads", []):
            if road["id"] in seen:
                continue
            seen.add(road["id"])
            pts = road["points"]
            if len(pts)<2:
                continue
            for end, other, level in ((pts[0],pts[1],road.get("fromLevel")), (pts[-1],pts[-2],road.get("toLevel"))):
                dx, dz = other[0]-end[0], other[1]-end[1]
                ends[(round(end[0]),round(end[1]),level or 13)].append((math.atan2(dx,dz),road["width"]))
            for a, b in zip(pts, pts[1:]):
                dx, dz = b[0]-a[0], b[1]-a[1]
                length = math.hypot(dx, dz)
                if length < .1:
                    continue
                edge = (a, dx/length, dz/length, length, road)
                for key in cells(a, b, 9):
                    grid[key].append(edge)
    junctions = collections.defaultdict(list)
    for (x,z,level), arms in ends.items():
        if len(arms)>=3:
            junctions[(x//CELL,z//CELL)].append((x,z,level,arms))
    return grid, junctions


def crossing(junctions, end, other, level):
    angle = math.atan2(other[0]-end[0],other[1]-end[1])
    candidates = []
    for cell in cells(end,end,7):
        for x,z,grade,arms in junctions.get(cell,()):
            d = math.hypot(end[0]-x,end[1]-z)
            if d<=7 and grade==level:
                widths = [width for direction,width in arms if abs(math.sin(angle-direction))>.47]
                if widths:
                    candidates.append((d,round(10*(max(widths)/2+.4))))
    return min(candidates)[1] if candidates else 0


def nearest(grid, a, b):
    dx, dz = b[0]-a[0], b[1]-a[1]
    length = math.hypot(dx, dz)
    if length < .1:
        return None
    x, z = (a[0]+b[0])/2, (a[1]+b[1])/2
    best, match = 9, None
    for start, ux, uz, span, road in grid.get((math.floor(x/CELL), math.floor(z/CELL)), ()):
        align = abs(dx*ux+dz*uz)/length
        if align < .88:
            continue
        along = max(0, min(span, (x-start[0])*ux+(z-start[1])*uz))
        score = math.hypot(x-start[0]-ux*along, z-start[1]-uz*along) + 4*(1-align)
        if score < best:
            best, match = score, road
    return match


def lane_line(grid, points, kind, offstreet, two_way, curbside, paired):
    # DOT supplies direction and linework. CSCL supplies width; striping setbacks are approximate.
    offsets, levels = [], []
    for a, b in zip(points, points[1:]):
        road = nearest(grid, a, b)
        width = (road or {}).get("width", 8)
        side = -1 if kind == "protected" and road and road["oneway"] and (not two_way or paired) else 1
        # Conventional lanes often run on the traffic side of a parking lane.
        parking = 2.15 if not curbside and kind != "protected" and width >= (9 if road and road["oneway"] else 13.5) else 0
        inset = (1.68 if paired or kind in ("shared", "signed") else 1.03) + parking
        shift = 0 if offstreet else side * max(0, width/2-inset)
        dx, dz = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dz) or 1
        levels.append(max((road or {}).get("fromLevel") or 13, (road or {}).get("toLevel") or 13))
        offsets.append((-dz/length*shift, dx/length*shift))
    coords = []
    for i, (x, z) in enumerate(points):
        left, right = offsets[max(0,i-1)], offsets[min(len(offsets)-1,i)]
        coords.extend((round((x+(left[0]+right[0])/2)*10), round((z+(left[1]+right[1])/2)*10)))
    return [kind, max(levels), *coords], side


def fetch():
    rows = []
    while True:
        query = urllib.parse.urlencode({"$where":"status = 'Current'", "$order":":id", "$limit":25000, "$offset":len(rows)})
        with urllib.request.urlopen(SOURCE+"?"+query, timeout=90) as response:
            page = json.load(response)
        rows.extend(page)
        if len(page) < 25000:
            return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-json", type=pathlib.Path, help="Use a previously downloaded Socrata response")
    args = parser.parse_args()
    rows = json.loads(args.from_json.read_text()) if args.from_json else fetch()
    grid, junctions = roads()
    lines, links, nodes, names, seen, boroughs = [], [], {}, {}, set(), collections.Counter()
    def node(pos):
        key=(round(pos[0]*10),round(pos[1]*10))
        return nodes.setdefault(key,len(nodes))
    for row in rows:
        if row.get("status") != "Current":
            continue
        offstreet = row.get("onoffst") == "OFF"
        facilities = []
        for direction in ("ft","tf"):
            kinds = [FACILITIES.get(row.get(direction+key)) for key in ("_facilit","2facilit")]
            facilities.append(next((k for k in ("protected","buffer","lane","shared","signed") if k in kinds), None))
        for coords in row.get("the_geom", {}).get("coordinates", []):
            points = list(map(project, coords))
            if len(points) < 2:
                continue
            mid = (len(points)-1)//2
            road = nearest(grid,points[mid],points[mid+1])
            paired = all(facilities) and (offstreet or (facilities==["protected","protected"] and road and road["oneway"]))
            for reverse, kind in enumerate(facilities):
                if not kind or (paired and reverse):
                    continue
                pts = points[::-1] if reverse else points
                curbside = row.get(("tf" if reverse else "ft")+"_facilit","").startswith("Curbside")
                line, side = lane_line(grid,pts,"path" if offstreet else kind,offstreet,all(facilities),curbside,paired)

                key = tuple(line)
                if key not in seen:
                    seen.add(key)
                    lines.append(line)
                    flags = int(bool(paired)) + (2 if side<0 else 0) + (4 if curbside else 0)
                    street = row.get("street","")
                    links.append([node(pts[0]),node(pts[-1]),names.setdefault(street,len(names)),flags,
                                  crossing(junctions,pts[0],pts[1],line[1]),crossing(junctions,pts[-1],pts[-2],line[1])])

                    boroughs[row["boro"]] += 1
    payload = {"source":SOURCE, "units":"decimetres", "byBorough":boroughs, "lines":lines, "nodes":list(nodes), "streets":list(names), "links":links}
    (DIST/"bike-lanes.json").write_text(json.dumps(payload, separators=(",",":"))+"\n")
    print(f"{len(lines)} lane and path polylines, by borough: {dict(boroughs)}")


if __name__ == "__main__":
    main()
