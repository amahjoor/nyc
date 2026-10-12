"""Validate AI review gates, georeferencing and source-constrained geometry."""

import hashlib
import importlib.util
import json
import math
import html
import re
import tempfile
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("reconstruct", ROOT / "scripts/reconstruct-imagery.py")
reconstruct = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reconstruct)
GEOMETRY_AVAILABLE = all(importlib.util.find_spec(name) is not None
                         for name in ("numpy", "shapely", "rasterio", "PIL", "scipy"))


class ReviewGateTests(unittest.TestCase):
    def test_high_model_score_cannot_override_disagreement_with_source(self):
        metrics = reconstruct.agreement(20, 100, 100)
        accepted, reason = reconstruct.approve(metrics, 0.99, 100, "water")
        self.assertFalse(accepted)
        self.assertIn("agreement", reason)

    def test_empty_masks_nonfinite_scores_and_unknown_class_are_rejected(self):
        good = {"iou": 0.9, "precision": 0.98, "recall": 0.92}
        for score, count, kind in [(math.nan, 100, "water"), (1.1, 100, "water"),
                                   (.99, 0, "water"), (.99, 100, "building")]:
            self.assertFalse(reconstruct.approve(good, score, count, kind)[0])
        self.assertEqual(reconstruct.agreement(0, 0, 0), {"iou": 0, "precision": 0, "recall": 0})

    def test_quality_and_overlap_both_pass_for_supported_feature(self):
        metrics = reconstruct.agreement(950, 1000, 1000)
        self.assertTrue(reconstruct.approve(metrics, .95, 1000, "water")[0])
        self.assertFalse(reconstruct.approve(metrics, .4, 1000, "water")[0])

    def test_road_and_parking_require_same_strict_review_gates(self):
        for kind in ("roadbed", "parking"):
            self.assertTrue(reconstruct.approve({"iou": .88, "precision": .94, "recall": .92}, .91, 1200, kind)[0])
            self.assertFalse(reconstruct.approve({"iou": .80, "precision": .84, "recall": .92}, .99, 1200, kind)[0])
            self.assertFalse(reconstruct.approve({"iou": .65, "precision": .94, "recall": .69}, .99, 1200, kind)[0])

    def test_new_review_asset_bundle_cannot_overwrite_pond(self):
        pond, pond_url = reconstruct.output_directory(Path("dist/reconstruction-review.json"))
        roads, road_url = reconstruct.output_directory(Path("dist/road-reconstruction-review.json"))
        self.assertEqual(str(pond), "dist/reconstruction")
        self.assertEqual(pond_url, "./reconstruction")
        self.assertEqual(str(roads), "dist/road-reconstruction")
        self.assertEqual(road_url, "./road-reconstruction")
        for folder in ("..", ".", "../reconstruction", "/reconstruction", "a/b"):
            with self.assertRaises(ValueError):
                reconstruct.output_directory(Path("dist/road-review.json"), folder)

    def test_class_filter_keeps_source_identity_and_rejects_duplicates(self):
        road = {"properties": {"kind": "roadbed", "sourceId": "0", "sourceFeatureId": "roadbed:row-a:0",
                               "sourceUrl": "https://data.cityofnewyork.us/d/i36f-5ih7"}}
        parking = {"properties": {"kind": "parking", "sourceId": "0", "sourceFeatureId": "parking:row-b:0",
                                  "sourceUrl": "https://data.cityofnewyork.us/d/h7zy-iq3d"}}
        collection = {"type": "FeatureCollection", "features": [road, parking]}
        self.assertEqual(reconstruct.validate_references(collection, ["parking"]), [parking])
        self.assertEqual(len(reconstruct.validate_references(collection)), 2)
        for invalid in ({"type": "FeatureCollection", "features": [road, road]},
                        {"type": "FeatureCollection", "features": [{"properties": {"kind": "roadbed"}}]}):
            with self.assertRaises(ValueError):
                reconstruct.validate_references(invalid)
        with self.assertRaises(ValueError):
            reconstruct.validate_references(collection, ["water"])

    def test_pixel_geographic_roundtrip_and_north_direction(self):
        grid = {"zoom": 19, "minColumn": 154410, "minRow": 197025}
        for point in [(0, 0), (1536, 1792), (763.25, 821.75)]:
            lon, lat = reconstruct.pixel_to_lonlat(*point, grid)
            actual = reconstruct.lonlat_to_pixel(lon, lat, grid)
            self.assertAlmostEqual(actual[0], point[0], places=6)
            self.assertAlmostEqual(actual[1], point[1], places=6)
        north = reconstruct.pixel_to_lonlat(100, 0, grid)
        south = reconstruct.pixel_to_lonlat(100, 100, grid)
        self.assertGreater(north[1], south[1])

    def test_bundled_inference_has_real_pinned_model_and_matching_references(self):
        report = json.loads((ROOT / "dist/reconstruction-review.json").read_text())
        self.assertEqual(report["status"], "inference-complete")
        self.assertEqual(report["model"]["revision"], reconstruct.REVISION)
        self.assertEqual(report["model"]["weightsSha256"], reconstruct.WEIGHTS_SHA256)
        reference = ROOT / "dist" / report["reference"]["url"]
        self.assertEqual(hashlib.sha256(reference.read_bytes()).hexdigest(), report["reference"]["sha256"])
        self.assertGreater(report["summary"]["candidates"], 0)
        for feature in report["features"]:
            decision = reconstruct.approve(feature["sourceAgreement"], feature["predictedIou"],
                                           feature["candidatePixels"], feature["kind"])[0]
            self.assertEqual(feature["accepted"], decision)
            self.assertTrue((ROOT / "dist" / feature["candidateMask"]).is_file())
            if not decision:
                self.assertIsNone(feature["geometry"])
                self.assertIsNone(feature["localGeometry"])
                self.assertEqual(feature["approvedPixels"], 0)
        for tile in report["imagery"]["tiles"]:
            data = (ROOT / "dist" / tile["url"]).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), tile["sha256"])


    def test_road_report_and_review_page_keep_rejected_masks_out_of_geometry(self):
        report = json.loads((ROOT / "dist/road-reconstruction-review.json").read_text())
        self.assertEqual(report["status"], "inference-complete")
        self.assertEqual(report["model"]["revision"], reconstruct.REVISION)
        self.assertEqual(report["model"]["weightsSha256"], reconstruct.WEIGHTS_SHA256)
        reference = ROOT / "dist" / report["reference"]["url"]
        self.assertEqual(hashlib.sha256(reference.read_bytes()).hexdigest(), report["reference"]["sha256"])
        self.assertEqual({feature["kind"] for feature in report["features"]}, {"roadbed", "parking"})
        accepted = sum(feature["accepted"] for feature in report["features"])
        self.assertEqual(report["summary"], {"candidates": len(report["features"]), "accepted": accepted,
                                           "rejected": len(report["features"]) - accepted})
        for feature in report["features"]:
            decision = reconstruct.approve(feature["sourceAgreement"], feature["predictedIou"],
                                           feature["candidatePixels"], feature["kind"])[0]
            self.assertEqual(feature["accepted"], decision)
            self.assertIn("appearance-only", feature["use"])
            if not decision:
                self.assertIsNone(feature["geometry"])
                self.assertIsNone(feature["localGeometry"])
                self.assertEqual(feature["approvedPixels"], 0)
            for key in ("candidateMask", "referenceMask", "approvedMask"):
                self.assertTrue((ROOT / "dist" / feature[key]).is_file())
        for tile in report["imagery"]["tiles"]:
            self.assertEqual(hashlib.sha256((ROOT / "dist" / tile["url"]).read_bytes()).hexdigest(), tile["sha256"])
        page = (ROOT / "dist/reconstruction.html").read_text()
        listed = [html.unescape(value) for value in re.findall(r'data-road-source="([^"]+)"', page)]
        self.assertEqual(listed, [feature["sourceFeatureId"] for feature in report["features"]])
        self.assertIn(f'data-road-summary="{len(listed)},{accepted},{len(listed)-accepted}"', page)
        self.assertIn('href="./road-reconstruction-review.json"', page)
        self.assertIn('href="./reconstruction-review.json"', page)


