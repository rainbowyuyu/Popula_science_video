"""Select bilateral quadriceps from the existing atlas without changing vertices."""
from prepare_assets import ROOT,SOURCE,GLB,summary,write_json,SOURCE_COMMIT
import json

def main():
    base=SOURCE/'public/models';atlas=json.loads((base/'atlas.json').read_text(encoding='utf8'))
    ids=['FJ1433','FJ1433M','FJ1441','FJ1441M','FJ1442','FJ1442M','FJ1443','FJ1443M']
    parts={p['id']:p for p in atlas['parts']};chunks={}
    selected=[parts[i] for i in ids];glb=GLB('thighMuscles',[.60,.29,.24])
    for part in selected:
        n=part['chunk']
        if n not in chunks:chunks[n]=(base/atlas['chunks'][n]['url'].split('/')[-1]).read_bytes()
        glb.part(part,chunks[n])
    path=ROOT/'public/models/thighMuscles.glb';meta=glb.save(path)
    points=[b for n in glb.doc['nodes'] if 'extras' in n for b in n['extras']['bounds']]
    record={'path':'models/thighMuscles.glb',**meta,**summary(points),'sourceIDs':ids,
            'parts':[{'id':p['id'],'name':p['name']} for p in selected],'meshCount':len(selected),
            'units':'meters','sourceCommit':SOURCE_COMMIT,'license':'CC BY 4.0',
            'notes':['Original atlas positions and triangle indices preserved; no recentering or rescaling.','Bilateral rectus femoris and vastus lateralis, medialis, intermedius.']}
    manifest_path=ROOT/'public/models/manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf8'))
    manifest['assets']['thighMuscles']=record;write_json(manifest_path,manifest)
    write_json(ROOT/'research/revision-v4/muscle-assets.json',record)
    print(json.dumps({'path':str(path),'bytes':meta['bytes'],'bounds':record['bounds'],'center':record['center']}))

if __name__=='__main__':main()
