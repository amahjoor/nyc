"""Verify official full-city street import and the distributable cell contract."""

from collections import Counter
import importlib.util
import json
import math
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("city_roads", BASE / "scripts" / "import-city-roads.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


def contains(point, ring):
    x, z = point
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > z) != (b[1] > z) and x < a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]):
            inside = not inside
    return inside


class ConversionTests(unittest.TestCase):
    def row(self, **changes):
        return {"objectid": "12", "full_street_name": "TEST ST", "boroughcode": "1", "rw_type": "1", "status": "2", "trafdir": "TF", "streetwidth": "40",
                "from_level_code": "13", "to_level_code": "17", "the_geom": {"type": "MultiLineString", "coordinates": [[[-74.0015, 40.7235], [-74.0005, 40.7235]]]}, **changes}

    def test_projection_width_direction_and_grade_provenance(self):
        road = IMPORTER.convert_road(self.row())[0]
        self.assertEqual(road["points"][0], [0, 0])
        self.assertAlmostEqual(road["points"][1][0], 84.27, delta=0.1)
        self.assertEqual(road["width"], 12.19)
        self.assertEqual(road["oneway"], "-1")
        self.assertEqual((road["fromLevel"], road["toLevel"]), (13, 17))
        self.assertEqual(road["surface"], "unknown")

    def test_nonvehicular_unbuilt_and_ferry_geometry_are_excluded(self):
        for changes in ({"trafdir": "NV"}, {"status": "3"}, {"rw_type": "14"}, {"boroughcode": "8"}):
            self.assertEqual(IMPORTER.convert_road(self.row(**changes)), [])

    def test_missing_width_is_explicitly_estimated(self):
        road = IMPORTER.convert_road(self.row(streetwidth="0", number_travel_lanes="3"))[0]
        self.assertTrue(road["widthEstimated"])
        self.assertEqual(road["width"], 10.2)

    def test_multipart_streets_remain_separate_without_false_connectors(self):
        geometry = {"type": "MultiLineString", "coordinates": [[[-74.0015, 40.7235], [-74.0005, 40.7235]], [[-73.99, 40.74], [-73.98, 40.74]]]}
        roads = IMPORTER.convert_road(self.row(the_geom=geometry))
        self.assertEqual(len(roads), 2)
        self.assertNotEqual(roads[0]["id"], roads[1]["id"])
        self.assertGreater(math.dist(roads[0]["points"][-1], roads[1]["points"][0]), 1000)

    def test_crossing_cells_and_edge_pavement_are_present_on_both_sides(self):
        road = {"points": [[-50, 500], [2050, 500]], "width": 10}
        self.assertEqual(IMPORTER.road_cells(road), {(-1, 0), (0, 0), (1, 0), (2, 0)})
        self.assertEqual(IMPORTER.road_cells({"points": [[998, 100], [998, 300]], "width": 10}), {(0, 0), (1, 0)})


class FullCityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads((BASE / "dist" / "road-index.json").read_bytes())
        cls.land = json.loads((BASE / "dist" / "boroughs.json").read_bytes())
        cls.roads = {}
        cls.cell_roads = {}
        for key, cell in cls.index["cells"].items():
            path = BASE / "dist" / cell["url"]
            blob = path.read_bytes()
            if len(blob) != cell["bytes"]:
                raise AssertionError(f"Cell byte count is stale: {path}")
            roads = json.loads(blob)["roads"]
            if len(roads) != cell["count"]:
                raise AssertionError(f"Cell road count is stale: {path}")
            cls.cell_roads[key] = {road["id"] for road in roads}
            for road in roads:
                if road["id"] in cls.roads and cls.roads[road["id"]] != road:
                    raise AssertionError(f"Inconsistent duplicate road: {road['id']}")
                cls.roads[road["id"]] = road

    def test_manifest_covers_all_boroughs_with_small_individual_requests(self):
        self.assertEqual(self.index["origin"], self.land["origin"])
        self.assertEqual(self.index["cellSize"], 1000)
        self.assertGreater(len(self.roads), 100000)
        self.assertEqual(len(self.roads), self.index["stats"]["roads"])
        counts = Counter(IMPORTER.BOROUGHS[road["borough"]] for road in self.roads.values())
        self.assertEqual(dict(counts), self.index["stats"]["byBorough"])
        self.assertEqual(set(counts), set(IMPORTER.BOROUGHS.values()))
        self.assertLess(max(cell["bytes"] for cell in self.index["cells"].values()), 25_000_000)
        self.assertEqual(len(self.index["source"]["files"]), 5)
        self.assertTrue(all(len(source["sha256"]) == 64 for source in self.index["source"]["files"]))

    def test_geometry_stays_within_city_bounds_and_all_cells_can_load_it(self):
        bounds = self.index["bounds"]
        for road in self.roads.values():
            self.assertGreater(road["width"], 0)
            for x, z in road["points"]:
                self.assertTrue(bounds["minX"] <= x <= bounds["maxX"] and bounds["minZ"] <= z <= bounds["maxZ"])
            for x, z in IMPORTER.road_cells(road):
                self.assertIn(road["id"], self.cell_roads[f"{x},{z}"])

    def test_travel_points_are_on_named_streets_and_actual_borough_land(self):
        self.assertEqual({place["borough"] for place in self.index["places"]}, set(IMPORTER.BOROUGHS.values()))
        boroughs = {borough["name"]: borough for borough in self.land["boroughs"]}
        for place in self.index["places"]:
            point = [place["x"], place["z"]]
            road = self.roads[place["roadId"]]
            self.assertEqual(place["street"], road["name"])
            self.assertEqual(road["roadwayType"], 1)
            distance = min(IMPORTER.point_segment(point, a, b)[0] for a, b in zip(road["points"], road["points"][1:]))
            self.assertLess(distance, 0.02)
            self.assertTrue(any(contains(point, polygon["outer"]) and not any(contains(point, hole) for hole in polygon["holes"])
                                for polygon in boroughs[place["borough"]]["polygons"]), place["name"])

    def test_source_street_geometry_connects_all_five_borough_travel_points(self):
        # This is a geographic continuity check. It does not claim that the
        # flattened gameplay currently models grade-separated bridge navigation.
        parent = {}

        def find(node):
            while parent[node] != node:
                parent[node] = parent[parent[node]]
                node = parent[node]
            return node

        def key(point):
            return round(point[0]), round(point[1])

        for road in self.roads.values():
            nodes = [key(point) for point in road["points"]]
            for node in nodes:
                parent.setdefault(node, node)
            for a, b in zip(nodes, nodes[1:]):
                parent[find(a)] = find(b)
        components = {find(key(self.roads[place["roadId"]]["points"][0])) for place in self.index["places"]}
        self.assertEqual(len(components), 1)
        self.assertGreater(self.index["stats"]["bridges"], 1000)
        self.assertGreater(self.index["stats"]["tunnels"], 100)
        names = {road["name"] for road in self.roads.values() if road["roadwayType"] == 3}
        self.assertIn("VERRAZZANO BRG", names)


if __name__ == "__main__":
    unittest.main()
