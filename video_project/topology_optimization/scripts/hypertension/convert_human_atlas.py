"""Create attributed video assets from Human Atlas / BodyParts3D 4.0.

Uses Python standard library; preserves source meter/Y-up coordinates. No
anatomical deformation or generative geometry is added by this conversion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT.parents[1] / 'human-atlas-audit' / 'ashemag-human-atlas-1c38bf3'
DEFAULT_OUT = ROOT / 'public' / 'hypertension' / 'models'
SOURCE_COMMIT = '1c38bf35c254a891200d3cedecfd57abebe83d8d'
ATTRIBUTION = 'BodyParts3D, © The Database Center for Life Science; CC BY 4.0. Human Atlas application © ashemag, MIT. Geometry adapted for rainbow鱼 educational video.'


def rgba(hexstr, alpha=1):
    return [int(hexstr[i:i+2], 16) / 255 for i in (0, 2, 4)] + [alpha]


MATERIALS = {
    'heartWall': ('b65452', 1, .4),
    'heartCavity': ('bd6367', 1, .46),
    'heartValve': ('dfbeb0', 1, .55),
    'arteries': ('bd4b48', 1, .42),
    'veins': ('517e9a', 1, .44),
    'kidney': ('a85852', 1, .43),
    'adrenal': ('d6ae73', 1, .5),
    'skin': ('d6c3ad', .14, .62),
    'bone': ('e1d5c4', .6, .65),
    'brain': ('c9aaa4', 1, .6),
    'liver': ('9e6554', 1, .52),
}


class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'rainbow-hypertension BodyParts3D converter', 'copyright': ATTRIBUTION},
                    'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [],
                    'materials': [], 'extras': {'source': 'https://github.com/ashemag/human-atlas', 'commit': SOURCE_COMMIT,
                                              'coordinateSystem': 'meters, Y-up, subject left +X, anterior +Z, soles near Y=0',
                                              'license': 'CC BY 4.0 for anatomy, MIT for application code'}}
        self.mat = {}
        for key, (color, alpha, rough) in MATERIALS.items():
            mat = {'name': key, 'pbrMetallicRoughness': {'baseColorFactor': rgba(color, alpha), 'metallicFactor': 0, 'roughnessFactor': rough}, 'doubleSided': True}
            if alpha < 1:
                mat['alphaMode'] = 'BLEND'
            self.mat[key] = len(self.doc['materials'])
            self.doc['materials'].append(mat)

    def accessor(self, raw, component, count, kind, target, bounds=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(raw), 'target': target})
        self.bin.extend(raw)
        acc = {'bufferView': view, 'componentType': component, 'count': count, 'type': kind}
        if bounds:
            acc.update({'min': bounds[0], 'max': bounds[1]})
        i = len(self.doc['accessors'])
        self.doc['accessors'].append(acc)
        return i

    def group(self, name, parent=None, extras=None):
        n = len(self.doc['nodes'])
        self.doc['nodes'].append({'name': name, 'children': [], 'extras': extras or {}})
        if parent is None:
            self.doc['scenes'][0]['nodes'].append(n)
        else:
            self.doc['nodes'][parent]['children'].append(n)
        return n

    def mesh(self, name, parts, chunks, mat, parent):
        if not parts:
            return
        positions = array('f')
        normals = array('f')
        indices = array('I')
        spans = []
        lo, hi = [math.inf]*3, [-math.inf]*3
        for p in parts:
            b = chunks[p['chunk']]
            pos = array('f'); pos.frombytes(b[p['positions']:p['positions']+p['vertexCount']*12])
            nor = array('h'); nor.frombytes(b[p['normals']:p['normals']+p['vertexCount']*6])
            ix = array('I'); ix.frombytes(b[p['indices']:p['indices']+p['indexCount']*4])
            base = len(positions)//3
            spans.append({'id': p['id'], 'name': p['name'], 'firstVertex': base, 'vertexCount': p['vertexCount'], 'firstIndex': len(indices), 'indexCount': p['indexCount']})
            positions.extend(pos)
            normals.extend(max(-1, n/32767) for n in nor)
            indices.extend(i+base for i in ix)
            for axis in range(3):
                lo[axis] = min(lo[axis], min(pos[axis::3]))
                hi[axis] = max(hi[axis], max(pos[axis::3]))
        pa = self.accessor(positions.tobytes(), 5126, len(positions)//3, 'VEC3', 34962, [lo, hi])
        na = self.accessor(normals.tobytes(), 5126, len(normals)//3, 'VEC3', 34962)
        ia = self.accessor(indices.tobytes(), 5125, len(indices), 'SCALAR', 34963)
        m = len(self.doc['meshes'])
        self.doc['meshes'].append({'name': name, 'primitives': [{'attributes': {'POSITION': pa, 'NORMAL': na}, 'indices': ia, 'material': self.mat[mat]}]})
        node = {'name': name, 'mesh': m, 'extras': {'bounds': [lo, hi], 'center': [(lo[i]+hi[i])/2 for i in range(3)], 'sourceParts': spans}}
        idx = len(self.doc['nodes']); self.doc['nodes'].append(node)
        self.doc['nodes'][parent]['children'].append(idx)

    def save(self, path):
        while len(self.bin)%4:
            self.bin.append(0)
        self.doc['buffers'] = [{'byteLength': len(self.bin)}]
        raw = json.dumps(self.doc, ensure_ascii=False, separators=(',', ':')).encode()
        raw += b' ' * (-len(raw)%4)
        glb = struct.pack('<4sII', b'glTF', 2, 12+8+len(raw)+8+len(self.bin)) + struct.pack('<I4s', len(raw), b'JSON') + raw + struct.pack('<I4s', len(self.bin), b'BIN\0') + self.bin
        path.write_bytes(glb)
        return {'file': path.name, 'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest(), 'meshCount': len(self.doc['meshes']), 'nodeNames': [n['name'] for n in self.doc['nodes']]}


def convert(source, out):
    out.mkdir(parents=True, exist_ok=True)
    modeldir = source / 'public' / 'models'
    atlas = json.loads((modeldir / 'atlas.json').read_text())
    parts = atlas['parts']; byid = {p['id']:p for p in parts}
    chunks = [(modeldir / Path(c['url']).name).read_bytes() for c in atlas['chunks']]
    heart = [p for p in parts if p['id'].startswith('FJ24') and int(p['id'][2:]) in range(2417,2440)]
    heartids = {p['id'] for p in heart}
    aortaids = {'FJ1931','FJ1932','FJ3411','FJ3413','FJ3427'}
    brainids = set(next(c['elements'] for c in atlas['concepts'] if c['id']=='FMA50801'))
    groups = {
        'heart': heart,
        'leftKidney': [byid['FJ3145']],
        'rightKidney': [byid['FJ3147']],
        'liver': [byid[f'FJ{i}'] for i in [2816,2818,2819,2820,2821,2822,2823,2824]],
        'adrenals': [byid['FJ3129'],byid['FJ3130']],
        # FJ3427 already covers the descending aorta; avoid rendering its
        # thoracic/abdominal subdivision surfaces over the whole mesh.
        'aorta': [p for p in parts if p['id'] in {'FJ3411','FJ3413','FJ3427'}],
        'arteries': [p for p in parts if p['system']=='arterial' and p['id'] not in aortaids],
        'veins': [p for p in parts if p['system']=='venous'],
        'bodySurface': [byid['FJ2810']],
        'thoraxSkeleton': [p for p in parts if p['system']=='skeletal' and any(x in p['name'].lower() for x in ['rib','sternum','thoracic vertebra'])],
        'brain': [p for p in parts if p['id'] in brainids],
    }
    mats = {'leftKidney':'kidney','rightKidney':'kidney','liver':'liver','adrenals':'adrenal','aorta':'arteries','arteries':'arteries','veins':'veins','bodySurface':'skin','thoraxSkeleton':'bone','brain':'brain'}
    def add(g, selected):
        root = g.group('humanAtlas')
        for name in selected:
            ps = groups[name]
            group = g.group(name, root, {'sourceIDs': [p['id'] for p in ps]})
            if name == 'heart':
                for p in ps:
                    mat = 'heartCavity' if 'Cavity' in p['name'] else 'heartWall' if ('Wall' in p['name'] or 'muscle' in p['name']) else 'heartValve'
                    g.mesh(p['id']+'_'+p['name'].replace(' ','_'), [p], chunks, mat, group)
            else:
                g.mesh(name+'Mesh', ps, chunks, mats[name], group)
        return g
    files=[]
    for filename, selected in [('human-atlas-hypertension.glb',list(groups)), ('heart.glb',['heart','aorta']), ('kidneys.glb',['leftKidney','rightKidney','adrenals']), ('circulation.glb',['aorta','arteries','veins','bodySurface'])]:
        files.append(add(Gltf(),selected).save(out/filename))
    summary = {}
    for name,ps in groups.items():
        lo=[min(p['bounds'][0][i] for p in ps) for i in range(3)];hi=[max(p['bounds'][1][i] for p in ps) for i in range(3)]
        summary[name] = {'parts':len(ps),'triangles':sum(p['indexCount']//3 for p in ps),'bounds':[lo,hi],'center':[(lo[i]+hi[i])/2 for i in range(3)],'sourceIDs':[p['id'] for p in ps]}
    manifest = {'sourceRepository':'https://github.com/ashemag/human-atlas','sourceCommit':SOURCE_COMMIT,'dataset':'BodyParts3D 4.0 adult male reference','attribution':ATTRIBUTION,
                'dataLicense':'https://creativecommons.org/licenses/by/4.0/','publication':'https://doi.org/10.1093/nar/gkn613',
                'coordinates':'meters, Y up, subject left +X, anterior +Z; same positions across all GLBs; no centering or scaling',
                'importantNotes':['Original atlas cardiac display group incorrectly includes cerebral ventricles. This heart selection explicitly excludes them.',
                                  'Static reference geometry only: animated beating, lumen remodeling, blood cells and physiological diagrams must be added as clearly described illustrative animations.',
                                  'Kidneys are gross-anatomy surface meshes: no nephron microgeometry, no pathological hypertension mesh, no simulation fields.',
                                  'Aorta uses ascending FJ3413, arch FJ3411, whole descending FJ3427. Overlapping subdivision surfaces FJ1931 and FJ1932 are omitted from both aorta and arterial groups.',
                                  'Heart cavities are distinct from walls and can be toggled independently. Do not treat cavity meshes as opaque solid tissue in exterior views.'],
                'groups':summary,'files':files}
    (out/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'ATTRIBUTION.md').write_text((source/'public'/'ATTRIBUTION.md').read_text(encoding='utf-8')+'\n\n## Video conversion\n\nSelected anatomy converted from human-atlas commit '+SOURCE_COMMIT+' to GLB by rainbow鱼. Binary geometry unpacked and grouped; anatomical coordinates preserved; materials restyled. Original atlas cardiac grouping was corrected to exclude cerebral ventricles. This conversion adds no physiological simulation.\n',encoding='utf-8')
    (out/'HUMAN_ATLAS_MIT_LICENSE.txt').write_text((source/'LICENSE').read_text(encoding='utf-8'),encoding='utf-8')
    print(json.dumps({'output':str(out),'files':[{k:v for k,v in f.items() if k!='nodeNames'} for f in files],'groupNames':list(summary)},ensure_ascii=False,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE);parser.add_argument('--out',type=Path,default=DEFAULT_OUT)
    args=parser.parse_args();convert(args.source,args.out)
