"""Replace the measured-arm passage and encode the newly composed full score."""
from pathlib import Path
import hashlib
import json
import subprocess
from datetime import datetime, timezone
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/hypertension'
OUTPUT = ROOT / 'output/hypertension'
START, END = 8000, 9670

def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)],text=True))

def pixels(p, frame):
    data=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-threads','1','-ss',str(frame/30),'-i',str(p),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
    return np.frombuffer(data,dtype=np.uint8).astype(np.float32)

def main():
    original=ROOT/'delivery/hypertension/hypertension_1080p.mp4'
    ledger=read(ROOT/'delivery/hypertension/DELIVERY.json')
    assert ledger['revision']=='vascular-annotated-v6-20261007'
    assert sha(original)==ledger['mp4Sha256']
    segment=OUTPUT/f'segment-{START}-{END}.mp4'
    target=OUTPUT/'hypertension-v7-assembled.mp4'
    master=ROOT/'public/hypertension/master.wav'
    tl=read(ROOT/'src/hypertension/timeline.json')
    sources=read(RESEARCH/'final-source-hashes-v7.json')
    for name, expected in sources.items():
        assert sha(ROOT/name)==expected, f'Changed frozen input: {name}'
    assert tl['duration']==END+1
    assert sha(ROOT/'src/hypertension/timeline.json')==ledger['timelineSha256']
    rendered=read(RESEARCH/'segment-render.json')
    assert rendered['success'] and rendered['frames']==[START,END]
    video=next(s for s in probe(segment)['streams'] if s['codec_type']=='video')
    assert int(video['nb_frames'])==END-START+1
    scope=read(RESEARCH/'arm-v7-impact-scope.json')
    assert scope['passed'], 'Measured-arm visibility and shadow impact must be bounded'
    assert scope['safeReplacementStart']>=START
    assert read(RESEARCH/'arm-v7-geometry-qa.json')['passed']
    assert read(RESEARCH/'annotations-v7-qa.json')['passed']
    filters=f'[0:v]trim=end_frame={START},setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v]'
    command=['ffmpeg','-hide_banner','-nostdin','-y','-threads','2','-i',str(original),'-threads','2','-i',str(segment),'-i',str(master),
        '-filter_complex_threads','2','-filter_complex',filters,'-map','[v]','-map','2:a:0',
        '-c:v','libx264','-preset','fast','-crf','16','-threads','8','-pix_fmt','yuv420p','-r','30',
        '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','320k','-ar','48000','-t',str(tl['duration']/30),'-movflags','+faststart',str(target)]
    with (RESEARCH/'final-render-v7.log').open('w',encoding='utf8') as log:
        subprocess.run(command,stdout=log,stderr=log,check=True)
    result=probe(target)
    video=next(s for s in result['streams'] if s['codec_type']=='video')
    assert int(video['nb_frames'])==tl['duration'] and (video['width'],video['height'])==(1920,1080)
    comparisons=[]
    for f in [0,690,4000,7999,8000,8267,8340,8665,8840,9000,9670]:
        reference,index=(segment,f-START) if f>=START else (original,f)
        a,b=pixels(target,f),pixels(reference,index)
        assert a.shape==b.shape
        error=float(np.mean(np.abs(a-b)))
        assert error<4, (f,error)
        comparisons.append({'frame':f,'referenceFrame':index,'reference':str(reference),'meanAbsoluteRgbError':error})
    record={'finished':datetime.now(timezone.utc).isoformat(),'frames':[0,tl['duration']-1],'success':True,
        'method':'Frame-exact measurement replacement and full H.264 CRF16/AAC320 export with newly mixed music',
        'base':{'path':str(original),'sha256':sha(original),'revision':ledger['revision']},
        'replacement':{'path':str(segment),'sha256':sha(segment),'frames':[START,END]},
        'masterSha256':sha(master),'sourceHashes':sources,'outputSha256':sha(target),'frameComparisons':comparisons,
        'scopeEvidence':'arm-v7-impact-scope.json','fullSpeedHumanPlayback':False,'subjectiveListeningChecked':False}
    target.replace(OUTPUT/'hypertension_1080p.mp4')
    (RESEARCH/'measurement-assembly-v7.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
    (RESEARCH/'final-render.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'frames':tl['duration'],'sha256':record['outputSha256'],'passed':True},indent=2))

if __name__=='__main__':
    main()
