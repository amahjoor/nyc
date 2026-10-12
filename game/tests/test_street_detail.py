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
            "feat_code": str(spec["featureCode"]), "sub_code": str(next(iter(spec["subtypes"]))), "status": "New"}


class StreetDetailImportTests(unittest.TestCase):
    def test_projection_uses_current_meter_origin_and_rejects_foreign_or_nonfinite_geometry(self):
        self.assertEqual(DETAIL.project(-74.0015, 40.7235), [0, 0])
        for point in [[1000, 0], [-1000, 500], [50, -1000]]:
            self.assertEqual(DETAIL.project(*DETAIL.unproject(*point)), point)
        for coordinate in [(float("nan"), 40.7), ("-74", 40.7), (-73, 41.5), (-75, 40.7), (True, 40.7)]:
            with self.assertRaises(ValueError):
                DETAIL.project(*coordinate)

    def test_download_query_is_bounded_and_uses_unique_source_row_identity(self):
        for kind, spec in DETAIL.LAYERS.items():
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
            for kind in DETAIL.LAYERS:
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
            for feature in tile["surfaces"] + tile["curbs"]:
                if feature["id"] in cls.features:
                    if feature != cls.features[feature["id"]]:
                        raise AssertionError("Repeated cell references disagree about source geometry")
                cls.features[feature["id"]] = feature

    def test_baked_data_matches_confirmed_source_counts_and_preserves_holes(self):
        self.assertEqual(self.manifest["origin"], DETAIL.ORIGIN)
        self.assertEqual(self.manifest["coverageBounds"], DETAIL.COVERAGE)
        self.assertEqual(len(self.features), 4321)
        self.assertEqual(self.manifest["stats"]["byKind"], {"roadbed": 1063, "sidewalk": 620, "curb": 2638})
        self.assertEqual(sum(len(f.get("holes", [])) for f in self.features.values()), 447)
        self.assertEqual({layer["dataset"] for layer in self.manifest["source"]["layers"]}, {"i36f-5ih7", "52n9-sdep", "5xvt-8cbk"})

    def test_tiles_are_bounded_and_reference_only_finite_surveyed_components(self):
        self.assertEqual(len(self.tiles), 16)
        self.assertLess(self.manifest["stats"]["bytes"], 12_000_000)
        for cell, raw, tile in self.tiles.values():
            features = tile["surfaces"] + tile["curbs"]
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
                self.assertNotIn("sourceElevations", feature)


if __name__ == "__main__":
    unittest.main()
