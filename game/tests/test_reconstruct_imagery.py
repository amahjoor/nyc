"""Validate AI review gates, georeferencing and source-constrained geometry."""

import hashlib
import importlib.util
import json
import math
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
