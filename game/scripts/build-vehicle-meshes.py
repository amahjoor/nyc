"""Bake licensed exterior panels into small, local, paintable glTF traffic models."""

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import tempfile
from urllib.request import urlopen
from zipfile import ZipFile

import fast_simplification
import numpy as np
from scipy.spatial import cKDTree
import trimesh


ROOT = Path(__file__).resolve().parents[1]
RECIPES = ROOT / "data/vehicle-models.json"
# Triangle ceilings per surface. The tire geometry supplies the axle locations.
BUDGET = {"paint": 3200, "glass": 800, "trim": 1400, "chrome": 650, "headlamp": 350, "taillamp": 350}
COLORS = {"paint": [1, 1, 1], "glass": [.07, .105, .13], "trim": [.025, .028, .03],
          "chrome": [.54, .57, .6], "headlamp": [1, .84, .59], "taillamp": [.56, .045, .028]}
CHANGES = "Selected and simplified exterior panels, adapted paint, glazing and lamps, and fitted animated game wheels."


def source_file(entry, cache):
    path = cache / Path(entry["download"]).name
    def verified(file):
        with file.open("rb") as source:
            return hashlib.file_digest(source, "sha256").hexdigest() == entry["sha256"]
    if path.exists() and verified(path):
        return path
    with tempfile.TemporaryDirectory(dir=cache) as tmp:
        partial = Path(tmp) / path.name
        with urlopen(entry["download"], timeout=180) as response, partial.open("wb") as out:
            shutil.copyfileobj(response, out)
        if not verified(partial):
            raise ValueError(f"Source hash differs for {path.name}")
        partial.replace(path)
    return path


def triangles(quad):
    points = list(dict.fromkeys(quad))
    return [(points[0], points[i], points[i + 1]) for i in range(1, len(points) - 1)]


def finite_elements(path, entry, roles):
    # LS-DYNA shells are quads or triangles. Keep only the boundary faces of
    # solid parts such as lamp lenses. Node numbering and section order vary.
    surfaces, boundaries = defaultdict(list), {}
    with ZipFile(path) as archive, tempfile.TemporaryFile() as source:
        with archive.open(entry["keywordFile"]) as member:
            shutil.copyfileobj(member, source)
        source.seek(0)
        section = b""
        for line in source:
            if line.startswith(b"*"):
                section = line.strip()
            elif section in (b"*ELEMENT_SHELL", b"*ELEMENT_SOLID") and not line.startswith(b"$") and line.strip():
                role = roles.get(int(line[8:16]))
                if role is None:
                    continue
                nodes = [int(line[i:i+8]) for i in range(16, 48 if section == b"*ELEMENT_SHELL" else 80, 8)]
                if section == b"*ELEMENT_SHELL":
                    surfaces[role].extend(triangles(nodes))
                else:
                    for face in ((0,3,2,1), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)):
                        quad = tuple(nodes[i] for i in face)
                        key = (role, tuple(sorted(set(quad))))
                        if key in boundaries:
                            del boundaries[key]
                        else:
                            boundaries[key] = quad
        for (role, _), quad in boundaries.items():
            surfaces[role].extend(triangles(quad))
        wanted = {i for faces in surfaces.values() for triangle in faces for i in triangle}
        coordinates = {}
        source.seek(0)
        for line in source:
            if line.startswith(b"*"):
                section = line.strip()
            elif section == b"*NODE" and not line.startswith(b"$") and line.strip():
                index = int(line[:8])
                if index in wanted:
                    coordinates[index] = [float(line[i:i+16]) for i in (8, 24, 40)]
    for role, faces in surfaces.items():
        ids, inverse = np.unique(faces, return_inverse=True)
        yield role, np.array([coordinates[i] for i in ids]), inverse.reshape(-1, 3)


def oriented(vertices, axes):
    return np.column_stack([np.sign(a) * vertices[:, abs(a)-1] for a in axes])


