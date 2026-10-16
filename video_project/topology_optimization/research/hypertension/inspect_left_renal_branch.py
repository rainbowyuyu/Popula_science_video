"""Read-only GLB source-part localization for the V5 anatomical camera bridge."""
from pathlib import Path
import json
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'public/hypertension/models/human-atlas-hypertension.glb'
blob = MODEL.read_bytes()
magic, version, total = struct.unpack_from('<III', blob, 0)
assert magic == 0x46546c67 and version == 2 and total == len(blob)
chunks = {}
offset = 12
while offset < len(blob):
    length, kind = struct.unpack_from('<II', blob, offset)
    chunks[kind] = blob[offset + 8:offset + 8 + length]
    offset += 8 + length
gltf = json.loads(chunks[0x4e4f534a])
binary = chunks[0x004e4942]
node_index, node = next((i, n) for i, n in enumerate(gltf['nodes']) if n.get('name') == 'arteriesMesh')
parents = {child: i for i, n in enumerate(gltf['nodes']) for child in n.get('children', [])}
chain = []
i = node_index
while True:
    n = gltf['nodes'][i]
    transforms = {k: n[k] for k in ['matrix', 'translation', 'rotation', 'scale'] if k in n}
    chain.append({'index': i, 'name': n.get('name'), 'transforms': transforms})
    assert not transforms, f'Non-identity source transform requires application: {chain[-1]}'
    if i not in parents:
        break
    i = parents[i]
primitive = gltf['meshes'][node['mesh']]['primitives'][0]
accessor_index = primitive['attributes']['POSITION']
accessor = gltf['accessors'][accessor_index]
assert accessor['type'] == 'VEC3' and accessor['componentType'] == 5126
view = gltf['bufferViews'][accessor['bufferView']]
start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
positions = np.ndarray((accessor['count'], 3), dtype='<f4', buffer=binary,
                       offset=start, strides=(view.get('byteStride', 12), 4)).astype(float)
manifest = json.loads((ROOT / 'public/hypertension/models/asset-manifest.json').read_text(encoding='utf-8'))
body_bounds = np.array(manifest['groups']['bodySurface']['bounds'])
scale = 6.85 / (body_bounds[1, 1] - body_bounds[0, 1])
translation = np.array([0, -body_bounds[0, 1] * scale + .08, 0])

def dimensions(vertices):
    lower, upper = vertices.min(axis=0), vertices.max(axis=0)
    return {'bounds': [lower.tolist(), upper.tolist()], 'boxCenter': ((lower+upper)/2).tolist(),
            'vertexMean': vertices.mean(axis=0).tolist(), 'extent': (upper-lower).tolist()}

parts = []
for part in node['extras']['sourceParts']:
    if 'left renal artery' not in part['name'].lower():
        continue
    vertices = positions[part['firstVertex']:part['firstVertex']+part['vertexCount']]
    assert len(vertices) == part['vertexCount']
    parts.append({**part, 'atlasMeters': dimensions(vertices), 'world': dimensions(vertices*scale+translation)})
report = {
    'source': str(MODEL), 'sourceMetadata': 'nodes[arteriesMesh].extras.sourceParts',
    'coordinateDescription': 'Atlas meters: Y up, subject left +X, anterior +Z. World coordinates apply the exact World.ts body scaling and floor translation.',
    'nodeChain': chain, 'positionAccessor': accessor_index,
    'worldTransform': {'scale': scale, 'translation': translation.tolist()},
    'parts': parts,
    'notes': ['Source-part bounds and centers are exact vertex statistics; they are not a fitted vessel centerline.',
              'Use this gross renal artery for camera context and a bridge; it is not a microscopic arteriole.']
}
dest = ROOT / 'research/hypertension/left-renal-artery-source-v5.json'
dest.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'file': str(dest), 'scale': scale, 'translation': translation.tolist(),
                  'mainParts': [p for p in parts if p['id'] in ['FJ2046', 'FJ3476']]}))
