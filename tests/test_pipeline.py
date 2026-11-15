import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from nyc_reference.pipeline import (create_manifest, fetch_osm, merge_reviews,
                                    render_brief, street_view_url, validate_manifest)


CONFIG = {"name": "Test district", "bbox": [40.72, -74.01, 40.73, -74.0], "spacing_m": 60, "max_stops": 10}
OSM = {"elements": [{"type": "way", "id": 123, "tags": {"highway": "residential", "name": "Test Street"},
                     "geometry": [{"lat": 40.721, "lon": -74.005}, {"lat": 40.723, "lon": -74.005}]}]}


class PipelineTests(unittest.TestCase):
    def test_google_links_use_real_coordinates_and_normalize_heading(self):
        url = street_view_url(40.721, -74.005, 450)
        params = parse_qs(urlparse(url).query)
        self.assertEqual(params["viewpoint"], ["40.7210000,-74.0050000"])
        self.assertEqual(params["heading"], ["90.00"])
        self.assertEqual(params["map_action"], ["pano"])
        self.assertEqual(params["api"], ["1"])

    def test_manifest_has_four_views_and_no_invented_observations(self):
        manifest = validate_manifest(create_manifest(CONFIG, OSM))
        for stop in manifest["stops"]:
            self.assertEqual(set(stop["views"]), {"forward", "right", "back", "left"})
            self.assertEqual(stop["review"]["status"], "pending")
            self.assertEqual(stop["review"]["notes"], "")
        self.assertIn("No checked observations", render_brief(manifest))

    def test_partial_overpass_response_rejected(self):
        with self.assertRaisesRegex(ValueError, "complete"):
            create_manifest(CONFIG, {**OSM, "remark": "runtime error: Query timed out"})

    def test_fetch_validates_area_before_network_access(self):
        with patch("nyc_reference.pipeline.fetch_map") as fetching:
            with self.assertRaisesRegex(ValueError, "neighborhood"):
                fetch_osm({**CONFIG, "bbox": [40, -74, 41, -73]})
            fetching.assert_not_called()

    def test_invalid_config_and_coordinates_fail(self):
        for bbox in ([40.73, -74.01, 40.72, -74.0], [40, -74, 41, -73], [float("nan"), -74, 41, -73]):
            with self.subTest(bbox=bbox), self.assertRaises(ValueError):
                create_manifest({**CONFIG, "bbox": bbox}, OSM)
        with self.assertRaises(ValueError):
            street_view_url(float("nan"), -74, 0)

    def test_import_rejects_duplicate_ids_and_unsafe_viewer_urls(self):
        manifest = create_manifest(CONFIG, OSM)
        manifest["stops"].append(copy.deepcopy(manifest["stops"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_manifest(manifest)
        for url in ("javascript:alert(1)", "https://www.google.com.evil.test/maps", "https://www.google.com@evil.test/maps"):
            with self.subTest(url=url):
                bad = create_manifest(CONFIG, OSM)
                bad["stops"][0]["views"]["forward"] = url
                with self.assertRaisesRegex(ValueError, "HTTPS Google"):
                    validate_manifest(bad)

    def test_refresh_keeps_notes_only_when_viewpoint_matches(self):
        old = create_manifest(CONFIG, OSM)
        old["stops"][0]["review"].update(status="checked", notes="Test observation")
        fresh = create_manifest(CONFIG, OSM)
        merged = merge_reviews(fresh, old)
        self.assertEqual(merged["stops"][0]["review"]["notes"], "Test observation")
        self.assertEqual(fresh["stops"][0]["review"]["notes"], "")
        fresh["stops"][0]["lat"] += 0.0001
        self.assertEqual(merge_reviews(fresh, old)["stops"][0]["review"]["status"], "pending")

    def test_google_share_link_allowed_as_observation_source(self):
        manifest = create_manifest(CONFIG, OSM)
        manifest["stops"][0]["review"]["source_url"] = "https://maps.app.goo.gl/example"
        self.assertIs(validate_manifest(manifest), manifest)

    def test_brief_includes_only_checked_notes(self):
        manifest = create_manifest(CONFIG, OSM)
        manifest["stops"][0]["review"].update(status="checked", notes="Observed detail\nSecond line", imagery_date="2025-01")
        manifest["stops"][1]["review"].update(status="unavailable", notes="Unavailable draft")
        brief = render_brief(manifest)
        self.assertIn("> Observed detail\n> Second line", brief)
        self.assertIn("2025-01", brief)
        self.assertNotIn("Unavailable draft", brief)

    def test_cli_round_trip_offline_and_protects_existing_output(self):
        from nyc_reference.__main__ import main
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config, osm, output = root / "config.json", root / "osm.json", root / "output"
            config.write_text(json.dumps(CONFIG))
            osm.write_text(json.dumps(OSM))
            args = ["plan", "--config", str(config), "--osm", str(osm), "--output", str(output)]
            self.assertEqual(main(args), 0)
            original = (output / "manifest.json").read_text()
            self.assertEqual(main(args), 1)
            self.assertEqual((output / "manifest.json").read_text(), original)
            self.assertEqual(main(["report", str(output / "manifest.json"), "--output", str(output / "manifest.json")]), 1)
            self.assertEqual((output / "manifest.json").read_text(), original)
            self.assertEqual(main(["brief", str(output / "manifest.json"), "--output", str(root / "brief.md")]), 0)
            self.assertIn("No checked observations", (root / "brief.md").read_text())


if __name__ == "__main__":
    unittest.main()