def scan_panels(mesh, vertices, faces, entry):
    # Light-coloured scans have one texture atlas. The ranges in each recipe
    # locate the glazing and lamps in that scan's metre-scale coordinates.
    # Sampling the original texels distinguishes a light from nearby trim.
    wheel, mask = entry["scanWheels"], entry["scanFinish"]
    centers = vertices[faces].mean(axis=1)
    x, y, z = centers.T
    rgb = trimesh.visual.color.uv_to_color(mesh.visual.uv[faces].mean(axis=1),
                                           mesh.visual.material.baseColorTexture)[:, :3].astype(float)
    luma = rgb.mean(axis=1)
    triangles = vertices[faces]
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    upward = abs(normals[:, 1]) / np.maximum(np.linalg.norm(normals, axis=1), 1e-12)
    surface = np.where((luma > mask["paintMin"]) | ((upward > .80) & (y > .75)), "paint", "trim")
    back, front, sill, roof, shade = mask["glass"]
    glass = (z > back) & (z < front) & (y > sill) & (y < roof) & (luma < shade) & (upward < .87)
    surface = np.where(glass, "glass", surface)
    z_max, x_min, low, high = mask["taillamp"]
    rear = (z < z_max) & (abs(x) > x_min) & (y > low) & (y < high)
    surface = np.where(rear & (rgb[:, 0] > rgb[:, 2] * 1.16), "taillamp", surface)
    z_min, x_min, low, high, slope, bright = mask["headlamp"]
    front = (z > z_min) & (abs(x) > x_min) & (y > low) & (y < high + slope * (abs(x) - x_min))
    surface = np.where(front & (luma > bright), "headlamp", surface)
    tire = (abs(x) > .62) & (np.minimum(abs(z-wheel["front"]), abs(z-wheel["rear"])) ** 2
                              + (y-wheel["radius"]) ** 2 < (wheel["radius"] + .018) ** 2)
    colors = trimesh.visual.color.uv_to_color(mesh.visual.uv, mesh.visual.material.baseColorTexture)
    for role in np.unique(surface):
        keep = faces[(surface == role) & ~tire]
        if len(keep):
            yield role, vertices, keep, colors


def gltf_panels(path, entry, roles):
    scene = trimesh.load(path, force="scene", process=False)
    for node in sorted(scene.graph.nodes_geometry):
        matrix, name = scene.graph[node]
        mesh = scene.geometry[name]
        if not isinstance(mesh, trimesh.Trimesh):
            continue
        vertices = trimesh.transform_points(mesh.vertices, matrix)
        faces = mesh.faces if np.linalg.det(matrix[:3, :3]) >= 0 else mesh.faces[:, ::-1]
        if "axes" in entry:
            vertices = oriented(vertices, entry["axes"])
        if "scanWheels" in entry:
            yield from scan_panels(mesh, vertices, faces, entry)
        else:
            material = mesh.visual.material.name
            role = entry.get("nodeRoles", {}).get(node, roles.get(material))
            if not role or (role != "tire" and re.search(entry.get("skipNodes", r"(?!)"), node)):
                continue
            # Some authors use one transparent material for cabin glass and
            # lamp covers. Classify each connected pane in source coordinates.
            lens = entry.get("lensCovers", {}).get(material)
            if lens:
                glass = trimesh.Trimesh(vertices, faces, process=True)
                for piece in glass.split(only_watertight=False, repair=False):
                    lo, hi = piece.bounds[:, 2]
                    finish = "headlamp" if lo > lens[0] else "taillamp" if hi < lens[1] else role
                    yield finish, piece.vertices, piece.faces
            else:
                yield role, vertices, faces


def tire_fit(tires):
    # Each quadrant contains one tire, even for sources with all four in one mesh.
    middle = (tires.min(axis=0) + tires.max(axis=0)) / 2
    hubs, radii = [], []
    for left in (False, True):
        for front in (False, True):
            points = tires[((tires[:, 0] < middle[0]) == left) & ((tires[:, 2] > middle[2]) == front)]
            lo, hi = points.min(axis=0), points.max(axis=0)
            hubs.append((lo + hi) / 2)
            radii.append((hi[1] - lo[1]) / 2)
    hubs = np.array(hubs)
    return {"x": np.ptp(hubs[:, 0]) / 2, "front": hubs[[1,3], 2].mean(),
            "rear": hubs[[0,2], 2].mean(), "radius": np.mean(radii)}


