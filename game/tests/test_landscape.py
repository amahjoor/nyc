"""Measured-world import contracts, independent of external data services."""

import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("landscape_import", ROOT / "scripts/import-landscape.py")
landscape = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(landscape)


class LandscapeImportTests(unittest.TestCase):
    def test_projection_roundtrips_all_boroughs_and_north_is_negative_z(self):
        for point in [(-74.0015, 40.7235), (-73.976, 40.766), (-74.17, 40.58), (-73.78, 40.73), (-73.87, 40.86)]:
            actual = landscape.unproject(*landscape.project(*point))
            self.assertAlmostEqual(actual[0], point[0], places=10)
            self.assertAlmostEqual(actual[1], point[1], places=10)
        self.assertLess(landscape.project(-74.0015, 40.8)[1], 0)
        self.assertEqual(landscape.project(-74.0015, 40.7235), [0, 0])

    def test_invalid_and_outside_nyc_bounds_are_rejected(self):
        for bbox in [[-73, 40, -74, 41], [-74.5, 40.5, -74, 40.8], [0, 0, 1, 1], [math.nan, 1, 2, 3], [True, 1, 2, 3]]:
            with self.assertRaises(ValueError):
                landscape.validate_bbox(bbox)

    def test_region_slug_cannot_escape_asset_or_source_directory(self):
        for value in ["../secret", "a/b", "A", "", "x.json", None, "x\\y"]:
            with self.assertRaises(ValueError):
                landscape.validate_region_id(value)
        self.assertEqual(landscape.validate_region_id("central-park-south"), "central-park-south")

    def test_all_regions_cli_imports_every_borough_and_default_stays_pilot(self):
        with patch.object(landscape, "build") as build:
            landscape.main([])
            self.assertEqual(build.call_count, 1)
            self.assertEqual(build.call_args.args[3], "central-park-south")
        with patch.object(landscape, "build") as build:
            landscape.main(["--all-regions", "--download"])
            self.assertEqual(build.call_count, 5)
            self.assertEqual([call.args[3] for call in build.call_args_list], [region["id"] for region in landscape.REGIONS])
            self.assertTrue(all(call.args[5] for call in build.call_args_list))
            self.assertEqual(len({region["borough"] for region in landscape.REGIONS}), 5)

    def test_export_pixel_centers_match_mesh_boundary_nodes(self):
        bbox, width, height = landscape.PILOT_BBOX, 257, 257
        query = landscape.export_query(bbox, width, height)
        w, s, e, n = map(float, query["bbox"].split(","))
        dx, dy = (e - w) / width, (n - s) / height
        for actual, expected in zip([w + dx / 2, s + dy / 2, e - dx / 2, n - dy / 2], bbox):
            self.assertAlmostEqual(actual, expected, places=11)
        self.assertEqual(query["pixelType"], "F32")
        self.assertEqual(query["adjustAspectRatio"], "false")

    def test_sampler_is_bilinear_and_includes_east_south_edges(self):
        grid = {"bounds": {"minX": 0, "maxX": 10, "minZ": 0, "maxZ": 10}, "width": 2, "height": 2,
                "heights": [10, 20, 30, 40]}
        self.assertEqual(landscape.sample_height(grid, 0, 0), 10)
        self.assertEqual(landscape.sample_height(grid, 10, 10), 40)
        self.assertEqual(landscape.sample_height(grid, 5, 5), 25)
        self.assertIsNone(landscape.sample_height(grid, 11, 5))
        grid["heights"][0] = None
        self.assertIsNone(landscape.sample_height(grid, 5, 5))
        self.assertEqual(landscape.sample_height(grid, 10, 10), 40)

    def test_nonfinite_data_cannot_be_written_as_json(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                landscape.compact_write(Path(directory) / "bad.json", {"height": math.nan})

    def test_canopy_units_nodata_and_short_vegetation_are_not_misclassified(self):
        heights = landscape.canopy_height_statistics([20, 100, 200, 600, 65535, 0, -1, math.nan])
        self.assertEqual(heights["maxHeight"], 60)
        self.assertEqual(heights["meanHeight"], 23)
        self.assertEqual(heights["heightSamples"], 4)
        self.assertEqual(heights["p10Height"], 4.4)
        self.assertIsNone(landscape.canopy_height_statistics([20, 25, 49]))
        self.assertIsNone(landscape.canopy_height_statistics([200, 65535]))
        self.assertIsNone(landscape.canopy_height_statistics([math.inf, 700, 0]))

    def test_shipped_grids_and_crowns_keep_measured_provenance(self):
        manifest_path = ROOT / "dist/landscape-index.json"
        if not manifest_path.exists():
            self.skipTest("Landscape import has not run")
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["origin"], landscape.ORIGIN)
        self.assertEqual(manifest["regions"][0]["id"], "central-park-south")
        self.assertEqual(len({region["borough"] for region in manifest["regions"]}), 5)
        for region in manifest["regions"]:
            grid = json.loads((ROOT / "dist" / region["terrainUrl"]).read_text())
            features = json.loads((ROOT / "dist" / region["featuresUrl"]).read_text())
            self.assertEqual(len(grid["heights"]), grid["width"] * grid["height"])
            self.assertEqual(grid["sourceId"], "nyc-dem-2017")
            self.assertTrue(all(value is None or -100 < value < 300 for value in grid["heights"]))
            self.assertGreater(len(features["canopies"]), 0)
            ids = set()
            for crown in features["canopies"]:
                self.assertNotIn(crown["id"], ids)
                ids.add(crown["id"])
                self.assertTrue(2 <= crown["p10Height"] <= crown["maxHeight"] <= 60)
                self.assertGreaterEqual(crown["maxHeight"], 5)
                self.assertTrue(2 <= crown["meanHeight"] <= crown["maxHeight"])
                self.assertIn(crown["sourceId"], manifest["sources"])
                self.assertGreaterEqual(len(crown["polygon"]), 3)
                self.assertTrue(crown["individualTree"])
            for water in features["water"]:
                if water["elevation"] is not None:
                    self.assertGreaterEqual(water["elevationSamples"], 3)
                self.assertIn(water["featureCode"], [2600, 2610])


