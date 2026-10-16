"""Create dense native-frame inspection evidence, never automatic aesthetic acceptance.

This is read-only with respect to provider videos, submitted provenance, and
runtime frames. Every contact tile comes from an actual decoded source frame.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(json.loads((ROOT/'work/output-root-v15.json').read_text('utf8'))['outputRoot'])
WORK = OUTPUT/'work/qwen-v15'

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(4*1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def inspect(id):
    out=WORK/'generated'/id
    row=json.loads((out/'provenance.json').read_text('utf8'))
    if row['status']!='processed': raise RuntimeError('Only processed native sources can be inspected')
    source=out/'provider.mp4'
    if sha(source)!=row['providerSHA256']: raise RuntimeError('Provider source changed')
    files=sorted((out/'frames').glob('frame_*.jpg'))
    if len(files)!=row['frameCount'] or [sha(f) for f in files]!=row['frameHashes']:
        raise RuntimeError('Native decoded frame set changed')
    indices=sorted(set([0,1,len(files)-2,len(files)-1,*range(0,len(files),max(1,len(files)//28))]))
    cols=4; tilew=480; tileh=270; labelh=24
    sheet=Image.new('RGB',(cols*tilew,((len(indices)+cols-1)//cols)*(tileh+labelh)),'#eef4f2')
    draw=ImageDraw.Draw(sheet)
    for tile,index in enumerate(indices):
        x=(tile%cols)*tilew; y=(tile//cols)*(tileh+labelh)
        with Image.open(files[index]) as im: sheet.paste(im.resize((tilew,tileh)),(x,y))
        draw.text((x+10,y+tileh+5),f'{id} native {index} ({index/30:.3f}s)',fill='#173d42')
    sheet.save(out/'inspection-contact.jpg',quality=94)
    previous=None; changes=[]
    for p in files:
        with Image.open(p) as im: arr=np.asarray(im.resize((160,90)),dtype=np.float32)
        if previous is not None: changes.append(float(np.abs(arr-previous).mean()))
        previous=arr
    ordered=sorted(enumerate(changes),key=lambda v:v[1],reverse=True)[:8]
    report={'version':'V15','id':id,'createdUTC':dt.datetime.now(dt.timezone.utc).isoformat(),
        'providerSHA256':row['providerSHA256'],'nativeFrames':len(files),'fps':row['nativeFPS'],
        'denseIndicesZeroBased':indices,'denseContactFile':str((out/'inspection-contact.jpg').resolve()),
        'denseContactSHA256':sha(out/'inspection-contact.jpg'),
        'allAdjacentThumbnailChange':{'method':'Mean absolute RGB error, 160x90 thumbnails; descriptive only, not a pass/fail criterion',
            'median':float(np.median(changes)),'p95':float(np.percentile(changes,95)),
            'max':max(changes),'largestPairsZeroBased':[{'first':n,'second':n+1,'value':v} for n,v in ordered]},
        'exactDuplicateAdjacentPairs':sum(a==b for a,b in zip(row['frameHashes'],row['frameHashes'][1:])),
        'visualReviewStatus':'pending-actual-human-or-vision-inspection',
        'normalSpeedPlaybackPerformed':False,'audioListeningPerformed':False,
        'sourcesModified':False,'framesSynthesizedOrHeld':False}
    (out/'inspection-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
    print(json.dumps({'id':id,'nativeFrames':len(files),'denseTiles':len(indices),'maxAdjacentChange':max(changes)},ensure_ascii=False))

def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--only',required=True)
    args=parser.parse_args()
    allowed={s['id'] for s in json.loads((ROOT/'research/qwen-v15-art-video-specs.json').read_text('utf8'))['shots']}
    ids=args.only.split(',')
    if not ids or any(id not in allowed for id in ids): raise RuntimeError('Unknown shot ID')
    for id in ids: inspect(id)

if __name__=='__main__': main()