def simplify_panel(mesh, limit):
    # Some authoring exports split a smooth surface into thousands of islands.
    # QEM preserves those boundaries. Weld close vertices if it stalls, then
    # simplify again using the original coordinates averaged within each cell.
    cell = .003
    while len(mesh.faces) > limit:
        points, faces = fast_simplification.simplify(np.asarray(mesh.vertices), np.asarray(mesh.faces),
                                                     target_count=limit, agg=5)
        mesh = trimesh.Trimesh(points, faces, process=True)
        if len(mesh.faces) > limit:
            _, groups = np.unique(np.rint(mesh.vertices / cell).astype(np.int32), axis=0, return_inverse=True)
            weights = np.bincount(groups)
            points = np.column_stack([np.bincount(groups, weights=axis) / weights for axis in mesh.vertices.T])
            mesh = trimesh.Trimesh(points, groups[mesh.faces], process=False)
            mesh.update_faces(mesh.nondegenerate_faces() & mesh.unique_faces())
            mesh.remove_unreferenced_vertices()
            cell *= 1.65
    return mesh


def clean(mesh):
    mesh.merge_vertices(merge_norm=True, merge_tex=True)
    mesh.update_faces(mesh.nondegenerate_faces() & mesh.unique_faces())
    mesh.remove_unreferenced_vertices()


def simplify_scan(groups):
    # Keep the scanned skin joined while reducing it. Collapsing paint and
    # glass independently opens cracks along their shared edges. Transfer
    # finishes back from the original surface after smoothing the scan noise.
    roles = list(groups)
    centers = np.vstack([mesh.triangles_center for mesh in groups.values()])
    source_normals = np.vstack([mesh.face_normals for mesh in groups.values()])
    labels = np.repeat(np.arange(len(roles)), [len(mesh.faces) for mesh in groups.values()])
    measured = np.vstack([mesh.visual.vertex_colors[mesh.faces, :3].mean(axis=1) for mesh in groups.values()]) / 255
    source = trimesh.util.concatenate(list(groups.values()))
    clean(source)
    # Retain samples across flat surfaces, too. A curvature-only reduction
    # can represent an entire hood with one triangle crossing both headlights.
    cell = .050
    while True:
        _, cells = np.unique(np.rint(source.vertices / cell).astype(np.int32), axis=0, return_inverse=True)
        weights = np.bincount(cells)
        points = np.column_stack([np.bincount(cells, weights=axis) / weights for axis in source.vertices.T])
        skin = trimesh.Trimesh(points, cells[source.faces], process=False)
        clean(skin)
        if len(skin.faces) <= 14000:
            break
        cell *= 1.08
    tree = cKDTree(centers)
    nearby = labels[tree.query(skin.triangles_center, k=7)[1]]
    votes = np.stack([(nearby == i).sum(axis=1) for i in range(len(roles))])
    face_roles = np.asarray(roles)[votes.argmax(axis=0)]
    # Preserve the photographed grille, mouldings and window boundaries.
    # Smooth point samples carry the measured variation over the low-poly skin.
    distances, ids = tree.query(skin.vertices, k=12)
    weights = 1 / np.maximum(distances, .007)
    weights /= weights.sum(axis=1, keepdims=True)
    rgb = np.einsum("ij,ijk->ik", weights, measured[ids])
    # Average the source normals without displacing the outer panels.
    normals = np.einsum("ij,ijk->ik", weights, source_normals[ids])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    fractions = {role: (weights * (labels[ids] == i)).sum(axis=1) for i, role in enumerate(roles)}
    paint = fractions.get("paint", 0)
    glass = fractions.get("glass", 0)
    # Source scans are light silver or white. Keep their lightness variations
    # while replacing the painted surfaces with the simulated paint colour.
    luminance = rgb @ np.array([.2126, .7152, .0722])
    grey = np.clip((luminance / .67) ** 1.65, .022, 1)
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    tone = grey[:, None] * paint[:, None] + linear * ((1 - paint) * (1 - .75 * glass))[:, None]
    finish = np.column_stack([.60 - .23 * paint - .40 * glass, .08 + .14 * paint + .17 * glass, paint + glass, paint])
    panels = {}
    for role in ("paint", "headlamp", "taillamp"):
        is_lens = np.isin(face_roles, ["headlamp", "taillamp"])
        faces = skin.faces[~is_lens if role == "paint" else face_roles == role]
        if len(faces):
            points, local = np.unique(faces, return_inverse=True)
            panel = trimesh.Trimesh(skin.vertices[points], local.reshape(-1, 3),
                                    vertex_normals=normals[points], process=False)
            panel.metadata["tone"] = tone[points] if role == "paint" else np.clip(rgb[points] ** 2.2, .08, 1)
            panel.metadata["finish"] = finish[points]
            panels[role] = panel
    return panels