try:
    import numpy as np
    import rasterio
    from rasterio.transform import from_bounds
    from shapely.geometry import Polygon, mapping
    GEO_AVAILABLE = True
except ImportError:
    GEO_AVAILABLE = False


@unittest.skipUnless(GEO_AVAILABLE, "Install rasterio, numpy and shapely in the survey venv")
class LandscapeGeometryTests(unittest.TestCase):
    def test_preview_point_moves_to_dry_shore_without_leaving_measured_grid(self):
        grid = {"bounds": {"minX": 0, "maxX": 100, "minZ": 0, "maxZ": 100}, "width": 2, "height": 2, "heights": [10] * 4}
        water = [{"polygon": [[30, 30], [70, 30], [70, 70], [30, 70]], "holes": []}]
        view = landscape.choose_land_view(grid, water, [50, 50])
        from shapely.geometry import Point
        self.assertFalse(Polygon(water[0]["polygon"]).buffer(6).covers(Point(view["x"], view["z"])))
        self.assertIsNotNone(landscape.sample_height(grid, view["x"], view["z"]))
        self.assertEqual(landscape.choose_land_view(grid, water, [10, 10]), {"x": 10, "z": 10, "heading": 0})

    def test_water_holes_are_preserved_and_bathymetry_is_not_a_lake(self):
        box = [-74.002, 40.723, -74.001, 40.724]
        outer = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]]
        hole = [[-74.0017, 40.7233], [-74.0013, 40.7233], [-74.0013, 40.7237], [-74.0017, 40.7237], [-74.0017, 40.7233]]
        geom = mapping(Polygon(outer, [hole]))
        row = {"row_id": "source-pond", "source_id": "1", "feat_code": "2610", "the_geom": geom}
        grid = {"bounds": landscape.local_bounds(box), "width": 11, "height": 11, "heights": [8] * 121}
        result = landscape.water_features([row, {**row, "feat_code": "2660"}], grid, box)
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]["holes"]), 1)
        self.assertEqual(result[0]["elevation"], 8)
        grid["heights"] = [float(i) for i in range(121)]
        self.assertIsNone(landscape.water_features([row], grid, box)[0]["elevation"])

    def test_decode_rejects_half_pixel_georeferencing_errors(self):
        bbox = landscape.PILOT_BBOX
        query = landscape.export_query(bbox, 3, 3)
        expanded = list(map(float, query["bbox"].split(",")))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dem.tif"
            for extent, accepted in [(expanded, True), (bbox, False)]:
                with rasterio.open(path, "w", driver="GTiff", width=3, height=3, count=1, dtype="float32", crs="EPSG:4326",
                                   transform=from_bounds(*extent, 3, 3)) as raster:
                    raster.write(np.arange(9, dtype="float32").reshape((3, 3)) + 10, 1)
                if accepted:
                    grid = landscape.decode_terrain(path, bbox, 3, 3)
                    self.assertEqual(grid["heights"], list(range(10, 19)))
                else:
                    with self.assertRaisesRegex(ValueError, "pixel centers"):
                        landscape.decode_terrain(path, bbox, 3, 3)


if __name__ == "__main__":
    unittest.main()
