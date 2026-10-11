"""Regression tests for the real-world geometry supplied to the game."""

import importlib.util
from collections import defaultdict
import json
import math
from pathlib import Path
import unittest


BASE = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_city", BASE / "scripts" / "build-city.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProjectionTests(unittest.TestCase):
    def test_origin_and_axes(self):
        self.assertEqual(MODULE.project(40.7235, -74.0015), [0, 0])
        east = MODULE.project(40.7235, -74.0005)
        south = MODULE.project(40.7225, -74.0015)
        self.assertAlmostEqual(east[0], 84.27, delta=0.1)
        self.assertAlmostEqual(south[1], 111.195, delta=0.01)

    def test_clip_crossing_segment_even_when_endpoints_outside(self):
        bounds = {"minX": 0, "maxX": 10, "minZ": 0, "maxZ": 10}
        self.assertEqual(MODULE.clip_segment([-5, 5], [15, 5], bounds), [[0, 5], [10, 5]])
        self.assertIsNone(MODULE.clip_segment([-5, -1], [15, -1], bounds))

    def test_disconnected_clipped_paths_do_not_cross_empty_space(self):
        bounds = {"minX": 0, "maxX": 10, "minZ": 0, "maxZ": 10}
        paths = MODULE.clip_polyline([[5, 5], [20, 5], [20, 8], [5, 8]], bounds)
        self.assertEqual(paths, [[[5, 5], [10, 5]], [[10, 8], [5, 8]]])

    def test_relation_members_join_in_reverse_orientation(self):
        self.assertEqual(MODULE.join_rings([[1, 2, 3], [1, 4, 3]]), [[1, 2, 3, 4, 1]])


class HeightTests(unittest.TestCase):
    def test_height_units(self):
        self.assertEqual(MODULE.length_value("10 m"), 10)
        self.assertAlmostEqual(MODULE.length_value("100 ft"), 30.48)
        self.assertIsNone(MODULE.length_value("unknown"))

    def test_measured_height_and_floor_estimate_are_distinct(self):
        measured = MODULE.building_dimensions({"height": "22.5", "building:levels": "6"}, "a")
        self.assertEqual(measured["height"], 22.5)
        self.assertFalse(measured["heightEstimated"])
        self.assertEqual(measured["floors"], 6)
        levels = MODULE.building_dimensions({"building:levels": "6"}, "a")
        self.assertTrue(levels["heightEstimated"])
        self.assertEqual(levels["heightSource"], "osm:building:levels")

    def test_unknown_height_is_reproducible_and_explicit(self):
        first = MODULE.building_dimensions({}, "osm:456")
        self.assertEqual(first, MODULE.building_dimensions({}, "osm:456"))
        self.assertTrue(first["heightEstimated"])
        self.assertEqual(first["heightSource"], "estimated")
        self.assertGreaterEqual(first["height"], 15)
        self.assertLessEqual(first["height"], 30)


class CityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.city = MODULE.build_city(BASE / "data" / "soho.osm")

    def test_generated_artifact_matches_source(self):
        self.assertEqual(self.city, json.loads((BASE / "dist" / "city.json").read_text()))

    def test_real_streets_and_buildings_have_neighborhood_scale(self):
        city = self.city
        self.assertGreater(len(city["roads"]), 30)
        self.assertGreater(len(city["buildings"]), 200)
        self.assertGreater(city["bounds"]["maxX"] - city["bounds"]["minX"], 580)
        self.assertLess(city["bounds"]["maxX"] - city["bounds"]["minX"], 600)
        self.assertIn("Greene Street", {road["name"] for road in city["roads"]})
        self.assertIn("Prince Street", {road["name"] for road in city["roads"]})
        self.assertTrue(any(road["surface"] == "sett" for road in city["roads"]))

    def test_roads_are_drivable_and_clipped(self):
        identifiers = set()
        for road in self.city["roads"]:
            self.assertNotIn(road["id"], identifiers)
            identifiers.add(road["id"])
            self.assertIn(road["kind"], MODULE.DRIVABLE)
            self.assertGreater(road["width"], 0)
            self.assertGreaterEqual(len(road["points"]), 2)
            self.assertTrue(all(MODULE.in_bounds(point, self.city["bounds"], -0.001) for point in road["points"]))

    def test_building_geometry_and_height_provenance(self):
        identifiers = set()
        for building in self.city["buildings"]:
            self.assertNotIn(building["id"], identifiers)
            identifiers.add(building["id"])
            self.assertGreater(MODULE.polygon_area(building["polygon"]), 12)
            self.assertGreater(building["height"], 0)
            self.assertIn(building["heightSource"], {"osm:height", "osm:building:levels", "estimated"})
            self.assertEqual(building["heightEstimated"], building["heightSource"] != "osm:height")
            self.assertTrue(MODULE.footprint_intersects(building["polygon"], self.city["bounds"]))

    def test_spawn_and_missions_are_on_roads_with_building_clearance(self):
        locations = [self.city["spawn"]] + self.city["missionPoints"]
        self.assertEqual(len(self.city["missionPoints"]), 6)
        self.assertEqual(len({point["name"] for point in locations}), 7)
        for location in locations:
            point = [location["x"], location["z"]]
            self.assertTrue(MODULE.in_bounds(point, self.city["bounds"], 27.99))
            self.assertTrue(MODULE.clear_of_buildings(point, self.city["buildings"], 2.99))
            road = next(road for road in self.city["roads"] if road["id"] == location["roadId"])
            distance = min(MODULE.segment_distance(point, a, b) for a, b in zip(road["points"], road["points"][1:]))
            self.assertLess(distance, 0.002)

    def test_spawn_heading_follows_source_road(self):
        spawn = self.city["spawn"]
        road = next(road for road in self.city["roads"] if road["id"] == spawn["roadId"])
        segment = min(zip(road["points"], road["points"][1:]), key=lambda edge: MODULE.segment_distance([spawn["x"], spawn["z"]], *edge))
        angle = math.atan2(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1])
        self.assertAlmostEqual(spawn["angle"], angle)

    def test_every_mission_is_connected_to_spawn_by_mapped_streets(self):
        graph = defaultdict(set)
        roads = {road["id"]: road for road in self.city["roads"]}
        for road in roads.values():
            for a, b in zip(road["points"], road["points"][1:]):
                graph[tuple(a)].add(tuple(b))
                graph[tuple(b)].add(tuple(a))
        # The game permits driving either direction; disconnected geometry would
        # still strand the player, even when each mission individually looks safe.
        queue = [tuple(roads[self.city["spawn"]["roadId"]]["points"][0])]
        visited = set()
        while queue:
            point = queue.pop()
            if point not in visited:
                visited.add(point)
                queue.extend(graph[point] - visited)
        for mission in self.city["missionPoints"]:
            self.assertIn(tuple(roads[mission["roadId"]]["points"][0]), visited)

    def test_landmarks_reference_named_osm_buildings(self):
        for landmark in self.city["landmarks"]:
            building = next(building for building in self.city["buildings"] if building["id"] == landmark["buildingId"])
            self.assertEqual(landmark["name"], building["name"])
        self.assertIn("OpenStreetMap", self.city["attribution"]["text"])


if __name__ == "__main__":
    unittest.main()
