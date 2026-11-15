"""Turn Overpass road geometries into deterministic street-reference stops."""

import math
from typing import Dict, List, Optional, Sequence, Tuple


EARTH_RADIUS_M = 6_371_008.8
DRIVABLE_HIGHWAYS = frozenset(
    {
        "motorway", "trunk", "primary", "secondary", "tertiary",
        "unclassified", "residential", "living_street", "service",
        "motorway_link", "trunk_link", "primary_link", "secondary_link",
        "tertiary_link", "unclassified_link", "residential_link",
        "living_street_link", "service_link",
    }
)
_COORDINATE_SCALE = 1_000_000
Point = Tuple[float, float]


def _number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("{} must be a finite number".format(label))
    try:
        result = float(value)
    except OverflowError:
        raise ValueError("{} must be a finite number".format(label)) from None
    if not math.isfinite(result):
        raise ValueError("{} must be a finite number".format(label))
    return result


def _point(value: object, label: str) -> Point:
    if not isinstance(value, dict):
        raise ValueError("{} must contain lat and lon".format(label))
    lat = _number(value.get("lat"), label + " latitude")
    lon = _number(value.get("lon"), label + " longitude")
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("{} coordinates are out of range".format(label))
    return lat, lon


def _bounds(bbox: Optional[Sequence[float]]) -> Optional[Tuple[float, ...]]:
    if bbox is None:
        return None
    if isinstance(bbox, (str, bytes)):
        raise ValueError("bbox must be [south, west, north, east]")
    try:
        values = tuple(bbox)
    except TypeError:
        raise ValueError("bbox must be [south, west, north, east]") from None
    if len(values) != 4:
        raise ValueError("bbox must be [south, west, north, east]")
    south, west, north, east = tuple(_number(v, "bbox bound") for v in values)
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("bbox needs ordered, valid latitude/longitude bounds")
    return south, west, north, east


def _distance_and_bearing(start: Point, end: Point) -> Tuple[float, float]:
    lat1, lat2 = math.radians(start[0]), math.radians(end[0])
    dlat = lat2 - lat1
    dlon = math.radians(end[1] - start[1])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    distance = 2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, max(0.0, a))))
    bearing = math.degrees(math.atan2(
        math.sin(dlon) * math.cos(lat2),
        math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon),
    )) % 360
    return distance, bearing


def _intersection(start: Point, end: Point, bounds: Optional[Tuple[float, ...]]) -> Optional[Tuple[float, float]]:
    """Clip the line parametrically, so distant off-map samples cost no work."""
    if bounds is None:
        return 0.0, 1.0
    south, west, north, east = bounds
    lower, upper = 0.0, 1.0
    for origin, destination, minimum, maximum in (
        (start[0], end[0], south, north),
        (start[1], end[1], west, east),
    ):
        delta = destination - origin
        if delta == 0:
            if not minimum <= origin <= maximum:
                return None
            continue
        entry, leave = sorted(((minimum - origin) / delta, (maximum - origin) / delta))
        lower, upper = max(lower, entry), min(upper, leave)
        if lower > upper:
            return None
    return lower, upper


