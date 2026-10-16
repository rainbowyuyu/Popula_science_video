"""Extract additional BodyParts3D structures without moving/recentering anatomy."""
from pathlib import Path
import json, struct, hashlib

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'topology_optimization/public/hypertension/models/kidneys.glb'
OUT=ROOT/'public/models'

def read_glb(path):
    raw=path.read_bytes()
    n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n])
    return doc,raw[20+n:]

def main():
    doc,bin_chunk=read_glb(SOURCE)
    manifest_path=OUT/'manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    additions={}
    for key,source_name in [('leftKidney','leftKidney'),('rightKidney','rightKidney'),('adrenals','adrenals')]:
        child=next(i for i,n in enumerate(doc['nodes']) if n.get('name')==source_name)
        copy=json.loads(json.dumps(doc))
        copy['scenes']=[{'nodes':[child]}]
        copy['scene']=0
        text=json.dumps(copy,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        text+=b' '*((-len(text))%4)
        raw=struct.pack('<4sII',b'glTF',2,12+8+len(text)+len(bin_chunk))+struct.pack('<I4s',len(text),b'JSON')+text+bin_chunk
        path=OUT/(key+'.glb');path.write_bytes(raw)
        mesh_node=doc['nodes'][doc['nodes'][child]['children'][0]]
        extra=mesh_node['extras']
        entry={'path':'models/'+path.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'bounds':extra['bounds'],'center':extra['center'],'sourceIDs':doc['nodes'][child]['extras']['sourceIDs'],'meshCount':1,'units':'meters','source':'BodyParts3D 4.0 / human-atlas 1c38bf35c254a891200d3cedecfd57abebe83d8d','notes':['Shared original atlas coordinates; identity transform.','Renal microanatomy and physiological animations are separate teaching geometry.']}
        manifest['assets'][key]=entry;additions[key]=entry
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    target=ROOT/'research/revision-v4';target.mkdir(parents=True,exist_ok=True)
    (target/'cardio-assets.json').write_text(json.dumps({'sourceFile':str(SOURCE),'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceCoordinateChanges':False,'added':additions},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(additions,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
