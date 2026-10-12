import copy
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("street_detail", ROOT / "scripts/import-street-detail.py")
DETAIL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DETAIL)


def geo_ring(points, height=None):
    coordinates = [DETAIL.unproject(x, z) + ([] if height is None else [height]) for x, z in points]
    return coordinates + [coordinates[0]]


def source_row(kind, identity="row-one", source_id="0.0"):
    outer = geo_ring([[-20, -20], [20, -20], [20, 20], [-20, 20]])
    hole = geo_ring([[-5, -5], [-5, 5], [5, 5], [5, -5]])
    spec = DETAIL.LAYERS[kind]
    geometry = {"type": "MultiLineString", "coordinates": [outer[:3]]} if kind == "curb" else {
        "type": "MultiPolygon", "coordinates": [[outer, hole]]}
    return {"row_id": identity, "source_id": source_id, "the_geom": geometry,
            "feat_code": str(spec.get("featureCode", min(spec.get("featureCodes", {0})))), "sub_code": str(next(iter(spec["subtypes"]))), "status": "New"}


class StreetDetailImportTests(unittest.TestCase):
    def test_projection_uses_current_meter_origin_and_rejects_foreign_or_nonfinite_geometry(self):
        self.assertEqual(DETAIL.project(-74.0015, 40.7235), [0, 0])
        for point in [[1000, 0], [-1000, 500], [50, -1000]]:
            self.assertEqual(DETAIL.project(*DETAIL.unproject(*point)), point)
        for coordinate in [(float("nan"), 40.7), ("-74", 40.7), (-73, 41.5), (-75, 40.7), (True, 40.7)]:
            with self.assertRaises(ValueError):
                DETAIL.project(*coordinate)

    def test_download_query_is_bounded_and_uses_unique_source_row_identity(self):
        for kind in DETAIL.BASE_LAYERS:
            spec = DETAIL.LAYERS[kind]
            url = urlparse(DETAIL.query_url(kind))
            query = parse_qs(url.query)
            self.assertEqual(url.netloc, "data.cityofnewyork.us")
            self.assertIn(spec["dataset"], url.path)
            self.assertEqual(query["$order"], [":id"])
            self.assertIn(":id AS row_id", query["$select"][0])
            self.assertIn("intersects(the_geom,'POLYGON ((", query["$where"][0])
            self.assertEqual(query["$limit"], [str(DETAIL.ROW_LIMIT)])

    def test_polygon_holes_and_multipart_islands_are_not_filled_or_connected(self):
        row = source_row("sidewalk")
        island = geo_ring([[40, 0], [50, 0], [50, 10], [40, 10]])
        row["the_geom"]["coordinates"].append([island])
        features = DETAIL.convert_rows("sidewalk", [row])
        self.assertEqual(len(features), 2)
        self.assertEqual(features[0]["polygon"], [[-20, -20], [20, -20], [20, 20], [-20, 20]])
        self.assertEqual(features[0]["holes"], [[[-5, -5], [-5, 5], [5, 5], [5, -5]]])
        self.assertEqual(features[1]["polygon"], [[40, 0], [50, 0], [50, 10], [40, 10]])
        self.assertNotEqual(features[0]["id"], features[1]["id"])

    def test_zero_source_ids_remain_distinct_and_duplicate_row_ids_fail(self):
        rows = [source_row("curb", "row-first"), source_row("curb", "row-second")]
        features = DETAIL.convert_rows("curb", rows)
        self.assertEqual([f["sourceId"] for f in features], ["0.0", "0.0"])
        self.assertEqual(len({f["id"] for f in features}), 2)
        with self.assertRaisesRegex(ValueError, "duplicate source row"):
            DETAIL.convert_rows("curb", [rows[0], rows[0]])

    def test_unknown_classifications_are_not_rendered_as_confirmed_pavement(self):
        row = source_row("roadbed")
        for field, value in [("feat_code", "9999"), ("sub_code", "999999"), ("status", "Deleted")]:
            bad = copy.deepcopy(row);bad[field] = value
            with self.assertRaisesRegex(ValueError, "classification"):
                DETAIL.convert_rows("roadbed", [bad])

    def test_curb_z_is_preserved_without_treating_it_as_curb_height(self):
        row = source_row("curb")
        row["the_geom"]["coordinates"] = [[[-74.0015, 40.7235, 27.4], [-74.0014, 40.7235, 27.8]]]
        curb = DETAIL.convert_rows("curb", [row])[0]
        self.assertEqual(curb["sourceElevations"], [27.4, 27.8])
        self.assertTrue(all(len(point) == 2 for point in curb["points"]))
        self.assertIn("unverified", curb["elevationMeaning"])
        self.assertNotIn("height", curb)
        flat = DETAIL.convert_rows("curb", [source_row("curb")])[0]
        self.assertNotIn("sourceElevations", flat)
        self.assertNotIn("height", flat)

    def test_cells_respect_holes_and_keep_crossing_segments_without_inventing_a_join(self):
        surface = {"polygon": [[-100, -100], [100, -100], [100, 100], [-100, 100]],
                   "holes": [[[-10, -10], [10, -10], [10, 10], [-10, 10]]]}
        small = {"minX": -1, "maxX": 1, "minZ": -1, "maxZ": 1}
        self.assertFalse(DETAIL.meets_box(surface, small), "a wholly empty courtyard cannot count as pavement")
        surface["holes"][0] = [[-10, -10], [10, -10], [10, 10], [1, 10], [0, 0], [-1, 10], [-10, 10]]
        self.assertTrue(DETAIL.meets_box(surface, small), "a narrow pavement notch can enter a cell whose corners are all in its hole")
        self.assertTrue(DETAIL.meets_box({"points": [[-5, 0], [5, 0]]}, small))
        self.assertFalse(DETAIL.meets_box({"points": [[-5, 3], [5, 3]]}, small))

    def test_long_surveyed_features_are_retained_whole_but_only_requested_cells_are_emitted(self):
        row = source_row("curb")
        row["the_geom"]["coordinates"] = [[DETAIL.unproject(-1500, 20), DETAIL.unproject(1500, 20)]]
        features = DETAIL.convert_rows("curb", [row])
        tiles = DETAIL.tile_features(features)
        self.assertEqual(features[0]["points"], [[-1500, 20], [1500, 20]])
        self.assertEqual(set(tiles), {(-2, 0), (-1, 0), (0, 0), (1, 0)})
        self.assertTrue(all(tile["curbs"][0]["id"] == features[0]["id"] for tile in tiles.values()))

    def test_complete_import_rebuilds_deterministically_from_local_sources(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for kind in DETAIL.BASE_LAYERS:
                DETAIL.source_path(directory, kind).write_text(json.dumps([source_row(kind)]))
            with patch("builtins.print"):
                first = DETAIL.build(directory, directory / "first")
                second = DETAIL.build(directory, directory / "second")
            self.assertEqual(first, second)
            self.assertEqual(first["stats"]["byKind"], {"roadbed": 1, "sidewalk": 1, "curb": 1})
            self.assertEqual(first["stats"]["holes"], 2)
            self.assertEqual(first["stats"]["featuresWithSourceElevations"], 0)
            for layer in first["source"]["layers"]:
                self.assertEqual(len(layer["sha256"]), 64)
            for path in (directory / "first").rglob("*.json"):
                self.assertEqual(path.read_bytes(), (directory / "second" / path.relative_to(directory / "first")).read_bytes())

    def test_downloader_rejects_a_response_shorter_than_the_official_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            cache = Path(temporary)
            with patch.object(DETAIL, "fetch_json", side_effect=[[{"count": "2"}], [source_row("roadbed")]]):
                with self.assertRaisesRegex(ValueError, "Incomplete roadbed response"):
                    DETAIL.download_inputs(cache)
            self.assertFalse(DETAIL.source_path(cache, "roadbed").exists())

    def test_transport_outline_preserves_verified_metric_z_and_rejects_zero_placeholders(self):
        row = source_row("transport")
        row["the_geom"]["coordinates"] = [[geo_ring([[-20, -20], [20, -20], [20, 20], [-20, 20]], 100)]]
        feature = DETAIL.convert_rows("transport", [row])[0]
        self.assertEqual(feature["elevationStatus"], "surveyed")
        self.assertEqual(feature["verticalDatum"], "NAVD88")
        self.assertEqual(feature["elevationUnits"], "meters")
        self.assertEqual(feature["sourceElevations"]["polygon"], [100] * 4)
        self.assertEqual(feature["elevations"]["polygon"], [round(100 * 1200 / 3937, 5)] * 4)
        for coordinate in row["the_geom"]["coordinates"][0][0]:
            coordinate[2] = 0
        feature = DETAIL.convert_rows("transport", [row])[0]
        self.assertEqual(feature["elevationStatus"], "unavailable")
        self.assertNotIn("elevations", feature)
        self.assertIn("unresolved", feature["elevationLimitation"])

    def test_arcgis_export_keeps_object_identity_and_rejects_pagination_truncation(self):
        geometry = source_row("parking")["the_geom"]
        response = {"type": "FeatureCollection", "features": [{"properties": {"OBJECTID": 5, "SOURCE_ID": 0,
                    "FEATURE_CODE": 5000, "SUB_FEATURE_CODE": 500000, "STATUS": "New"}, "geometry": geometry}]}
        rows = DETAIL.normalize_response("parking", response)
        self.assertEqual(DETAIL.convert_rows("parking", rows)[0]["id"], "parking:arcgis-5:0")
        response["exceededTransferLimit"] = True
        with self.assertRaisesRegex(ValueError, "truncated"):
            DETAIL.normalize_response("parking", response)

    def test_regions_keep_distinct_cells_and_deduplicate_whole_features(self):
        regions = DETAIL.coverage_regions(True)
        self.assertEqual({r["borough"] for r in regions}, {"Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"})
        self.assertEqual(len(regions), 7)
        row = source_row("curb")
        row["the_geom"]["coordinates"] = [[DETAIL.unproject(-1500, 20), DETAIL.unproject(1500, 20)]]
        features = DETAIL.convert_rows("curb", [row])
        tiles = DETAIL.tile_features(features, [DETAIL.COVERAGE, DETAIL.COVERAGE])
        self.assertTrue(all(len(tile["curbs"]) == 1 for tile in tiles.values()))
        self.assertEqual(set(tiles), {(-2, 0), (-1, 0), (0, 0), (1, 0)})

    def test_cached_source_with_different_query_cannot_be_mislabeled_as_new_coverage(self):
        with tempfile.TemporaryDirectory() as temporary:
            cache = Path(temporary)
            for kind in DETAIL.BASE_LAYERS:
                path = DETAIL.source_path(cache, kind)
                path.write_text(json.dumps([source_row(kind)]))
                path.with_suffix(".query.json").write_text(json.dumps("a query for another region"))
            with self.assertRaisesRegex(ValueError, "bounds differ"):
                DETAIL.build(cache, cache / "output")

    def test_transport_queries_preserve_z_and_are_bounded(self):
        query = parse_qs(urlparse(DETAIL.query_url("transport")).query)
        self.assertEqual(query["returnZ"], ["true"])
        self.assertEqual(query["outSR"], ["4326"])
        self.assertEqual(query["geometryType"], ["esriGeometryEnvelope"])
        self.assertEqual(query["f"], ["geojson"])


class BakedStreetDetailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / "dist/street-detail-index.json").read_text())
        cls.tiles = {}
        cls.features = {}
        for key, cell in cls.manifest["cells"].items():
            raw = (ROOT / "dist" / cell["url"].removeprefix("./")).read_bytes()
            tile = json.loads(raw)
            cls.tiles[key] = (cell, raw, tile)
            for feature in tile["surfaces"] + tile["curbs"] + tile.get("structures", []):
                if feature["id"] in cls.features:
                    if feature != cls.features[feature["id"]]:
                        raise AssertionError("Repeated cell references disagree about source geometry")
                cls.features[feature["id"]] = feature

    def test_baked_data_matches_confirmed_source_counts_and_preserves_holes(self):
        self.assertEqual(self.manifest["origin"], DETAIL.ORIGIN)
        self.assertEqual(self.manifest["coverageBounds"], DETAIL.COVERAGE)
        self.assertEqual(len(self.features), 6942)
        self.assertEqual(self.manifest["stats"]["byKind"], {"roadbed": 1725, "sidewalk": 907, "curb": 4143, "parking": 111, "transport": 56})
        self.assertEqual(sum(len(f.get("holes", [])) for f in self.features.values()), 934)
        self.assertEqual({layer["dataset"] for layer in self.manifest["source"]["layers"]}, {"i36f-5ih7", "52n9-sdep", "5xvt-8cbk", "Parking_Lot_2022/FeatureServer/13", "Transport_Structure_2022/FeatureServer/25"})

    def test_bridge_decks_keep_navd88_while_missing_z_is_explicit(self):
        bridge = self.features["transport:arcgis-2242:0"]
        self.assertEqual(bridge["name"], "Brooklyn Bridge")
        self.assertEqual(bridge["elevationStatus"], "surveyed")
        self.assertEqual(bridge["verticalDatum"], "NAVD88")
        self.assertGreater(max(bridge["elevations"]["polygon"]), 40)
        self.assertLess(min(bridge["elevations"]["polygon"]), 7)
        for feature in self.features.values():
            if feature.get("elevationStatus") == "surveyed":
                self.assertEqual(len(feature["polygon"]), len(feature["elevations"]["polygon"]))
                for source, meters in zip(feature["sourceElevations"]["polygon"], feature["elevations"]["polygon"]):
                    self.assertAlmostEqual(source * DETAIL.US_SURVEY_FOOT, meters, places=5)
            if feature.get("elevationStatus") == "unavailable":
                self.assertNotIn("elevations", feature)
        missing = self.features["transport:arcgis-1996:0"]
        self.assertEqual(missing["elevationStatus"], "unavailable")
        self.assertEqual(missing["sourceElevations"]["polygon"], [0] * len(missing["polygon"]))

    def test_five_borough_regions_retain_bounded_road_parking_and_transport_sources(self):
        regions = self.manifest["coverageRegions"]
        self.assertEqual(len(regions), 7)
        self.assertEqual({r["borough"] for r in regions}, {"Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"})
        self.assertTrue(all(r["stats"]["roadbed"] > 0 for r in regions))
        self.assertTrue(all(r["stats"]["parking"] > 0 for r in regions))
        self.assertEqual(len(self.manifest["source"]["layers"]), 35)

    def test_sample_arrivals_use_actual_bundled_street_centerlines(self):
        views = [region for region in self.manifest["coverageRegions"] if "view" in region]
        self.assertEqual({region["id"] for region in views}, {"meadow-lake", "brooklyn-bridge"})
        for region in views:
            view = region["view"]
            tile = ROOT / "dist/roads" / f"{math.floor(view['x'] / 1000)}_{math.floor(view['z'] / 1000)}.json"
            road = next(road for road in json.loads(tile.read_text())["roads"] if road["id"] == region["viewSourceRoadId"])
            self.assertEqual(road["name"], region["viewSourceRoadName"])
            matches = []
            for a, b in zip(road["points"], road["points"][1:]):
                if math.hypot(view["x"] - (a[0] + b[0]) / 2, view["z"] - (a[1] + b[1]) / 2) < 0.001:
                    matches.append((a, b))
            self.assertEqual(len(matches), 1)
            a, b = matches[0]
            self.assertAlmostEqual(view["heading"], math.atan2(b[0] - a[0], b[1] - a[1]), places=3)

    def test_full_bridge_span_retains_structure_cells_past_pavement_bounds(self):
        bridge = self.features["transport:arcgis-2242:0"]
        for point in bridge["polygon"]:
            key = f"{math.floor(point[0] / DETAIL.CELL_SIZE)},{math.floor(point[1] / DETAIL.CELL_SIZE)}"
            self.assertIn(key, self.tiles)
            self.assertTrue(any(feature["id"] == bridge["id"] for feature in self.tiles[key][2]["structures"]))

    def test_tiles_are_bounded_and_reference_only_finite_surveyed_components(self):
        self.assertEqual(len(self.tiles), 62)
        self.assertLess(self.manifest["stats"]["bytes"], 30_000_000)
        for cell, raw, tile in self.tiles.values():
            features = tile["surfaces"] + tile["curbs"] + tile.get("structures", [])
            self.assertEqual(cell["count"], len(features))
            self.assertEqual(cell["bytes"], len(raw))
            self.assertLess(len(raw), 2_000_000)
            self.assertEqual(len({f["id"] for f in features}), len(features))
            for feature in features:
                self.assertTrue(DETAIL.meets_box(feature, cell["bounds"]))
                points = feature.get("polygon", feature.get("points"))
                self.assertTrue(all(len(p) == 2 and all(math.isfinite(n) for n in p) for p in points))
                self.assertNotIn("height", feature)
                self.assertNotIn("material", feature)
                if feature["kind"] != "transport":
                    self.assertNotIn("sourceElevations", feature)


if __name__ == "__main__":
    unittest.main()
