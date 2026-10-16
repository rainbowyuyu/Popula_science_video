"""Integrate only published, visually accepted repair handoffs; keep original assets."""
import argparse,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--opening',default='painted_to_garden_v19repair_a');ap.add_argument('--ending',default='garden_to_painted_v19repair_a');a=ap.parse_args()
 manifest_path=ROOT/'src/transitions-v19-repair.json';manifest=json.loads(manifest_path.read_text(encoding='utf8'))
 specs=json.loads((ROOT/'research/qwen-v19-repair-video-specs.json').read_text(encoding='utf8'))
 replacements=[]
 for old,new,frame in [('painted_to_garden_v16',a.opening,300),('fountain_to_painted_v16c',a.ending,10402)]:
  spec=next(s for s in specs['shots'] if s['id']==new);p=ROOT/'public/assets_v19_repair/qwen'/new
  row=json.loads((p/'provenance.json').read_text(encoding='utf8'));review=json.loads((p/'visual-acceptance.json').read_text(encoding='utf8'))
  if row.get('status')!='processed' or row.get('frameCount')!=150 or review.get('status')!='pass' or review.get('providerSHA256')!=row.get('providerSHA256'):raise RuntimeError('Published generation or source review incomplete: '+new)
  if row.get('promptSHA256')!=hashlib.sha256(spec['prompt'].encode()).hexdigest():raise RuntimeError('Spec prompt differs from submitted request: '+new)
  for i in range(150):
   f=p/'frames'/f'frame_{i+1:04d}.jpg'
   if sha(f)!=row['frameHashes'][i]:raise RuntimeError('Published frame hash mismatch: '+str(f))
  for which in ['first','last']:
   if sha(p/f'reference-{which}.png')!=row[which+'Reference']['sha256']:raise RuntimeError('Reference no longer matches submitted frame: '+new)
  b={'id':new,'frames':150,'framePath':f'assets_v19_repair/qwen/{new}/frames','taskId':row['taskId'],'sourceVersion':'V19Repair','anchor':{'kind':'frame','offsetFrames':frame},'transition':{'kind':'matched','focus':[.5,.5],'enterFrames':1,'exitFrames':1,'overlapFrames':0,'maxBlurPx':0}}
  replacements.append((old,new,b))
 for old,new,b in replacements:
  indexes=[i for i,c in enumerate(manifest['clips']) if c['id'] in {old,new}]
  if len(indexes)!=1:raise RuntimeError('Expected one target bridge in manifest: '+new)
  manifest['clips'][indexes[0]]=b
 manifest['pendingRegeneration']=[];manifest['strategy']='Original hand-painted opening, two newly generated first/last-frame handoffs from repaired scene plates, and continuous deterministic native 3D camera throughout the optical story.'
 temporary=manifest_path.with_suffix('.json.pending')
 if temporary.exists():raise RuntimeError('Inspect prior pending manifest before integration')
 temporary.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8');temporary.replace(manifest_path)
 print(json.dumps({'version':'V19Repair','installed':[b['id'] for _,_,b in replacements],'sourceVisualAcceptanceOnly':True,'finalCompositedSeamsStillRequireReview':True},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
