#!/usr/bin/env python3
"""Index the official citywide I3S hierarchy without downloading city geometry.

NYC hosts the 2014 surveyed building surfaces as spatially tiled I3S 1.8.
Only metadata is bundled; geometry is streamed from the public service.
Run with --cache /tmp/nyc-3d to reuse previously downloaded node pages.
"""

import argparse
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SERVICE = "https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0"
ORIGIN = {"lat": 40.7235, "lon": -74.0015}


def read_page(page, cache):
    path = cache / f"nodepage-{page}.json"
    if not path.exists():
        temporary = path.with_suffix(".download")
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--compressed",
                        "--retry", "2", "--max-time", "40", f"{SERVICE}/nodepages/{page}",
                        "--output", str(temporary)], check=True)
        temporary.replace(path)
    result = json.loads(path.read_bytes())
    if "nodes" not in result:
        raise ValueError(f"Invalid scene index page {page}: {result}")
    return result["nodes"]


def build(cache):
    cache.mkdir(parents=True, exist_ok=True)
    pages, nodes, pending = {}, {}, [0]
    while pending:
        page = pending.pop()
        if page in pages:
            continue
        page_nodes = read_page(page, cache)
        pages[page] = page_nodes
        for node in page_nodes:
            nodes[node["index"]] = node
            pending.extend(child // 64 for child in node.get("children", []) if child // 64 not in pages)
    output = []
    for key in sorted(nodes):
        node = nodes[key]
        center, half = node["obb"]["center"], node["obb"]["halfSize"]
        geometry = node.get("mesh", {}).get("geometry", {})
        x = 6371008.8 * math.radians(center[0] - ORIGIN["lon"]) * math.cos(math.radians(ORIGIN["lat"]))
        z = -6371008.8 * math.radians(center[1] - ORIGIN["lat"])
        output.append({"id": key, "resource": geometry.get("resource"), "center": center,
                       "x": round(x, 3), "z": round(z, 3), "radius": round(math.hypot(*half), 3),
                       "children": node.get("children", []), "parent": node.get("parentIndex"),
                       "vertices": geometry.get("vertexCount", 0),
                       "buildings": geometry.get("featureCount", 0),
                       "lodThreshold": node.get("lodThreshold", 0)})
    leaves = [node for node in output if not node["children"] and node["resource"] is not None]
    return {"version": 1, "source": {"title": "NYC OTI 3D Buildings Citywide", "surveyYear": 2014,
            "service": SERVICE, "itemUrl": "https://www.arcgis.com/home/item.html?id=a6961bc4505c44e8a495b53483491cc0",
            "attribution": "City of New York, OTI: 2014 surveyed 3D building geometry.",
            "termsUrl": "https://cityofnewyork.github.io/opendatatsm/publicpolicies.html",
            "modifications": "Spatial metadata indexed; I3S triangle surfaces streamed and projected into local meters. Ground height is flattened separately per feature for driving.",
            "limitations": "Historical untextured building survey; coarse levels simplify surveyed surfaces. Terrain elevation is flattened for gameplay."},
            "origin": ORIGIN, "bbox": [-74.257062, 40.498293, -73.699272, 40.915087],
            "root": 0, "roots": nodes[0]["children"], "nodes": output,
            "stats": {"nodes": len(output), "leafChunks": len(leaves),
                      "buildingFeatures": sum(node["buildings"] for node in leaves),
                      "leafTriangles": sum(node["vertices"] // 3 for node in leaves)}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/nyc-3d"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist/city-index.json")
    args = parser.parse_args()
    result = build(args.cache)
    args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps({**result["stats"], "bytes": args.output.stat().st_size}))
