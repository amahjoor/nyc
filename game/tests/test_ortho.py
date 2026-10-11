"""Prevent imagery reflection, geographic drift, and invalid downloaded assets."""

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ortho", ROOT / "scripts/import-ortho.py")
ortho = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ortho)


class OrthoTests(unittest.TestCase):
    def test_known_web_mercator_corners_and_axis_directions(self):
        self.assertEqual(ortho.tile_corner(1, 1, 1), (0, 0))
        self.assertEqual(ortho.tile_fraction(0, 0, 1), (1, 1))
        x, z = ortho.project(-74.0015, 40.7235)
        self.assertEqual((x, z), (0, 0))
        self.assertGreater(ortho.project(-74.0005, 40.7235)[0], 0)
        self.assertGreater(ortho.project(-74.0015, 40.7225)[1], 0)

    def test_origin_is_inside_its_tile_and_neighbors_share_edges(self):
        column, row = (int(value) for value in ortho.tile_fraction(-74.0015, 40.7235, 18))
        bounds = ortho.tile_bounds(column, row, 18)
        self.assertLess(bounds["minX"], 0)
        self.assertGreater(bounds["maxX"], 0)
        self.assertLess(bounds["minZ"], 0)
        self.assertGreater(bounds["maxZ"], 0)
        self.assertEqual(bounds["maxX"], ortho.tile_bounds(column + 1, row, 18)["minX"])
        self.assertEqual(bounds["maxZ"], ortho.tile_bounds(column, row + 1, 18)["minZ"])

    def test_full_playable_area_and_350_meter_context_are_covered(self):
        tiles = ortho.coverage()
        self.assertLess(len(tiles), 150)
        southwest = ortho.project(-74.005, 40.721)
        northeast = ortho.project(-73.998, 40.726)
        self.assertLessEqual(min(t["bounds"]["minX"] for t in tiles), southwest[0] - 350)
        self.assertGreaterEqual(max(t["bounds"]["maxX"] for t in tiles), northeast[0] + 350)
        self.assertLessEqual(min(t["bounds"]["minZ"] for t in tiles), northeast[1] - 350)
        self.assertGreaterEqual(max(t["bounds"]["maxZ"] for t in tiles), southwest[1] + 350)

    def test_every_context_building_vertex_has_overhead_imagery(self):
        # Importing an entire building that intersects a context edge can extend
        # beyond that edge. Check actual survey vertices rather than only bbox.
        manifest = json.loads((ROOT / "dist/ortho.json").read_text())
        survey = json.loads((ROOT / "dist/survey.json").read_text())
        bounds = manifest["bounds"]
        for building in survey["buildings"]:
            vertices = building["vertices"]
            for x, z in zip(vertices[0::3], vertices[2::3]):
                self.assertLessEqual(bounds["minX"], x, building["id"])
                self.assertGreaterEqual(bounds["maxX"], x, building["id"])
                self.assertLessEqual(bounds["minZ"], z, building["id"])
                self.assertGreaterEqual(bounds["maxZ"], z, building["id"])

    def test_http_errors_and_truncated_images_are_rejected(self):
        for data in (b'{"error":{"code":499}}', b"<html>Forbidden</html>", b"\xff\xd8\xfftruncated"):
            with self.assertRaises(ValueError):
                ortho.image_extension(data)

    def test_bundled_tiles_are_complete_and_match_manifest_checksums(self):
        manifest = json.loads((ROOT / "dist/ortho.json").read_text())
        self.assertEqual(len(manifest["tiles"]), len(ortho.coverage()))
        for tile in manifest["tiles"]:
            path = ROOT / "dist" / tile["url"]
            data = path.read_bytes()
            self.assertEqual(ortho.image_extension(data), path.suffix)
            self.assertEqual(len(data), tile["bytes"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), tile["sha256"])
            self.assertEqual(tile["bounds"], ortho.tile_bounds(tile["column"], tile["row"], tile["zoom"]))


if __name__ == "__main__":
    unittest.main()
