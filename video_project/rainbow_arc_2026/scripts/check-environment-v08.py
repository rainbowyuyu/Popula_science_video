from pathlib import Path
import json,hashlib,struct,datetime

root=Path(__file__).resolve().parents[1]
p=root/'public/assets_v08/environment'
rows=[]
for i in [p/'textures/slate_floor_02_diff_2k_desaturated.jpg',p/'textures/authored_cloth_normal_v08.png']:
    rows.append({'file':str(i.relative_to(p)).replace('\\','/'),'bytes':i.stat().st_size,'sha256':hashlib.sha256(i.read_bytes()).hexdigest()})
(p/'textures/derivatives-provenance.json').write_text(json.dumps({
    'original_slate_license':'CC0 1.0; see provenance.json',
    'diffuse_derivative':'Pillow saturation .10, brightness 1.20, JPEG94; original preserved',
    'cloth_normal':'Authored 512x512 deterministic crossed sine weave, normalized xyz, not scanned cloth',
    'files':rows},indent=2),encoding='utf8')
records=[]
for f in [p/'rain_after_terrace_v08.glb',p/'observer_v08.glb']:
    raw=f.read_bytes();assert raw[:4]==b'glTF'
    size=struct.unpack_from('<I',raw,12)[0]
    meta=json.loads(raw[20:20+size].decode().strip())
    names=[node.get('name','') for node in meta['nodes']]
    assert not any(name.startswith(('valley_layer','side_pine')) for name in names),'Rejected procedural terrain must not be in accepted GLB'
    triangles=0
    for mesh in meta['meshes']:
        for prim in mesh['primitives']:
            if 'indices' in prim:triangles+=meta['accessors'][prim['indices']]['count']//3
    records.append({'file':f.name,'bytes':len(raw),'meshes':len(meta['meshes']),'nodes':len(meta['nodes']),
                    'triangles':triangles,'sha256':hashlib.sha256(raw).hexdigest()})
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status':'pass','GLB':records,'rejected_draft_meshes_present':False,
        'visual_review':'Final Cycles set/stone/fitted-coat stills were inspected; final film integration must be checked separately'}
q=root/'research/qa/environment-v08.json';q.parent.mkdir(parents=True,exist_ok=True);q.write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
