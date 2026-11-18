"""Build joint ZIP / make / model / year counts from NYS DMV and NHTSA vPIC.

Install ultravin==3.0.2 in a venv. Pass --cache DIR to keep the five county
extracts for offline rebuilds. Full VINs and serial numbers are excluded.
"""

import argparse
import csv
import gzip
import json
import re
import shutil
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import ultravin


ROOT = Path(__file__).resolve().parents[1]
DMV = "https://data.ny.gov"
DATASET = "w4pv-hbkt"
COUNTIES = ("NEW YORK", "KINGS", "QUEENS", "BRONX", "RICHMOND")
LIMIT = 1_000_000  # Exceeds the largest NYC county. Fail on a clipped extract.
MIN_COUNT = 50
DMV_BODY = {"4DSD": "sedan", "SEDN": "sedan", "SUBN": "suburban", "2DSD": "coupe",
            "CONV": "coupe", "PICK": "pickup", "VAN": "van"}
VPIC_BODY = {
    "Sedan/Saloon": "sedan", "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]": "suv",
    "Crossover Utility Vehicle [CUV]": "suv", "Hatchback/Liftback/Notchback": "hatch",
    "Wagon": "wagon", "Minivan": "minivan", "Coupe": "coupe", "Convertible/Cabriolet": "coupe",
    "Roadster": "coupe", "Pickup": "pickup", "Sport Utility Truck [SUT]": "pickup",
    "Van": "van", "Cargo Van": "van", "Passenger Van": "van",
}
FALLBACKS = ["sedan", "suv", "hatch", "wagon", "minivan", "coupe", "pickup", "van", "suburban"]
MAKE_CASE = {make.upper(): make for make in ("BMW", "GMC", "RAM", "MINI", "FIAT", "BYD",
             "Mercedes-Benz", "Rolls-Royce", "McLaren", "smart", "Isuzu", "Genesis")}
SELECT = ("case(length(vin)=17,substring(vin,1,8)) as descriptor,"
          "case(length(vin)=17,substring(vin,10,2)) as year_plant,model_year,zip,body_type")


def scope(day):
    types = ",".join(f"'{code}'" for code in DMV_BODY)
    return (f"record_type='VEH' AND registration_class='PAS' AND reg_valid_date <= '{day}' "
            f"AND reg_expiration_date >= '{day}' AND body_type in({types})")


def fetch(cache):
    stamp = cache / "snapshot.json"
    if stamp.exists():
        return json.loads(stamp.read_text())

    def revision():
        with urlopen(f"{DMV}/api/views/{DATASET}", timeout=45) as response:
            return json.load(response)["rowsUpdatedAt"]

    updated = revision()
    day = datetime.fromtimestamp(updated, timezone.utc).date().isoformat()
    for county in COUNTIES:
        query = urlencode({"$select": SELECT, "$where": f"{scope(day)} AND county='{county}'", "$limit": LIMIT})
        request = Request(f"{DMV}/resource/{DATASET}.csv?{query}", headers={"Accept-Encoding": "gzip"})
        path = cache / f"{county}.csv.gz"
        with urlopen(request, timeout=300) as response:
            opener = open if response.headers.get("Content-Encoding") == "gzip" else gzip.open
            with opener(path, "wb") as out:
                shutil.copyfileobj(response, out)
    if revision() != updated:
        raise RuntimeError("The DMV snapshot changed during the download. Run the build again.")
    snapshot = {"date": day, "rowsUpdatedAt": updated}
    stamp.write_text(json.dumps(snapshot))
    return snapshot


@lru_cache(maxsize=None)
def identify(prefix, year_plant, year):
    if year < 1981 or not re.fullmatch(r"[A-HJ-NPR-Z0-9]{10}", prefix + year_plant):
        return None
    result = ultravin.decode(f"{prefix}*{year_plant}", year=year)
    # Code 6 is expected for a partial VIN. Ignore corrections, conflicting
    # model years and ambiguous decodes. Their registrations still count.
    attrs = result["attributes"]
    make, model = attrs.get("Make"), attrs.get("Model")
    if not make or not model or result["model_year"] != year or set(result["error_codes"]) - {0, 6}:
        return None
    return MAKE_CASE.get(make, make.title()), model, VPIC_BODY.get(attrs.get("Body Class"))


def build(cache, snapshot):
    counts = defaultdict(Counter)
    city = Counter()
    for county in COUNTIES:
        with gzip.open(cache / f"{county}.csv.gz", "rt", newline="") as source:
            rows = csv.DictReader(source)
            size = 0
            for row in rows:
                size += 1
                year = int(row["model_year"] or 0)
                identity = identify(row["descriptor"], row["year_plant"], year)
                body = DMV_BODY[row["body_type"]]
                if identity and (identity[2] or body != "suburban"):
                    make, model, decoded_body = identity
                    key = (make, model, year, decoded_body or body)
                else:
                    key = ("", "", 0, body)
                counts[row["zip"]][key] += 1
                city[key] += 1
            if not 0 < size < LIMIT:
                raise ValueError(f"Incomplete extract for {county} ({size} rows)")

    variants = sorted((key for key, count in city.items() if key[0] and count >= MIN_COUNT),
                      key=lambda key: (-city[key], key))
    ids = {key: i for i, key in enumerate(variants)}

    def weights(area):
        combined = Counter()
        for key, count in area.items():
            index = ids.get(key)
            if index is None:
                index = -1 - FALLBACKS.index(key[3])
            combined[index] += count
        # Sparse (variant id, count) pairs. Negative IDs index unnamed bodies.
        return [value for pair in sorted(combined.items()) for value in pair]

    centers = json.loads((ROOT / "dist/fleet.json").read_text())["zips"]
    return {
        "version": 1, "snapshot": snapshot, "source": f"{DMV}/d/{DATASET}",
        "decoder": {"source": "https://vpic.nhtsa.dot.gov/", **ultravin.provenance()},
        "counties": COUNTIES, "filter": scope(snapshot["date"]), "minimumCityCount": MIN_COUNT,
        "registrations": city.total(), "represented": sum(city[key] for key in variants),
        "fallbacks": FALLBACKS, "variants": variants, "city": weights(city),
        "zips": {zip_code: weights(counts[zip_code]) for zip_code, *_ in centers if zip_code in counts},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--out", type=Path, default=ROOT / "dist/vehicle-catalog.json")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        cache = args.cache or Path(tmp)
        cache.mkdir(parents=True, exist_ok=True)
        catalog = build(cache, fetch(cache))
    # Replace only after all five counties have been verified and decoded.
    with tempfile.NamedTemporaryFile("w", dir=args.out.parent, delete=False) as out:
        json.dump(catalog, out, ensure_ascii=False, separators=(",", ":"))
    Path(out.name).chmod(0o644)
    Path(out.name).replace(args.out)
    print(f"{catalog['registrations']:,} registrations, {len(catalog['variants']):,} model-year/body entries")
