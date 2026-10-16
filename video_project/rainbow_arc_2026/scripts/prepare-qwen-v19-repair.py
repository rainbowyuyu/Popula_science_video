"""Stage actual clean frame endpoints. No paid API calls; no credentials read."""
from pathlib import Path
from PIL import Image
import argparse,hashlib,json,datetime

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(json.loads((ROOT/'work/output-root-v19-repair.json').read_text(encoding='utf8'))['outputRoot'])
WORK=OUTPUT/'work/qwen-v19-repair'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def stage(source,name):
 source=source if source.is_absolute() else ROOT/source
 destination=WORK/'inputs'/name;destination.parent.mkdir(exist_ok=True,parents=True)
 if not source.is_file():raise FileNotFoundError(source)
 with Image.open(source) as im:
  if im.size!=(1920,1080):raise RuntimeError('Expected native 1920x1080 endpoint: '+str(source))
  im=im.convert('RGB');temporary=destination.with_suffix('.staged.png');im.save(temporary)
 if destination.exists():
  if sha(destination)!=sha(temporary):
   active=list((WORK/'generated').glob('*/provenance.json'))
   for p in active:
    row=json.loads(p.read_text(encoding='utf8'))
    if row.get('status')!='planned' and name in [row.get('firstReferenceName'),row.get('lastReferenceName')]:
     temporary.unlink();raise RuntimeError('Endpoint belongs to an already submitted request; use a new attempt ID and input filename.')
  temporary.replace(destination)
 else:temporary.replace(destination)
 return {'source':str(source),'sourceSHA256':sha(source),'staged':str(destination),'stagedSHA256':sha(destination),'size':[1920,1080],'sourceWasGenerated':str(source).replace('\\','/').find('/qwen/')>=0}
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--garden-entry',type=Path);ap.add_argument('--garden-exit',type=Path);a=ap.parse_args()
 rows=[stage(ROOT/'public/assets_v15/qwen/painted_chase/frames/frame_0300.jpg','painted-to-garden-first.png'),stage(ROOT/'public/assets_v16/qwen/fountain_to_painted_v16c/frames/frame_0150.jpg','garden-to-painted-last.png')]
 if a.garden_entry:rows.append(stage(a.garden_entry,'painted-to-garden-last.png'))
 if a.garden_exit:rows.append(stage(a.garden_exit,'garden-to-painted-first.png'))
 record={'version':'V19Repair','createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Pixel-preserving RGB conversion only; original endpoint sources preserved. No image synthesis or API submission.','endpoints':rows,'pending':['painted-to-garden-last.png']*(not a.garden_entry)+['garden-to-painted-first.png']*(not a.garden_exit)}
 p=WORK/'endpoint-staging.json';p.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(record,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