@unittest.skipUnless(GEOMETRY_AVAILABLE, "Optional isolated reconstruction dependencies are not installed")
class GeometryTests(unittest.TestCase):
    def test_bundled_approved_masks_are_exact_source_intersections(self):
        import numpy as np
        from PIL import Image
        from shapely.geometry import shape
        report = json.loads((ROOT / "dist/reconstruction-review.json").read_text())
        references = json.loads((ROOT / "dist" / report["reference"]["url"]).read_text())
        by_id = {f["properties"]["sourceId"]: f for f in references["features"]}
        for feature in report["features"]:
            def mask(key):
                with Image.open(ROOT / "dist" / feature[key]) as image:
                    return np.asarray(image) > 0
            proposed, reference, approved = mask("candidateMask"), mask("referenceMask"), mask("approvedMask")
            self.assertEqual(int(proposed.sum()), feature["candidatePixels"])
            self.assertEqual(int(approved.sum()), feature["approvedPixels"])
            self.assertTrue(np.array_equal(approved, proposed & reference if feature["accepted"] else np.zeros_like(reference)))
            if feature["accepted"]:
                original = shape(by_id[feature["sourceId"]]["geometry"])
                geometry = shape(feature["geometry"])
                self.assertLess(geometry.difference(original).area, 1e-18)

    def test_water_island_stays_empty_and_vector_never_expands_source(self):
        from shapely.geometry import shape
        grid = {"zoom": 19, "minColumn": 154410, "minRow": 197025}
        rings = [[(1.3, 1.3), (14.7, 1.3), (14.7, 14.7), (1.3, 14.7), (1.3, 1.3)],
                 [(5, 5), (10, 5), (10, 10), (5, 10), (5, 5)]]
        geometry = {"type": "Polygon", "coordinates": [
            [reconstruct.pixel_to_lonlat(*p, grid) for p in ring] for ring in rings]}
        mask = reconstruct.polygons_to_mask(geometry, (16, 16), grid)
        self.assertTrue(mask[3, 3])
        self.assertFalse(mask[7, 7])
        self.assertFalse(mask[0, 0])
        result = shape(reconstruct.mask_geometry(mask, grid, geometry))
        self.assertLess(result.difference(shape(geometry)).area, 1e-20)
        self.assertFalse(result.covers(shape({"type": "Point", "coordinates": reconstruct.pixel_to_lonlat(7, 7, grid)})))

    def test_distributed_road_prompts_never_label_source_as_background(self):
        import numpy as np
        from scipy.ndimage import distance_transform_edt
        mask = np.zeros((160, 160), dtype=bool)
        mask[20:145, 25:45] = True
        mask[125:145, 25:140] = True
        prompt = reconstruct.prompts_for_mask(mask, grid_size=3)
        exterior = distance_transform_edt(~mask)
        self.assertGreater(prompt["labels"].count(1), 1)
        self.assertGreater(prompt["labels"].count(0), 1)
        for (x, y), label in zip(prompt["points"], prompt["labels"]):
            self.assertEqual(bool(mask[y, x]), bool(label))
            if not label:
                self.assertGreaterEqual(exterior[y, x], 4)
                self.assertLessEqual(exterior[y, x], 16)

    def test_street_tile_reference_deduplicates_clips_and_preserves_holes(self):
        from shapely.geometry import shape, Point
        origin = reconstruct.ortho.ORIGIN
        bbox = [origin["lon"]-.0006, origin["lat"]-.0006, origin["lon"]+.0006, origin["lat"]+.0006]
        feature = {"id": "parking:arcgis-10:0", "kind": "parking", "sourceId": "0", "sourceRowId": "arcgis-10",
                   "subCode": 500000, "polygon": [[-100,-100],[100,-100],[100,100],[-100,100]],
                   "holes": [[[-10,-10],[-10,10],[10,10],[10,-10]]]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / "cell.json").write_text(json.dumps({"surfaces": [feature]}))
            cell = {"url": "./cell.json", "bounds": {"minX": -100,"maxX": 100,"minZ": -100,"maxZ": 100}}
            index = {"origin": origin, "source": {"surveyYear": 2022, "layers": [{"kind": "parking", "url": "https://example.test/source"}]},
                     "cells": {"0,0": cell, "0,1": cell}}
            (path / "index.json").write_text(json.dumps(index))
            result = reconstruct.reference_from_street_tiles(path / "index.json", bbox, ["parking"])
            self.assertEqual(len(result["features"]), 1)
            record = result["features"][0]
            self.assertEqual(record["properties"]["sourceFeatureId"], feature["id"])
            self.assertEqual(record["properties"]["sourceId"], "0")
            polygon = shape(record["geometry"])
            self.assertEqual(list(polygon.bounds), bbox)
            self.assertFalse(polygon.covers(Point(origin["lon"], origin["lat"])))
            cell["url"] = "../outside.json"
            (path / "index.json").write_text(json.dumps(index))
            with self.assertRaises(ValueError):
                reconstruct.reference_from_street_tiles(path / "index.json", bbox, ["parking"])

    def test_road_raster_masks_match_georeferenced_references(self):
        import numpy as np
        from PIL import Image
        report = json.loads((ROOT / "dist/road-reconstruction-review.json").read_text())
        references = json.loads((ROOT / "dist" / report["reference"]["url"]).read_text())
        by_id = {f["properties"]["sourceFeatureId"]: f for f in references["features"]}
        for feature in report["features"]:
            def load(key):
                with Image.open(ROOT / "dist" / feature[key]) as image:
                    return np.asarray(image) > 0
            candidate, reference, approved = load("candidateMask"), load("referenceMask"), load("approvedMask")
            expected = reconstruct.polygons_to_mask(by_id[feature["sourceFeatureId"]]["geometry"],
                (report["imagery"]["width"], report["imagery"]["height"]), report["imagery"]["grid"])
            self.assertTrue(np.array_equal(reference, expected))
            self.assertEqual(int(candidate.sum()), feature["candidatePixels"])
            self.assertEqual(int(reference.sum()), feature["referencePixels"])
            self.assertTrue(np.array_equal(approved, candidate & reference if feature["accepted"] else np.zeros_like(reference)))

    def test_prompt_uses_interior_pixel_not_centroid_of_hollow_polygon(self):
        import numpy as np
        mask = np.ones((32, 32), dtype=bool)
        mask[10:22, 10:22] = False
        prompt = reconstruct.prompts_for_mask(mask)
        x, y = prompt["point"]
        self.assertTrue(mask[y, x])
        self.assertEqual(prompt["box"], [0, 0, 31, 31])
        self.assertIsNone(reconstruct.prompts_for_mask(np.zeros((4, 4), dtype=bool)))


if __name__ == "__main__":
    unittest.main()
