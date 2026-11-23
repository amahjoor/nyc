"""Import credited travel-guide excerpts for NYC businesses matched by name and location."""
import html
import json
import math
import re
import unicodedata
import time
import requests
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "dist"
API = "https://en.wikivoyage.org/w/api.php"
ALIASES = {"katzsdeli": "katzsdelicatessen", "lombardispizza": "lombardis"}


def query(**params):
    for attempt in range(4):
        response = requests.get(API, params=dict(action="query", format="json", formatversion=2, **params),
                                headers={"User-Agent":"NYCGamePlaceGuide/1.0 (NYC travel guide research)"}, timeout=30)
        if response.status_code == 429 and attempt < 3:
            time.sleep(max(2**attempt, int(response.headers.get("Retry-After", "1"))))
            continue
        response.raise_for_status()
        return response.json()["query"]


def normalized(text):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", text.lower().replace("&", "and")))


def excerpt(raw):
    text = html.unescape(re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", raw).replace("''", ""))
    text = " ".join(re.sub(r"<[^>]+>", "", text).split())
    if len(text) < 18 or any(char in text for char in "{}[]|"):
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    first = sentences[0]
    if len(first) < 65 and len(sentences) > 1:
        first += " " + sentences[1]
    words = first.split()
    return " ".join(words[:25]).rstrip(",;:") + "…" if len(words) > 25 else first


def main():
    places = {}
    for tile in (ROOT / "places").glob("*.json"):
        for x, z, _, name, *_ in json.loads(tile.read_text())["places"]:
            if name:
                places.setdefault(normalized(name), []).append((name, x, z))
    pages = {"Bronx", "Staten Island", "Brooklyn", "Queens", "Manhattan"}
    for borough in ["Manhattan", "Brooklyn", "Queens"]:
        pages.update(row["title"] for row in query(list="allpages", apprefix=borough+"/", aplimit=100)["allpages"])
    titles = sorted(pages)
    result = {}
    for start in range(0, len(titles), 8):
        batch = query(titles="|".join(titles[start:start+8]), prop="revisions", rvprop="ids|content", rvslots="main")
        for page in batch["pages"]:
            revision = page["revisions"][0]
            markup = revision["slots"]["main"]["content"]
            for template in re.findall(r"\{\{(?:eat|drink|buy|sleep|see|do|listing)\s*\|(.*?)\}\}", markup, re.S | re.I):
                fields = {k.lower(): v.strip() for k, v in re.findall(r"(?:^|\|)\s*(\w+)\s*=\s*(.*?)(?=\|\s*\w+\s*=|$)", template, re.S)}
                label = normalized(fields.get("name", ""))
                try:
                    lat, lon = float(fields["lat"]), float(fields["long"])
                except (ValueError, KeyError):
                    continue
                x = 6371008.8 * math.radians(lon+74.0015) * math.cos(math.radians(40.7235))
                z = -6371008.8 * math.radians(lat-40.7235)
                matches = [p for p in places.get(ALIASES.get(label,label),[]) if math.hypot(p[1]-x,p[2]-z)<45]
                quote = excerpt(fields.get("content", ""))
                if len(matches) == 1 and quote:
                    name, px, pz = matches[0]
                    result[matches[0]] = dict(name=name,x=px,z=pz,quote=quote,article=page["title"],revision=revision["revid"])
    path = ROOT / "assets/phone/places/editorial.json"
    path.write_text(json.dumps(list(result.values()), ensure_ascii=False, separators=(",", ":"))+"\n")
    print(f"Matched {len(result)} guide entries")


if __name__ == "__main__":
    main()