def bake(path, entry):
    roles = {name: role for role, names in entry["materials"].items() for name in names}
    finite = "keywordFile" in entry
    panels = finite_elements(path, entry, roles) if finite else gltf_panels(path, entry, roles)
    groups = defaultdict(list)
    for role, points, faces, *colors in panels:
        if finite:
            points = oriented(points, entry["axes"])
        part = trimesh.Trimesh(points, faces, process=False, vertex_colors=colors[0] if colors else None)
        part.remove_unreferenced_vertices()
        groups[role].append(part)
    tires = groups.pop("tire", [])
    groups = {role: trimesh.util.concatenate(parts) for role, parts in groups.items()}
    bounds = np.array([mesh.bounds for mesh in groups.values()])
    low, high = bounds[:, 0].min(axis=0), bounds[:, 1].max(axis=0)
    floor = min(part.bounds[0, 1] for part in tires) if tires else 0
    origin = np.array([(low[0] + high[0]) / 2, floor, (low[2] + high[2]) / 2])
    scale = entry["scale"] if finite else entry["length"] / (high[2] - low[2])
    if tires:
        wheels = tire_fit((np.vstack([m.vertices for m in tires]) - origin) * scale)
    else:
        w = entry["scanWheels"]
        wheels = {"x": w["x"] * scale, "front": (w["front"] - origin[2]) * scale,
                  "rear": (w["rear"] - origin[2]) * scale, "radius": w["radius"] * scale}
    for mesh in groups.values():
        mesh.vertices = (mesh.vertices - origin) * scale
    wheels = {k: round(float(v), 4) for k, v in wheels.items()}
    if "scanWheels" in entry:
        return simplify_scan(groups), wheels
    baked = {}
    for role, mesh in groups.items():
        clean(mesh)
        mesh = simplify_panel(mesh, BUDGET[role])
        if finite:
            # Engineering shell normals may point into the cabin. The exterior
            # finish uses consistent outward winding on each selected panel.
            wrong = np.einsum("ij,ij->i", mesh.face_normals, mesh.triangles_center-[0, .65, 0]) < 0
            faces = mesh.faces.copy()
            faces[wrong] = faces[wrong, ::-1]
            mesh.faces = faces
        baked[role] = mesh
    return baked, wheels


