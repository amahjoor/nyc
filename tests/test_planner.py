import math
import unittest

from nyc_reference.planner import EARTH_RADIUS_M, plan_stops


def way(way_id=1, geometry=None, **tags):
    return {
        "type": "way", "id": way_id,
        "tags": {"highway": "residential", "name": "Test Street", **tags},
        "geometry": geometry if geometry is not None else [
            {"lat": 40.72, "lon": -74.0},
            {"lat": 40.73, "lon": -74.0},
        ],
    }


def data(*ways):
    return {"elements": list(ways)}


class PlannerTests(unittest.TestCase):
    def test_spacing_continues_across_segments(self):
        # Each segment is 45 m: resetting at the turn would miss the 60 m stop.
        degrees_per_meter = 180 / (math.pi * EARTH_RADIUS_M)
        geometry = [
            {"lat": 0, "lon": 0},
            {"lat": 0, "lon": 45 * degrees_per_meter},
            {"lat": 45 * degrees_per_meter, "lon": 45 * degrees_per_meter},
        ]
        stops = plan_stops(data(way(geometry=geometry)), spacing_m=60)
        self.assertEqual(len(stops), 2)
        self.assertAlmostEqual(stops[1]["lat"], 15 * degrees_per_meter)
        self.assertAlmostEqual(stops[1]["lon"], 45 * degrees_per_meter)
        self.assertAlmostEqual(stops[0]["heading"], 90)
        self.assertAlmostEqual(stops[1]["heading"], 0)

    def test_oneway_negative_reverses_heading(self):
        forward = plan_stops(data(way()))[0]
        reverse = plan_stops(data(way(oneway="-1")))[0]
        self.assertAlmostEqual((reverse["heading"] - forward["heading"]) % 360, 180)
        self.assertEqual(forward["id"], reverse["id"])

    def test_sorted_ids_are_stable_and_stop_limit_is_exact(self):
        north = way(20)
        south = way(3, geometry=[{"lat": 40.70, "lon": -74}, {"lat": 40.71, "lon": -74}])
        first = plan_stops(data(north, south), max_stops=5)
        self.assertEqual(first, plan_stops(data(south, north), max_stops=5))
        self.assertEqual(len(first), 5)
        self.assertEqual(first[0]["id"], "osm-way-3-0")
        self.assertEqual(first[-1]["id"], "osm-way-3-4")

    def test_only_public_drivable_ways_are_used(self):
        excluded = [way(1, highway="footway"), way(2, access="private"),
                    way(3, access="no"), way(4, motor_vehicle="no"),
                    way(5, vehicle="private")]
        included = way(8, highway="primary_link", name="")
        stops = plan_stops(data(*excluded, included))
        self.assertTrue(stops)
        self.assertTrue(all(stop["osm_way_id"] == 8 for stop in stops))
        self.assertEqual(stops[0]["street"], "primary_link")

    def test_duplicate_ways_and_repeated_points_do_not_duplicate_stops(self):
        original = way()
        duplicate = way(2)
        repeated = way(3, geometry=[original["geometry"][0]] * 2)
        expected = plan_stops(data(original))
        self.assertEqual(plan_stops(data(duplicate, original, repeated)), expected)

    def test_bbox_keeps_global_sample_indices(self):
        bbox = (40.724, -74.001, 40.726, -73.999)
        all_stops = plan_stops(data(way()))
        expected = [stop for stop in all_stops if bbox[0] <= stop["lat"] <= bbox[2]]
        clipped = plan_stops(data(way()), bbox=bbox)
        self.assertEqual(clipped, expected)
        self.assertTrue(all(bbox[0] <= stop["lat"] <= bbox[2] and bbox[1] <= stop["lon"] <= bbox[3] for stop in clipped))

    def test_bbox_can_intersect_way_with_both_endpoints_outside(self):
        geometry = [{"lat": 0, "lon": -10}, {"lat": 0, "lon": 10}]
        stops = plan_stops(data(way(geometry=geometry)), spacing_m=0.000001,
                           max_stops=4, bbox=(-0.001, -0.0001, 0.001, 0.0001))
        self.assertEqual(len(stops), 4)
        self.assertTrue(all(-0.0001 <= stop["lon"] <= 0.0001 for stop in stops))

    def test_tiny_spacing_is_bounded_by_unique_coordinates_and_cap(self):
        stops = plan_stops(data(way()), spacing_m=1e-310, max_stops=4)
        self.assertEqual(len(stops), 4)
        self.assertEqual(len({(round(stop["lat"], 6), round(stop["lon"], 6)) for stop in stops}), 4)

    def test_invalid_parameters_raise_value_error(self):
        for spacing in (0, -1, float("nan"), float("inf"), "60", True):
            with self.subTest(spacing=spacing), self.assertRaises(ValueError):
                plan_stops(data(way()), spacing_m=spacing)
        for limit in (0, -1, 1.5, True, "4"):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                plan_stops(data(way()), max_stops=limit)
        for bbox in ((1, 2, 0, 3), (0, 3, 1, 2), (0, 0, 91, 1), (0, 0, 1), "box", 8):
            with self.subTest(bbox=bbox), self.assertRaises(ValueError):
                plan_stops(data(way()), bbox=bbox)

    def test_malformed_geometry_is_rejected_before_stop_limit(self):
        bad_points = [{"lat": 91, "lon": 0}, {"lat": 0, "lon": 181},
                      {"lat": float("nan"), "lon": 0}, {"lat": "40", "lon": 0},
                      {"lat": True, "lon": 0}, {"lat": 0}, None]
        for point in bad_points:
            with self.subTest(point=point), self.assertRaises(ValueError):
                plan_stops(data(way(), way(2, geometry=[{"lat": 0, "lon": 0}, point])), max_stops=1)
        for geometry in (None, [], [{"lat": 0, "lon": 0}], "geometry"):
            invalid = way()
            invalid["geometry"] = geometry
            with self.subTest(geometry=geometry), self.assertRaises(ValueError):
                plan_stops(data(invalid))

    def test_empty_or_disjoint_roads_return_no_stops(self):
        self.assertEqual(plan_stops(data()), [])
        self.assertEqual(plan_stops(data(way()), bbox=(0, 0, 1, 1)), [])


if __name__ == "__main__":
    unittest.main()
