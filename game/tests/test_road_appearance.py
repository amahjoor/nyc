"""Regression checks for the source-image appearance pilot, without model downloads."""

import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("road_appearance", ROOT / "scripts/reconstruct-road-appearance.py")
appearance = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(appearance)

try:
    import numpy as np
    from PIL import Image
    from scipy import ndimage
    from shapely.geometry import Polygon, shape
    from shapely import transform
    AVAILABLE = True
except ImportError:
    AVAILABLE = False


class AppearanceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "dist/road-pilot-appearance.json").read_text())

    def test_image_reference_and_model_are_pinned(self):
        data = self.data
        self.assertEqual(data["imagery"]["sha256"], appearance.digest(ROOT / "dist/road-reconstruction/aerial.png"))
        self.assertEqual(data["reference"]["sha256"], appearance.digest(ROOT / "dist/road-reconstruction/reference.geojson"))
        self.assertEqual(data["model"]["revision"], appearance.source.REVISION)
        self.assertEqual(data["model"]["weightsSha256"], appearance.source.WEIGHTS_SHA256)
        self.assertFalse(data["model"]["weightsBundled"])
        self.assertEqual(data["review"]["candidatesFileSha256"],
                         appearance.digest(ROOT / "dist/road-pilot-vision/paint-candidates.json"))

    def test_a_changed_candidate_set_cannot_reuse_visual_acceptances(self):
        records = json.loads((ROOT / "dist/road-pilot-vision/paint-candidates.json").read_text())
        accepted = appearance.review_paint(records, self.data["imagery"]["sha256"])
        self.assertGreater(len(accepted), 40)
        records[0]["coords"][0][0] += 1
        with self.assertRaisesRegex(ValueError, "visually review"):
            appearance.review_paint(records, self.data["imagery"]["sha256"])
        with self.assertRaisesRegex(ValueError, "visually review"):
            appearance.review_paint([], "different-photo")

    def test_rejected_bridge_seams_and_vehicle_reflections_never_render(self):
        candidates = {marking["evidence"]["candidateId"] for marking in self.data["markings"]}
        self.assertTrue(candidates.isdisjoint(appearance.PAINT_REJECTED))
        # These fixed candidates are photographed bridge seams or car edges,
        # not paint. A new detector requires a fresh image/candidate review.
        self.assertTrue({7, 9, 11, 12, 15, 16, 19, 24, 27, 28, 88}.isdisjoint(candidates))
        for marking in self.data["markings"]:
            self.assertEqual(marking["reviewStatus"], "accepted")
            self.assertIsNone(marking["evidence"]["predictedIou"])

    def test_inference_gates_and_counts_are_honest(self):
        data = self.data
        accepted = [record for record in data["occluders"] if record["accepted"]]
        self.assertEqual(data["summary"]["vehicleCandidates"], len(data["occluders"]))
        self.assertEqual(data["summary"]["vehicleMasksAccepted"], len(accepted))
        self.assertGreater(len(accepted), 0)
        self.assertLess(len(accepted), len(data["occluders"]))
        for record in data["occluders"]:
            expected = record["predictedIou"] >= .75 and record["boxContainment"] >= .90 and 20 <= record["candidatePixels"] <= 1800
            self.assertEqual(record["accepted"], expected)
            self.assertTrue((ROOT / "dist" / record["mask"].removeprefix("./")).is_file())
        old_trial = json.loads((ROOT / "dist/road-reconstruction-review.json").read_text())
        self.assertEqual(old_trial["summary"]["accepted"], 0)
        self.assertEqual(old_trial["thresholds"]["sourcePrecision"], .85)

    def test_evidence_page_only_links_existing_local_artifacts(self):
        class Links(HTMLParser):
            def __init__(self):
                super().__init__()
                self.urls = []

            def handle_starttag(self, tag, attrs):
                for key, value in attrs:
                    if key in ("href", "src") and value and value.startswith("./"):
                        self.urls.append(value.split("#")[0])

        parser = Links()
        parser.feed((ROOT / "dist/road-pilot-review.html").read_text())
        self.assertGreater(len(parser.urls), 35)
        for url in parser.urls:
            self.assertTrue((ROOT / "dist" / url).exists(), url)


