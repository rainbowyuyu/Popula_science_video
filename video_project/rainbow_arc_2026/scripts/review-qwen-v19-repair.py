"""Produce dense visual review sheets and measured diagnostics; never auto-accept."""
from pathlib import Path
from PIL import Image,ImageDraw
import argparse,json,hashlib,numpy as np
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(json.loads((ROOT/'work/output-root-v19-repair.json').read_text(encoding='utf8'))['outputRoot'])
WORK=OUTPUT/'work/qwen-v19-repair'
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--id',required=True);a=ap.parse_args();p=WORK/'generated'/a.id
 row=json.loads((p/'provenance.json').read_text(encoding='utf8'))
 if row.get('status')!='processed':raise RuntimeError('Source has not been completely processed')
 files=sorted((p/'frames').glob('frame_*.jpg'));chosen=sorted(set([0,1,*range(9,len(files),10),len(files)-2,len(files)-1]));tiles=[]
 for n in chosen:
  with Image.open(files[n]) as im:im=im.convert('RGB').resize((480,270))
  tile=Image.new('RGB',(480,296),'#101b21');tile.paste(im,(0,24));ImageDraw.Draw(tile).text((8,6),f'{a.id}: {n+1}/{len(files)}',fill='white');tiles.append(tile)
 contact=Image.new('RGB',(1920,296*((len(tiles)+3)//4)),'#101b21')
 for i,im in enumerate(tiles):contact.paste(im,((i%4)*480,(i//4)*296))
 contact.save(p/'contact-dense.jpg',quality=94)
 compare=Image.new('RGB',(1920,1110),'#101b21');d=ImageDraw.Draw(compare)
 for i,(name,source) in enumerate([('INPUT FIRST',p/'reference-first.png'),('GENERATED FIRST',files[0]),('INPUT LAST',p/'reference-last.png'),('GENERATED LAST',files[-1])]):
  with Image.open(source) as im:im=im.convert('RGB').resize((960,540))
  x=(i%2)*960;y=(i//2)*555;compare.paste(im,(x,y+15));d.text((x+8,y+2),name,fill='white')
 compare.save(p/'contact-endpoints.jpg',quality=94)
 previous=None;delta=[]
 for i,f in enumerate(files):
  with Image.open(f) as im:current=np.asarray(im.convert('RGB').resize((192,108)),dtype=np.float32)
  if previous is not None:delta.append({'frame':i+1,'meanAbsoluteRGBDelta':float(np.abs(current-previous).mean())})
  previous=current
 report={'version':'V19Repair','id':a.id,'providerSHA256':row['providerSHA256'],'denseFrames':[x+1 for x in chosen],'endpointError':row.get('endpointError'),'frameDeltas':delta,'largestFrameChanges':sorted(delta,key=lambda x:x['meanAbsoluteRGBDelta'],reverse=True)[:10],'identicalAdjacentFramePairs':row.get('identicalAdjacentFramePairs'),'automaticVisualAcceptance':False,'normalSpeedPlaybackChecked':False,'scope':'Contact-sheet preparation and pixel-change diagnostics only; visual decisions must be documented after inspecting these sheets.'}
 (p/'review-diagnostics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'id':a.id,'denseContact':str(p/'contact-dense.jpg'),'endpointContact':str(p/'contact-endpoints.jpg'),'endpointError':report['endpointError'],'largestFrameChanges':report['largestFrameChanges']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
