"""Frame-to-frame image differences from the complete final MP4.

This flags large visual discontinuities for review; it does not certify
subjective motion quality, continuous viewing, or scientific accuracy.
"""
from pathlib import Path
import argparse,hashlib,json
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1];VIDEO=ROOT/'delivery/GLP1_1080p.mp4'
OUT=ROOT/'research/qa/final-v4/motion-metrics'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()

def main():
    global OUT, VIDEO
    parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');parser.add_argument('--revision',choices=['v4','v5'],default='v4');args=parser.parse_args()
    if args.revision=='v5':
        VIDEO=ROOT/'delivery/GLP1_V5_1080p.mp4';OUT=ROOT/'research/qa/final-v5/motion-metrics'
    if args.baseline:
        OUT=ROOT/'research/revision-v4/baseline-motion'
        qa=json.loads((ROOT/'tmp/final-render.json').read_text(encoding='utf8'))
        assert qa['success'] and qa.get('singlePassRender') is not False
    else:
        qa=json.loads((ROOT/f'research/qa/final-{args.revision}/automatic-report.json').read_text(encoding='utf8'))
        assert qa['automaticChecksPass']
    tl=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf8'))
    assert qa['videoSHA256']==sha(VIDEO) and qa['timelineSHA256']==sha(ROOT/'src/timeline.json')
    OUT.mkdir(parents=True,exist_ok=True);capture=cv2.VideoCapture(str(VIDEO));rows=[];previous=None;frame=0
    while True:
        ok,bgr=capture.read()
        if not ok:break
        # Excludes the fixed title/subtitle columns, includes the entire model,
        # organ labels and scale ruler. A local label swap can still be flagged.
        gray=cv2.cvtColor(cv2.resize(bgr[160:928,730:1880],(288,192)),cv2.COLOR_BGR2GRAY)
        if previous is not None:
            difference=cv2.absdiff(gray,previous)
            rows.append([frame,float(difference.mean()),float(np.mean(difference>32))])
        previous=gray;frame+=1
    capture.release();assert frame==tl['duration']
    data=np.array(rows);baseline=float(np.median(data[:,1]));threshold=max(10.,baseline*12)
    flags=[r for r in rows if r[1]>threshold and r[2]>.16]
    top=sorted(rows,key=lambda r:r[1],reverse=True);chosen=[]
    for row in top:
        if all(abs(row[0]-q[0])>45 for q in chosen):chosen.append(row)
        if len(chosen)==12:break
    report={'version':'baseline-before-local-repairs' if args.baseline else 'final','videoSHA256':qa['videoSHA256'],'timelineSHA256':qa['timelineSHA256'],'decodedFrames':frame,
            'roi':[730,160,1880,928],'analysisResolution':[288,192],'grayLevelRange':[0,255],
            'medianMeanAbsoluteDifference':baseline,'maxMeanAbsoluteDifference':float(data[:,1].max()),
            'flagThresholdMeanAbsoluteDifference':threshold,'flagThresholdChangedAreaFraction':.16,
            'potentialDiscontinuities':[{'frame':r[0],'meanAbsoluteDifference':r[1],'changedAreaFraction':r[2]} for r in flags],
            'largestSeparatedChanges':[{'frame':r[0],'meanAbsoluteDifference':r[1],'changedAreaFraction':r[2]} for r in chosen],
            'scope':'Automatic visual-discontinuity screening of every adjacent encoded frame pair. No claim of full subjective playback review.'}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    font=ImageFont.truetype('C:/Windows/Fonts/NotoSansSC-VF.ttf',24)
    selected=sorted({max(0,min(frame-1,int(r[0]+d))) for r in chosen for d in [-1,0,1]})
    capture=cv2.VideoCapture(str(VIDEO));shots={}
    for n in selected:
        capture.set(cv2.CAP_PROP_POS_FRAMES,n);ok,bgr=capture.read();assert ok
        image=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB));image.save(OUT/f'frame-{n}.jpg',quality=92)
        shots[n]=image
    capture.release()
    for page in range(0,len(chosen),4):
        canvas=Image.new('RGB',(1964,4*410+65),'#f2eee7');draw=ImageDraw.Draw(canvas)
        draw.text((15,12),args.revision.upper()+' encoded motion | largest frame differences',font=font,fill='#29484a')
        for j,row in enumerate(chosen[page:page+4]):
            for i,delta in enumerate([-1,0,1]):
                n=max(0,min(frame-1,int(row[0]+delta)));x=14+i*650;y=60+j*410
                canvas.paste(shots[n].resize((640,360),Image.Resampling.LANCZOS),(x,y))
                draw.text((x,y+366),f'F{n} | {n/30:.2f}s | MAE {row[1]:.2f}',font=font,fill='#29484a')
        canvas.save(OUT/f'largest-changes-{page//4+1}.jpg',quality=94)
    assert sha(VIDEO)==qa['videoSHA256']
    print(json.dumps({'frames':frame,'potentialDiscontinuityCount':len(flags),'maxDifference':float(data[:,1].max())}),flush=True)

if __name__=='__main__':main()