def encode_glb(panels, entry):
    # One position/normal buffer pair shared by named material primitives. Any
    # glTF viewer can open it. The game combines the finish roles in two draws.
    blob, views, accessors, primitives, materials = bytearray(), [], [], [], []

    def accessor(array, component, kind, target, bounds=False):
        blob.extend(b'\0' * (-len(blob) % 4))
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": array.nbytes, "target": target})
        blob.extend(array.tobytes())
        acc = {"bufferView": len(views)-1, "componentType": component, "count": len(array), "type": kind}
        if bounds:
            acc.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        accessors.append(acc)
        return len(accessors)-1

    positions = np.vstack([m.vertices for m in panels.values()]).astype("<f4")
    normals = np.vstack([m.vertex_normals for m in panels.values()]).astype("<f4")
    if len(positions) >= 65536 or not np.isfinite(positions).all() or not np.isfinite(normals).all():
        raise ValueError(f"Invalid baked geometry for {entry['id']}")
    attrs = {"POSITION": accessor(positions, 5126, "VEC3", 34962, True),
             "NORMAL": accessor(normals, 5126, "VEC3", 34962)}
    if "scanWheels" in entry:
        # Standard glTF viewers display COLOR_0. The game also reads the finish
        # and tint weight for its shared paint and instancing shaders.
        attrs["COLOR_0"] = accessor(np.vstack([m.metadata["tone"] for m in panels.values()]).astype("<f4"), 5126, "VEC3", 34962)
        attrs["_SURFACE"] = accessor(np.vstack([m.metadata["finish"] for m in panels.values()]).astype("<f4"), 5126, "VEC4", 34962)
    base = 0
    for role, mesh in panels.items():
        indices = accessor((mesh.faces.flatten()+base).astype("<u2"), 5123, "SCALAR", 34963)
        primitives.append({"attributes": attrs, "indices": indices, "material": len(materials)})
        materials.append({"name": role, "pbrMetallicRoughness": {"baseColorFactor": COLORS[role]+[1],
                          "metallicFactor": .25, "roughnessFactor": .36}, "doubleSided": True})
        base += len(mesh.vertices)
    meta = {k: entry[k] for k in ("title", "author", "source", "license", "licenseUrl")}
    doc = {"asset": {"version": "2.0", "extras": {**meta, "changes": CHANGES}},
           "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
           "meshes": [{"name": entry["id"], "primitives": primitives}], "materials": materials,
           "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(blob)}]}
    header = json.dumps(doc, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(header) + len(blob)) +
            struct.pack("<I4s", len(header), b"JSON") + header +
            struct.pack("<I4s", len(blob), b"BIN\0") + blob)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True, help="directory for downloaded source models")
    parser.add_argument("--out", type=Path, default=ROOT/"dist/assets/vehicles")
    parser.add_argument("--only", metavar="MODEL_ID", help="build one exterior in an existing fleet")
    args = parser.parse_args()
    args.cache.mkdir(exist_ok=True, parents=True)
    args.out.mkdir(exist_ok=True, parents=True)
    recipes = json.loads(RECIPES.read_text())
    index = args.out / "index.json"
    previous = {}
    if args.only:
        if args.only not in {e["id"] for e in recipes}:
            parser.error(f"Unknown exterior {args.only}")
        if not index.exists():
            parser.error("Run the full build once before using --only")
        previous = {m["id"]: m for m in json.loads(index.read_text())["models"]}
    manifest = []
    with tempfile.TemporaryDirectory(dir=args.out) as tmp:
        staging = Path(tmp)
        for entry in recipes:
            file = entry["id"] + ".glb"
            if args.only and entry["id"] != args.only:
                if entry["id"] not in previous or not (args.out / file).exists():
                    parser.error(f"Missing built exterior {entry['id']}. Run a full build.")
                manifest.append(previous[entry["id"]])
                continue
            mesh, wheels = bake(source_file(entry, args.cache), entry)
            glb = encode_glb(mesh, entry)
            (staging / file).write_bytes(glb)
            row = {k: entry[k] for k in ("id", "make", "model", "shape", "years", "title", "author", "source", "license", "licenseUrl")}
            manifest.append({**row, "url": "./assets/vehicles/"+file, "wheels": wheels,
                             "triangles": sum(len(m.faces) for m in mesh.values()), "sha256": hashlib.sha256(glb).hexdigest()})
            print(entry["id"], wheels, manifest[-1]["triangles"], flush=True)
        summary = staging / "index.json"
        summary.write_text(json.dumps({"changes": CHANGES, "models": manifest}, indent=2)+"\n")
        for path in staging.glob("*.glb"):
            path.replace(args.out / path.name)
        summary.replace(index)
