import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

from nyc_reference.osm import MAX_RESPONSE_BYTES, fetch_map, parse_osm_xml
from nyc_reference.planner import plan_stops


ROAD = b'''<osm version="0.6">
  <meta osm_base="2026-10-09T12:00:00Z" />
  <way id="8">
    <nd ref="1"/><nd ref="2"/>
    <tag k="highway" v="residential"/><tag k="name" v="Mercer Street"/>
    <tag k="oneway" v="-1"/>
  </way>
  <node id="2" lat="40.726" lon="-73.999" />
  <node id="1" lat="40.725" lon="-73.999" />
</osm>'''


class OSMTests(unittest.TestCase):
    def test_resolves_nodes_after_ways_and_preserves_metadata(self):
        result = parse_osm_xml(ROAD, "https://example.test/map")
        self.assertEqual(result["osm3s"]["timestamp_osm_base"], "2026-10-09T12:00:00Z")
        self.assertEqual(result["provenance"], {"url": "https://example.test/map", "format": "OSM XML"})
        self.assertEqual(result["elements"], [{
            "type": "way", "id": 8,
            "tags": {"highway": "residential", "name": "Mercer Street", "oneway": "-1"},
            "geometry": [{"lat": 40.725, "lon": -73.999}, {"lat": 40.726, "lon": -73.999}],
        }])
        stops = plan_stops(result)
        self.assertEqual(len(stops), 2)
        self.assertEqual(stops[0]["street"], "Mercer Street")
        self.assertAlmostEqual(stops[0]["heading"], 180)

    def test_nonroads_and_unnamed_roads_do_not_require_geometry(self):
        source = b'''<osm>
          <way id="1"><nd ref="999"/><tag k="name" v="Building"/><tag k="building" v="yes"/></way>
          <way id="2"><nd ref="999"/><tag k="highway" v="service"/></way>
          <relation id="3"><tag k="name" v="Route"/></relation>
        </osm>'''
        result = parse_osm_xml(source)
        self.assertEqual(result["elements"], [])
        self.assertEqual(result["osm3s"]["timestamp_osm_base"], "unknown")

    def test_missing_referenced_nodes_are_an_explicit_error(self):
        with self.assertRaisesRegex(ValueError, "way 8 references missing node 999"):
            parse_osm_xml(ROAD.replace(b'<nd ref="2"/>', b'<nd ref="999"/>'))

    def test_invalid_xml_and_unexpected_root_are_rejected(self):
        for source in (b"<osm>", b"<html/>", b"not xml", b"", "<osm/>"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                parse_osm_xml(source)

    def test_invalid_coordinates_and_identifiers_are_rejected(self):
        for original, replacement in (
            (b'lat="40.725"', b'lat="NaN"'),
            (b'lat="40.725"', b'lat="91"'),
            (b'lon="-73.999"', b'lon="-181"'),
            (b'id="8"', b'id="bad"'),
            (b'id="1"', b'id="0"'),
            (b'<nd ref="2"/>', b'<nd/>'),
        ):
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                parse_osm_xml(ROAD.replace(original, replacement))

    def test_duplicate_nodes_and_short_road_geometry_are_rejected(self):
        duplicate = ROAD.replace(b"</osm>", b'<node id="1" lat="0" lon="0"/></osm>')
        with self.assertRaisesRegex(ValueError, "duplicate OSM node"):
            parse_osm_xml(duplicate)
        with self.assertRaisesRegex(ValueError, "at least two"):
            parse_osm_xml(ROAD.replace(b'<nd ref="2"/>', b""))

    @patch("nyc_reference.osm.urlopen")
    def test_fetch_uses_map_bbox_order_and_bounded_read(self, urlopen):
        response = MagicMock()
        response.read.return_value = ROAD
        urlopen.return_value.__enter__.return_value = response
        result = fetch_map({"bbox": [40.72, -74.0, 40.73, -73.99]})
        request = urlopen.call_args.args[0]
        self.assertEqual(urlopen.call_args.kwargs, {"timeout": 40})
        self.assertEqual(urlparse(request.full_url).netloc, "api.openstreetmap.org")
        self.assertEqual(parse_qs(urlparse(request.full_url).query)["bbox"], ["-74.0,40.72,-73.99,40.73"])
        self.assertEqual(request.get_header("User-agent"), "NYCReferencePlanner/0.1")
        response.read.assert_called_once_with(MAX_RESPONSE_BYTES + 1)
        self.assertEqual(result["provenance"]["url"], request.full_url)

    @patch("nyc_reference.osm.urlopen")
    def test_oversized_response_is_rejected(self, urlopen):
        response = MagicMock()
        response.read.return_value = b" " * (MAX_RESPONSE_BYTES + 1)
        urlopen.return_value.__enter__.return_value = response
        with self.assertRaisesRegex(ValueError, "exceeds 20 MB"):
            fetch_map({"bbox": [40.72, -74.0, 40.73, -73.99]})


if __name__ == "__main__":
    unittest.main()
