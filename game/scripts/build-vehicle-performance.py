"""Build the engine power, weight and drivetrain of each registered model year.

For every make / model / year / body in the vehicle catalog, and for the cabs
and working vehicles beside it, NHTSA vPIC names the engine's power, the curb
weight, the driven wheels and the fuel of each partial VIN. This averages them
over the registrations they belong to, so a model year gets the power of the
versions New Yorkers actually register, not of its brochure's best.

Run build-vehicle-catalog.py and build-working-vehicles.py first with the same
--cache directories: this reads their extracts and requests nothing new.
"""

import argparse
import csv
import gzip
import importlib.util
import json
import tempfile
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

import ultravin

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / f"scripts/{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


catalog = load("build-vehicle-catalog")
working = load("build-working-vehicles")
DRIVE = {"FWD": "F", "RWD": "R", "AWD": "A", "4WD": "A", "4x4": "A"}


@lru_cache(maxsize=None)
def specs(prefix, year_plant, year, body):
    """(hp, kg, drive, fuel) for a partial VIN, each None where vPIC does not say."""
    try:
        attrs = ultravin.decode(f"{prefix}*{year_plant}", year=year)["attributes"]
    except Exception:
        return None, None, None, None

    def number(key):
        try:
            value = float(str(attrs.get(key) or "").replace(",", ""))
        except ValueError:
            return None
        return value if value > 0 else None

    hp, pounds = number("Engine Brake (hp) From"), number("Curb Weight (pounds)")
    # A figure outside what a road car has is a typing slip in the maker's filing.
    hp = hp if hp and 40 <= hp <= 1300 else None
    kg = round(pounds * .45359237) if pounds and 1400 <= pounds <= 10000 else None
    text = attrs.get("Drive Type") or ""
    drive = next((code for word, code in DRIVE.items() if word in text), None)
    if not drive and "4x2" in text:
        # Two driven wheels, unsaid which: the rear on a truck or a van, the front on anything else sold as 4x2.
        drive = "R" if body in ("pickup", "van") else "F"
    level, primary = attrs.get("Electrification Level") or "", attrs.get("Fuel Type - Primary") or ""
    fuel = ("E" if "BEV" in level or primary == "Electric" else "P" if "PHEV" in level else "H" if "HEV" in level
            else "D" if primary == "Diesel" else "G" if primary else None)
    return hp, kg, drive, fuel


class Tally:
    """Registration-weighted figures for one model year."""

    def __init__(self):
        self.n = 0
        self.sums = {"hp": [0, 0], "kg": [0, 0]}
        self.votes = {"drive": Counter(), "fuel": Counter()}

    def add(self, count, hp, kg, drive, fuel):
        self.n += count
        for key, value in (("hp", hp), ("kg", kg)):
            if value:
                self.sums[key][0] += value * count
                self.sums[key][1] += count
        for key, value in (("drive", drive), ("fuel", fuel)):
            if value:
                self.votes[key][value] += count

    def row(self):
        """[hp, kg, drive, fuel], or None where fewer than a fifth of them say."""
        mean = lambda key: round(self.sums[key][0] / self.sums[key][1]) if self.sums[key][1] >= self.n * .2 else None
        vote = lambda key: self.votes[key].most_common(1)[0][0] if self.votes[key].total() >= self.n * .2 else None
        return [mean("hp"), mean("kg"), vote("drive"), vote("fuel")]


def passenger(cache):
    tallies = defaultdict(Tally)
    for county in catalog.COUNTIES:
        with gzip.open(cache / f"{county}.csv.gz", "rt", newline="") as source:
            for row in csv.DictReader(source):
                year = int(row["model_year"] or 0)
                identity = catalog.identify(row["descriptor"], row["year_plant"], year)
                body = catalog.DMV_BODY[row["body_type"]]
                if not identity or not (identity[2] or body != "suburban"):
                    continue
                make, model, decoded = identity
                key = (make, model, year, decoded or body)
                tallies[key].add(1, *specs(row["descriptor"], row["year_plant"], year, key[3]))
    return tallies


def fleet(cache, name):
    tallies = defaultdict(Tally)
    for row in json.loads((cache / f"{name}.json").read_text())["rows"]:
        year = int(float(row.get("model_year") or 0))
        identity = catalog.identify(row.get("descriptor") or "", row.get("year_plant") or "", year)
        if not identity:
            continue
        make, model, body = identity
        if name == "work":
            if body not in ("van", "pickup", "minivan"):
                continue
            body = working.WORK_BODY[row["body_type"]] if body != "minivan" else "van"
        tallies[(make, model, year, body)].add(int(row["n"]), *specs(row["descriptor"], row["year_plant"], year, body))
    return tallies


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True, help="the build-vehicle-catalog.py cache")
    parser.add_argument("--working-cache", type=Path, required=True, help="the build-working-vehicles.py cache")
    parser.add_argument("--out", type=Path, default=ROOT / "dist/vehicle-performance.json")
    args = parser.parse_args()
    listed = json.loads((ROOT / "dist/vehicle-catalog.json").read_text())
    snapshot = json.loads((args.cache / "snapshot.json").read_text())
    if snapshot != listed["snapshot"]:
        raise SystemExit("The cache is not the snapshot dist/vehicle-catalog.json was built from. Rebuild the catalog first.")
    cars = passenger(args.cache)
    at_work = json.loads((ROOT / "dist/working-vehicles.json").read_text())
    out = {
        "version": 1, "snapshot": snapshot, "source": "https://vpic.nhtsa.dot.gov/", "decoder": ultravin.provenance(),
        "fields": ["hp", "kg", "drive", "fuel"],
        # One row for each catalog variant, in its order.
        "variants": [cars[tuple(key)].row() if tuple(key) in cars else [None] * 4 for key in listed["variants"]],
    }
    for name in working.SOURCES:
        tallies = fleet(args.working_cache, name)
        out[name] = [tallies[tuple(row[:4])].row() if tuple(row[:4]) in tallies else [None] * 4 for row in at_work[name]["variants"]]
    with tempfile.NamedTemporaryFile("w", dir=args.out.parent, delete=False) as file:
        json.dump(out, file, ensure_ascii=False, separators=(",", ":"))
    Path(file.name).chmod(0o644)
    Path(file.name).replace(args.out)
    rows = out["variants"]
    print(f"{len(rows):,} model years: power for {sum(1 for r in rows if r[0]):,}, weight for {sum(1 for r in rows if r[1]):,}")
