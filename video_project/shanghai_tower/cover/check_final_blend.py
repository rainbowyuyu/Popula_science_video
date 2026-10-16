"""Read-only verification of the cover's actual Blender source."""
import bpy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
blend = ROOT / 'model/shanghai-tower.blend'
manifest_path = ROOT / 'public/models/shanghai-tower-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
bpy.ops.wm.open_mainfile(filepath=str(blend))
mesh_objects = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
expected = {p['mesh_name']: p for p in manifest['parts']}
missing = sorted(set(expected) - set(mesh_objects))
extra = sorted(set(mesh_objects) - set(expected))
topology_mismatches = []
for name in sorted(set(expected) & set(mesh_objects)):
    obj = mesh_objects[name]
    part = expected[name]
    if len(obj.data.vertices) != part['vertices'] or len(obj.data.polygons) != part['polygons']:
        topology_mismatches.append({
            'name': name,
            'actual': [len(obj.data.vertices), len(obj.data.polygons)],
            'manifest': [part['vertices'], part['polygons']],
        })
report = {
    'actualBlendMeshCount': len(mesh_objects),
    'manifestPartCount': len(manifest['parts']),
    'missingMeshNames': missing,
    'extraMeshNames': extra,
    'topologyMismatches': topology_mismatches,
    'passed': len(mesh_objects) == len(manifest['parts']) == 987 and not missing and not extra and not topology_mismatches,
    'sourceBlend': {
        'path': 'model/shanghai-tower.blend',
        'sha256': hashlib.sha256(blend.read_bytes()).hexdigest(),
    },
    'sourceManifest': {
        'path': 'public/models/shanghai-tower-manifest.json',
        'sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    },
    'method': 'Opened the actual .blend without saving; matched every mesh object name and vertex/polygon count to the production manifest.',
}
(ROOT / 'cover/final-source-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
if not report['passed']:
    raise RuntimeError('Actual Blender source does not match the 987-part production manifest')