@unittest.skipUnless(AVAILABLE, "Install reconstruction dependencies in the isolated Python environment")
class AppearanceGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "dist/road-pilot-appearance.json").read_text())
        cls.references = json.loads((ROOT / "dist/road-reconstruction/reference.geojson").read_text())["features"]

    def test_bright_wide_vehicle_is_not_a_paint_candidate(self):
        rgb = np.full((100, 100, 3), 120, dtype=np.uint8)
        rgb[30:55, 20:22] = 215  # Observed thin line, roughly .45m wide.
        rgb[30:50, 60:70] = 235  # Car-like bright rectangle, too wide.
        pavement = np.zeros((100, 100), bool)
        pavement[10:90, 10:90] = True
        identities = np.where(pavement, 0, -1)
        candidates = appearance.discover_paint(rgb, pavement, identities)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["box"], [20, 30, 22, 55])

    def test_shadow_and_bright_vehicles_do_not_tint_source_material(self):
        rgb = np.full((80, 80, 3), [123, 121, 117], dtype=np.uint8)
        rgb[10:35, 10:35] = [30, 35, 40]  # Cast shadow, no semantic claim.
        rgb[45:60, 30:50] = [235, 235, 235]
        mask = np.zeros((80, 80), bool)
        mask[4:-4, 4:-4] = True
        exclusion = np.zeros(mask.shape, bool)
        exclusion[45:60, 30:50] = True
        sample, clean = appearance.clean_sample(rgb, mask, exclusion)
        self.assertEqual(sample["color"], "#7b7975")
        self.assertFalse(clean[20, 20])
        self.assertFalse(clean[50, 40])
        self.assertTrue(clean[50, 65])

    def test_generated_materials_and_markings_stay_on_surveyed_footprints(self):
        references = {feature["properties"]["sourceFeatureId"]: feature for feature in self.references}
        grid = self.data["imagery"]["grid"]
        for material in self.data["surfaces"]:
            feature = references[material["sourceFeatureId"]]
            self.assertNotEqual(str(feature["properties"].get("sourceSubcode")), "350020")
            self.assertGreaterEqual(material["sourceSample"]["cleanPixels"], 32)
        for marking in self.data["markings"]:
            feature = references[marking["sourceFeatureId"]]
            geometry = transform(shape(feature["geometry"]), lambda points: np.asarray([
                appearance.source.ortho.project(lon, lat) for lon, lat in points]))
            for polygon in marking["polygons"]:
                paint = Polygon(polygon["outer"], polygon["holes"])
                self.assertTrue(paint.is_valid)
                self.assertLess(paint.difference(geometry.buffer(.0002)).area, .0001)
            # Each piece has actual visible pixels, and its recorded pixel box
            # fits their extent. No interpolation fills a missing lane dash.
            points = np.asarray(marking["evidence"]["pixelCoordinates"])
            self.assertEqual(len(points), marking["evidence"]["pixelCount"])
            self.assertEqual([int(points[:, 0].min()), int(points[:, 1].min()),
                              int(points[:, 0].max() + 1), int(points[:, 1].max() + 1)], marking["evidence"]["pixelBox"])
            x, z = appearance.source.ortho.project(*appearance.source.pixel_to_lonlat(*points[0], grid))
            self.assertTrue(geometry.buffer(.35).covers(__import__("shapely").Point(x, z)))

    def test_samples_do_not_include_accepted_vehicle_masks(self):
        vehicle = np.asarray(Image.open(ROOT / "dist/road-pilot-vision/vehicle-exclusion.png")) > 0
        clean = np.asarray(Image.open(ROOT / "dist/road-pilot-vision/pavement-samples.png")) > 0
        reconstructed = np.zeros_like(vehicle)
        for record in self.data["occluders"]:
            mask = np.asarray(Image.open(ROOT / "dist" / record["mask"].removeprefix("./"))) > 0
            self.assertEqual(int(mask.sum()), record["candidatePixels"])
            left, top, right, bottom = record["crop"]
            x0, y0, x1, y1 = record["box"]
            containment = int(mask[y0 - top:y1 - top, x0 - left:x1 - left].sum()) / max(1, int(mask.sum()))
            self.assertAlmostEqual(containment, record["boxContainment"])
            if record["accepted"]:
                reconstructed[top:bottom, left:right] |= ndimage.binary_dilation(mask, iterations=2)
        np.testing.assert_array_equal(vehicle, reconstructed)
        self.assertFalse((vehicle & clean).any())
        self.assertEqual(int(clean.sum()), self.data["summary"]["materialSamplePixels"])
        self.assertEqual(int(vehicle.sum()), self.data["summary"]["vehicleExcludedPixels"])


if __name__ == "__main__":
    unittest.main()