def _step_index(distance: float, spacing: float, ceil: bool = False) -> int:
    # Integer ratios avoid overflow for valid but extremely small spacings.
    numerator, denominator = distance.as_integer_ratio()
    spacing_numerator, spacing_denominator = spacing.as_integer_ratio()
    dividend, divisor = numerator * spacing_denominator, denominator * spacing_numerator
    return -(-dividend // divisor) if ceil else dividend // divisor


def _sample_distance(index: int, spacing: float) -> float:
    numerator, denominator = spacing.as_integer_ratio()
    return (index * numerator) / denominator


def _next_coordinate_index(start: Point, end: Point, key: Tuple[int, int], cumulative: float, length: float, spacing: float, index: int) -> int:
    """Skip the rest of a deduplication cell instead of iterating tiny steps."""
    crossings = []
    for origin, destination, rounded in zip(start, end, key):
        delta = destination - origin
        if delta:
            edge = (rounded + (0.5 if delta > 0 else -0.5)) / _COORDINATE_SCALE
            edge = math.nextafter(edge, math.inf if delta > 0 else -math.inf)
            crossings.append((edge - origin) / delta)
    if not crossings:
        return index + 1
    exit_distance = math.nextafter(cumulative + length * min(crossings), math.inf)
    # Crossing the half-open rounded cell needs the first sample after its edge.
    return max(index + 1, _step_index(max(0.0, exit_distance), spacing) + 1)


def plan_stops(osm: dict, spacing_m: float = 60, max_stops: int = 80, bbox: Optional[Sequence[float]] = None) -> List[Dict[str, object]]:
    """Sample public drivable ways at continuous distance intervals.

    ``osm`` is an Overpass ``out geom`` response. ``bbox`` is ordered as
    south, west, north, east; antimeridian-crossing boxes are unsupported.
    Distances use a spherical Earth; coordinates interpolate along the short
    road segments supplied by OSM. Duplicate positions share a roughly 0.1 m
    coordinate cell. IDs preserve the original, unclipped way sample index.
    """
    spacing = _number(spacing_m, "spacing_m")
    if spacing <= 0:
        raise ValueError("spacing_m must be positive")
    if isinstance(max_stops, bool) or not isinstance(max_stops, int) or max_stops <= 0:
        raise ValueError("max_stops must be a positive integer")
    bounds = _bounds(bbox)
    if not isinstance(osm, dict) or not isinstance(osm.get("elements"), list):
        raise ValueError("OSM data must contain an elements list")

    ways = []
    for element in osm["elements"]:
        if not isinstance(element, dict):
            raise ValueError("OSM elements must be objects")
        if element.get("type") != "way":
            continue
        tags = element.get("tags", {})
        if not isinstance(tags, dict):
            raise ValueError("OSM way tags must be an object")
        highway = tags.get("highway")
        if not isinstance(highway, str) or highway not in DRIVABLE_HIGHWAYS:
            continue
        if tags.get("access") in ("no", "private") or tags.get("motor_vehicle") in ("no", "private") or tags.get("vehicle") in ("no", "private"):
            continue
        way_id = element.get("id")
        if isinstance(way_id, bool) or not isinstance(way_id, int) or way_id <= 0:
            raise ValueError("OSM way id must be a positive integer")
        geometry = element.get("geometry")
        if not isinstance(geometry, list) or len(geometry) < 2:
            raise ValueError("OSM way {} needs at least two geometry points".format(way_id))
        points = [_point(value, "OSM way {} point {}".format(way_id, i)) for i, value in enumerate(geometry)]
        street = tags.get("name") or highway
        if not isinstance(street, str):
            raise ValueError("OSM way {} name must be text".format(way_id))
        ways.append((way_id, points, street, str(tags.get("oneway")) == "-1"))

    stops = []  # type: List[Dict[str, object]]
    seen = set()
    for way_id, points, street, reverse in sorted(ways, key=lambda way: way[0]):
        cumulative = 0.0
        for start, end in zip(points, points[1:]):
            length, bearing = _distance_and_bearing(start, end)
            if length == 0:
                continue
            interval = _intersection(start, end, bounds)
            if interval is not None:
                first, last = interval
                index = _step_index(cumulative + length * first, spacing, ceil=True)
                final_index = _step_index(cumulative + length * last, spacing)
                while index <= final_index:
                    fraction = min(last, max(first, (_sample_distance(index, spacing) - cumulative) / length))
                    lat = start[0] + (end[0] - start[0]) * fraction
                    lon = start[1] + (end[1] - start[1]) * fraction
                    # Clipping arithmetic can differ by one floating-point ULP.
                    if bounds is not None:
                        lat = min(bounds[2], max(bounds[0], lat))
                        lon = min(bounds[3], max(bounds[1], lon))
                    key = (round(lat * _COORDINATE_SCALE), round(lon * _COORDINATE_SCALE))
                    if key not in seen:
                        seen.add(key)
                        stops.append({
                            "id": "osm-way-{}-{}".format(way_id, index),
                            "lat": lat,
                            "lon": lon,
                            "heading": (bearing + (180 if reverse else 0)) % 360,
                            "street": street,
                            "osm_way_id": way_id,
                        })
                        if len(stops) >= max_stops:
                            return stops
                    index = _next_coordinate_index(start, end, key, cumulative, length, spacing, index)
            cumulative += length
    return stops
