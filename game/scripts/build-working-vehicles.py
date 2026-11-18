"""Build the make / model / year mix of NYC's cabs and working vans and pickups.

Yellow cabs come from the TLC's authorized medallion vehicles, boro cabs from
its street hail livery permits, and working vans and pickups from the NYS DMV
register's commercial class in the five counties. Each source is asked only
for counts by the manufacturer's descriptor and the year and plant characters
of a 17-character VIN; NHTSA vPIC supplies make, model and body from those.
No licence, plate, owner or serial number is requested.

Install ultravin==3.0.2 in a venv. Pass --cache DIR to keep the grouped
extracts for offline rebuilds.
"""

import argparse
import importlib.util
import json
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import ultravin

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("catalog", ROOT / "scripts/build-vehicle-catalog.py")
catalog = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(catalog)

TLC = "https://data.cityofnewyork.us"
PARTS = "substring({vin},1,8) as descriptor,substring({vin},10,2) as year_plant,{year} as model_year"
LIMIT = 50_000  # Far above the number of distinct descriptors in any one source.
# Bodies the game can draw for each fleet. A cab decoded as anything else, and
# a box truck the register calls a van, keep their weight without a name.
CAB_BODIES = {"sedan", "suv", "minivan", "hatch", "wagon", "van"}
WORK_BODY = {"VAN": "van", "PICK": "pickup"}
SOURCES = {
    "taxis": {"host": TLC, "dataset": "rhe8-mgbb", "vin": "vehicle_vin_number", "year": "model_year",
              "where": "current_status='CUR' AND length(vehicle_vin_number)=17", "minimum": 5},
    "boroTaxis": {"host": TLC, "dataset": "yhuu-4pt3", "vin": "vehicle_vin_number", "year": "vehicle_year",
                  "where": "active='YES' AND length(vehicle_vin_number)=17", "minimum": 5},
    "work": {"host": catalog.DMV, "dataset": catalog.DATASET, "vin": "vin", "year": "model_year", "extra": ",body_type", "minimum": 20},
}


def work_scope(day):
    counties = ",".join(f"'{county}'" for county in catalog.COUNTIES)
    bodies = ",".join(f"'{code}'" for code in WORK_BODY)
    return (f"record_type='VEH' AND registration_class='COM' AND reg_valid_date <= '{day}' AND reg_expiration_date >= '{day}' "
            f"AND county in({counties}) AND body_type in({bodies}) AND length(vin)=17")


def get(url):
    with urlopen(url, timeout=300) as response:
        return json.load(response)


def fetch(cache, name):
    """Grouped counts for one source, with the revision they were read at."""
    path = cache / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text())
    source = SOURCES[name]
    base = f"{source['host']}/resource/{source['dataset']}.json?"
    updated = get(f"{source['host']}/api/views/{source['dataset']}")["rowsUpdatedAt"]
    day = datetime.fromtimestamp(updated, timezone.utc).date().isoformat()
    where = source.get("where") or work_scope(day)
    extra = source.get("extra", "")
    group = "descriptor,year_plant,model_year" + extra
    select = PARTS.format(vin=source["vin"], year=source["year"]) + extra + ",count(*) as n"
    rows = get(base + urlencode({"$select": select, "$where": where, "$group": group, "$limit": LIMIT}))
    if not 0 < len(rows) < LIMIT:
        raise ValueError(f"Incomplete extract for {name} ({len(rows)} groups)")
    result = {"snapshot": {"date": day, "rowsUpdatedAt": updated}, "filter": where, "rows": rows}
    if name == "work":
        # What colour they are: the register's own codes, as fleet.js reads them.
        result["colors"] = get(base + urlencode({"$select": "color,count(*) as n", "$where": where, "$group": "color", "$limit": LIMIT}))
    if get(f"{source['host']}/api/views/{source['dataset']}")["rowsUpdatedAt"] != updated:
        raise RuntimeError(f"The {name} snapshot changed during the download. Run the build again.")
    path.write_text(json.dumps(result))
    return result


def build(cache):
    out = {"version": 1, "decoder": {"source": "https://vpic.nhtsa.dot.gov/", **ultravin.provenance()}}
    for name, source in SOURCES.items():
        extract = fetch(cache, name)
        counts, total = Counter(), 0
        for row in extract["rows"]:
            n = int(row["n"])
            total += n
            year = int(float(row.get("model_year") or 0))
            identity = catalog.identify(row.get("descriptor") or "", row.get("year_plant") or "", year)
            if not identity:
                continue
            make, model, body = identity
            if name == "work":
                # A cutaway or chassis cab is a box truck whatever the register calls it.
                if body not in ("van", "pickup", "minivan"):
                    continue
                body = WORK_BODY[row["body_type"]] if body != "minivan" else "van"
            elif body not in CAB_BODIES:
                continue
            counts[(make, model, year, body)] += n
        variants = sorted(((*key, n) for key, n in counts.items() if n >= source["minimum"]), key=lambda v: (-v[4], v))
        entry = {"source": f"{source['host']}/d/{source['dataset']}", "snapshot": extract["snapshot"], "filter": extract["filter"],
                 "minimumCount": source["minimum"], "vehicles": total, "represented": sum(v[4] for v in variants), "variants": variants}
        if name == "work":
            colors = Counter()
            for row in extract["colors"]:
                colors[(row.get("color") or "").strip().upper()] += int(row["n"])
            entry["colors"] = dict(colors.most_common(24))
            # Vans and pickups apart, named or not: how the unnamed remainder divides between the two shared bodies.
            entry["bodies"] = {WORK_BODY[code]: sum(int(row["n"]) for row in extract["rows"] if row["body_type"] == code) for code in WORK_BODY}
        out[name] = entry
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--out", type=Path, default=ROOT / "dist/working-vehicles.json")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        cache = args.cache or Path(tmp)
        cache.mkdir(parents=True, exist_ok=True)
        data = build(cache)
    with tempfile.NamedTemporaryFile("w", dir=args.out.parent, delete=False) as out:
        json.dump(data, out, ensure_ascii=False, separators=(",", ":"))
    Path(out.name).chmod(0o644)
    Path(out.name).replace(args.out)
    for name in SOURCES:
        entry = data[name]
        print(f"{name}: {entry['vehicles']:,} vehicles, {entry['represented']:,} in {len(entry['variants']):,} named model years")
