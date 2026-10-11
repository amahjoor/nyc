"""Geospatial and geometry regressions for the measured NYC surface importer."""

import importlib.util
import json
import math
from pathlib import Path
import unittest


IMPORTER = Path(__file__).resolve().parents[1] / "scripts/import-survey.py"
spec = importlib.util.spec_from_file_location("survey", IMPORTER)
survey = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(survey)
except ModuleNotFoundError:
    survey = None


def triangle_area(vertices, indices):
    total = 0
    for offset in range(0, len(indices), 3):
        a, b, c = (survey.np.asarray(vertices[index]) for index in indices[offset:offset + 3])
        total += float(survey.np.linalg.norm(survey.np.cross(b - a, c - a))) / 2
    return total


@unittest.skipIf(survey is None, "Install scripts/requirements-survey.txt to test source conversion")
class SurveyTests(unittest.TestCase):
    def test_origin_and_foot_units_match_game(self):
        easting, northing = survey.TO_SOURCE.transform(-74.0015, 40.7235)
        point = survey.source_to_local([[easting, northing, 100]])[0]
        self.assertAlmostEqual(point[0], 0, places=6)
        self.assertAlmostEqual(point[2], 0, places=6)
        self.assertAlmostEqual(point[1], 30.48006096012192, places=9)

    def test_projection_matches_osm_coordinates(self):
        lon, lat = -74.0024, 40.7247
        easting, northing = survey.TO_SOURCE.transform(lon, lat)
        local = survey.source_to_local([[easting, northing, 32]])[0]
        expected_x, expected_z = survey.project(lon, lat)
        self.assertAlmostEqual(local[0], expected_x, places=6)
        self.assertAlmostEqual(local[2], expected_z, places=6)
        self.assertLess(local[0], 0)
        self.assertLess(local[2], 0)

    def test_vertical_wall_retains_its_area(self):
        rings = [[[2, 0, 5], [2, 9, 5], [2, 9, 17], [2, 0, 17]]]
        vertices, indices = survey.triangulate_rings(rings)
        self.assertEqual(len(indices), 6)
        self.assertAlmostEqual(triangle_area(vertices, indices), 108)

    def test_courtyard_roof_hole_is_not_filled(self):
        rings = [
            [[0, 8, 0], [10, 8, 0], [10, 8, 10], [0, 8, 10]],
            [[2, 8, 2], [2, 8, 8], [8, 8, 8], [8, 8, 2]],
        ]
        vertices, indices = survey.triangulate_rings(rings)
        self.assertAlmostEqual(triangle_area(vertices, indices), 64)
        for offset in range(0, len(indices), 3):
            points = [vertices[index] for index in indices[offset:offset + 3]]
            x = sum(point[0] for point in points) / 3
            z = sum(point[2] for point in points) / 3
            self.assertFalse(2 < x < 8 and 2 < z < 8)

    def test_concave_roof_and_sloped_elevation_survive(self):
        ring = [[0, 0, 0], [6, 6, 0], [6, 6, 2], [2, 2, 2], [2, 2, 6], [0, 0, 6]]
        vertices, indices = survey.triangulate_rings([ring])
        self.assertAlmostEqual(triangle_area(vertices, indices), 20 * math.sqrt(2))
        self.assertEqual(vertices, ring)

    def test_source_winding_survives_triangulation(self):
        for ring in [
            [[0, 3, 0], [9, 3, 0], [9, 3, 4], [0, 3, 4]],
            [[0, 3, 4], [9, 3, 4], [9, 3, 0], [0, 3, 0]],
        ]:
            vertices, indices = survey.triangulate_rings([ring])
            expected = survey.np.cross(survey.np.subtract(ring[1], ring[0]), survey.np.subtract(ring[2], ring[0]))
            for offset in range(0, len(indices), 3):
                a, b, c = (survey.np.asarray(vertices[index]) for index in indices[offset:offset + 3])
                self.assertGreater(float(survey.np.dot(survey.np.cross(b - a, c - a), expected)), 0)

    def test_degenerate_surface_does_not_create_invalid_triangles(self):
        vertices, indices = survey.triangulate_rings([[[0, 0, 0], [1, 1, 1], [2, 2, 2]]])
        self.assertEqual((vertices, indices), ([], []))


class SurveyArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((IMPORTER.parents[1] / "dist/survey.json").read_text())

    def test_surfaces_have_valid_finite_geometry(self):
        for building in self.data["buildings"]:
            with self.subTest(bin=building["bin"]):
                vertices = building["vertices"]
                self.assertEqual(len(vertices) % 3, 0)
                self.assertTrue(all(math.isfinite(value) for value in vertices))
                self.assertGreater(len(building["surfaces"]["wall"]), 0)
                self.assertGreater(len(building["surfaces"]["roof"]), 0)
                self.assertGreater(len(building["footprints"]), 0)
                for indices in building["surfaces"].values():
                    self.assertEqual(len(indices) % 3, 0)
                    self.assertTrue(all(isinstance(index, int) and 0 <= index < len(vertices) // 3 for index in indices))
                self.assertAlmostEqual(min(vertices[1::3]), building["baseElevation"], places=3)
                self.assertAlmostEqual(max(vertices[1::3]), building["maxElevation"], places=3)

    def test_playable_subset_is_in_soho_and_preserves_survey_elevation(self):
        playable = [building for building in self.data["buildings"] if building["inPlayableArea"]]
        self.assertEqual(self.data["bbox"], [40.721, -74.005, 40.726, -73.998])
        self.assertGreater(len(playable), 500)
        self.assertLess(len(playable), 700)
        bounds = self.data["bounds"]
        for building in playable:
            xs, zs = building["vertices"][::3], building["vertices"][2::3]
            # CRS conversion rotates the bounding rectangle very slightly.
            self.assertGreaterEqual(max(xs), bounds["minX"] - 1)
            self.assertLessEqual(min(xs), bounds["maxX"] + 1)
            self.assertGreaterEqual(max(zs), bounds["minZ"] - 1)
            self.assertLessEqual(min(zs), bounds["maxZ"] + 1)
        self.assertGreater(max(b["baseElevation"] for b in playable) - min(b["baseElevation"] for b in playable), 9)
        self.assertEqual(self.data["source"]["surveyYear"], 2014)

    def test_stats_and_source_ids_are_consistent(self):
        buildings = self.data["buildings"]
        self.assertEqual(self.data["stats"]["buildings"], len(buildings))
        self.assertEqual(self.data["stats"]["playableBuildings"], sum(b["inPlayableArea"] for b in buildings))
        self.assertEqual(self.data["stats"]["triangles"], sum(len(indices) // 3 for b in buildings for indices in b["surfaces"].values()))
        self.assertEqual(len({b["id"] for b in buildings}), len(buildings))
        self.assertTrue(all(b["bin"] and b["doittId"] and b["sourceId"] for b in buildings))


if __name__ == "__main__":
    unittest.main()
