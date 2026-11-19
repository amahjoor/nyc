"""Prepare e-sfera's Statue Of Liberty Low Poly GLB for the harbor and island views.

Run with Python (NumPy, Pillow) and gltfpack 1.3 on PATH. Pass the original
Objaverse GLB as the sole argument. Its attribution is also embedded in both LODs.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'dist' / 'liberty-island'
SOURCE_SHA256 = 'e6c9103c6ec878523267c37a259398bdc41974be1fef39e15722b71e16d3446f'
SOURCE_PEDESTAL = 42.16
PEDESTAL = 43.218
HEIGHT = 46.657


def prepare(source, work):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError('Expected the e899267a0951468aaa868e5daf22c290 Objaverse GLB')
    size, = struct.unpack_from('<I', raw, 12)
    doc = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]

    def view(i):
        v = doc['bufferViews'][i]
        start = v.get('byteOffset', 0)
        return binary[start:start + v['byteLength']]

    def attribute(i):
        a = doc['accessors'][i]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dtype = {5126: '<f4', 5125: '<u4'}[a['componentType']]
        return np.frombuffer(view(a['bufferView']), dtype, a['count'] * width,
                             offset=a.get('byteOffset', 0)).reshape(-1, width)

    prim = doc['meshes'][0]['primitives'][0]
    attrs = prim['attributes']
    # Apply the source node's half-turn about X and convert centimetres to metres.
    p = attribute(attrs['POSITION']) * [.01, -.01, -.01]
    p[:, 2] += 2.08  # centre of the square pedestal cap
    y = p[:, 1].copy()
    figure_scale = HEIGHT / (y.max() - SOURCE_PEDESTAL)
    base_scale = PEDESTAL / SOURCE_PEDESTAL
    p[:, 1] = np.where(y < SOURCE_PEDESTAL, y * base_scale,
                       PEDESTAL + (y - SOURCE_PEDESTAL) * figure_scale)
    # Extend the bottom course into the sloping DEM at the fort's outer points.
    p[y < .1, 1] = -2.5
    normals = attribute(attrs['NORMAL']) * [1, -1, -1]
    normals[:, 1] /= np.where(y < SOURCE_PEDESTAL, base_scale, figure_scale)
    normals /= np.maximum(1e-8, np.linalg.norm(normals, axis=1, keepdims=True))
    uv = attribute(attrs['TEXCOORD_0'])
    faces = attribute(prim['indices']).reshape(-1, 3)
    face_height = y[faces].mean(axis=1)
    layers = [face_height < SOURCE_PEDESTAL,
              (face_height >= SOURCE_PEDESTAL) & (face_height < 89.38),
              face_height >= 89.38]
    diffuse, normal = [Image.open(io.BytesIO(view(doc['images'][i]['bufferView']))).convert('RGB')
                       for i in (0, 2)]
    diffuse.save(work / 'copper-stone.jpg', quality=93, subsampling=0)
    normal.save(work / 'relief.jpg', quality=95, subsampling=0)
    # Bake the atlas into the distant mesh so the city view needs no textures.
    sample = np.asarray(diffuse.resize((256, 256), Image.Resampling.LANCZOS))
    s = sample[(uv[:, 1] * 256).astype(int), (uv[:, 0] * 256).astype(int)] / 255
    colors = np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4)

    for detail in ('harbor', 'island'):
        gltf = {'asset': {'version': '2.0', 'extras': doc['asset']['extras']},
                'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
                'meshes': [{'primitives': []}], 'materials': [],
                'accessors': [], 'bufferViews': [], 'buffers': []}
        blob = bytearray()

        def add(array, dtype, shape, component):
            blob.extend(b'\0' * (-len(blob) % 4))
            offset = len(blob)
            blob.extend(np.asarray(array, dtype=dtype).tobytes())
            idx = len(gltf['accessors'])
            gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob) - offset})
            acc = {'bufferView': idx, 'componentType': component, 'count': len(array), 'type': shape}
            if idx == 0:
                acc.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
            gltf['accessors'].append(acc)
            return idx

        layout = {'POSITION': add(p, '<f4', 'VEC3', 5126), 'NORMAL': add(normals, '<f4', 'VEC3', 5126)}
        textured = detail == 'island'
        if textured:
            layout['TEXCOORD_0'] = add(uv, '<f4', 'VEC2', 5126)
            gltf['images'] = [{'uri': name} for name in ('copper-stone.jpg', 'relief.jpg')]
            gltf['textures'] = [{'source': i} for i in range(2)]
        else:
            layout['COLOR_0'] = add(colors, '<f4', 'VEC3', 5126)
        finishes = [('Granite', .02, .93), ('Copper', .14, .77), ('Gold', .64, .30)]
        for i, ((name, metal, rough), mask) in enumerate(zip(finishes, layers)):
            pbr = {'metallicFactor': metal, 'roughnessFactor': rough}
            material = {'name': name, 'pbrMetallicRoughness': pbr}
            if textured:
                pbr['baseColorTexture'] = {'index': 0}
                material['normalTexture'] = {'index': 1, 'scale': .85}
            gltf['materials'].append(material)
            indices = add(faces[mask].reshape(-1), '<u4', 'SCALAR', 5125)
            gltf['meshes'][0]['primitives'].append({'attributes': layout, 'indices': indices, 'material': i})
        gltf['buffers'].append({'uri': 'mesh.bin', 'byteLength': len(blob)})
        (work / 'mesh.bin').write_bytes(blob)
        path = work / 'mesh.gltf'
        path.write_text(json.dumps(gltf))
        subprocess.run(['gltfpack', '-i', path, '-o', OUT / f'statue-{detail}.glb',
                        '-si', '0.55' if textured else '0.035', '-se', '0.002' if textured else '0.02',
                        '-sp', '-km', '-ke'], check=True)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as root:
        prepare(Path(sys.argv[1]), Path(root))
