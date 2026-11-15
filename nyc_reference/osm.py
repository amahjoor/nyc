"""Read small areas from the official OSM map API as road geometries."""

import math
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree


MAP_API_URL = "https://api.openstreetmap.org/api/0.6/map"
MAX_RESPONSE_BYTES = 20_000_000


def _positive_id(value, label):
    try:
        identifier = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be a positive integer") from None
    if identifier <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return identifier


def _coordinate(value, label, maximum):
    try:
        coordinate = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be a valid coordinate") from None
    if not math.isfinite(coordinate) or not -maximum <= coordinate <= maximum:
        raise ValueError(f"{label} must be a valid coordinate")
    return coordinate


def parse_osm_xml(raw: bytes, source_url: str = "") -> dict:
    """Convert named highway ways into the Overpass ``out geom`` shape.

    Map API responses may place nodes after ways. Resolve references only after
    indexing every node, and reject incomplete road geometry instead of drawing
    a false straight connection across missing nodes.
    """
    if not isinstance(raw, bytes):
        raise ValueError("OSM XML input must be bytes")
    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError as error:
        raise ValueError(f"invalid OSM XML: {error}") from None
    if root.tag != "osm":
        raise ValueError("OSM XML needs an osm root element")

    nodes = {}
    for node in root.findall("node"):
        node_id = _positive_id(node.get("id"), "OSM node id")
        if node_id in nodes:
            raise ValueError(f"duplicate OSM node {node_id}")
        nodes[node_id] = {
            "lat": _coordinate(node.get("lat"), f"OSM node {node_id} latitude", 90),
            "lon": _coordinate(node.get("lon"), f"OSM node {node_id} longitude", 180),
        }

    elements = []
    way_ids = set()
    for way in root.findall("way"):
        tags = {tag.get("k"): tag.get("v") for tag in way.findall("tag")}
        if not tags.get("highway") or not tags.get("name"):
            continue
        way_id = _positive_id(way.get("id"), "OSM way id")
        if way_id in way_ids:
            raise ValueError(f"duplicate OSM way {way_id}")
        way_ids.add(way_id)
        if any(key is None or value is None for key, value in tags.items()):
            raise ValueError(f"OSM way {way_id} contains an incomplete tag")
        references = [_positive_id(node.get("ref"), f"OSM way {way_id} node reference") for node in way.findall("nd")]
        if len(references) < 2:
            raise ValueError(f"OSM way {way_id} needs at least two node references")
        missing = next((ref for ref in references if ref not in nodes), None)
        if missing is not None:
            raise ValueError(f"OSM way {way_id} references missing node {missing}")
        elements.append({
            "type": "way", "id": way_id, "tags": tags,
            "geometry": [dict(nodes[ref]) for ref in references],
        })

    metadata = root.find("meta")
    timestamp = metadata.get("osm_base", "unknown") if metadata is not None else "unknown"
    return {
        "elements": sorted(elements, key=lambda element: element["id"]),
        "osm3s": {"timestamp_osm_base": timestamp or "unknown"},
        "provenance": {"url": source_url, "format": "OSM XML"},
    }


def fetch_map(config: dict) -> dict:
    """Fetch a validated neighborhood config through the OSM map API."""
    # The map API uses a different bbox order from Overpass and our config.
    south, west, north, east = config["bbox"]
    url = MAP_API_URL + "?" + urlencode({"bbox": f"{west},{south},{east},{north}"})
    request = Request(url, headers={
        "User-Agent": "NYCReferencePlanner/0.1",
        "Accept": "application/xml",
    })
    with urlopen(request, timeout=40) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("OSM response exceeds 20 MB; use a smaller area")
    return parse_osm_xml(raw, source_url=url)
