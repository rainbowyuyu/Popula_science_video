"""Prove the v02 fix is scoped: compare encoded v01 and v02 frame-by-frame.
Expects the whole version difference only inside the door gesture band
(F289-F447) plus its downstream camera-era frames.
"""
from pathlib import Path
import subprocess, json, numpy as np
from prepare import write
import revision
ROOT=revision.ROOT
W,H=1280,720
A=revision.PREVIOUS_VIDEO
B=revision.VIDEO

def decoded(path):
    cmd=['ffmpeg','-v','error','-i',str(path),'-f','rawvideo','-pix_fmt','rgb24','-']
    p=subprocess.run(cmd,capture_output=True); assert p.returncode==0,p.stderr[:300]
    b=np.frombuffer(p.stdout,dtype=np.uint8)
    n=b.size//(W*H*3); return b[:n*W*H*3].reshape(n,H,W,3)

if __name__=='__main__':
    a,b=decoded(A),decoded(B)
    n=min(a.shape[0],b.shape[0])
    diffs=np.array([np.abs(a[i].astype(np.int16)-b[i].astype(np.int16)).mean() for i in range(n)])
    raw=np.array([np.abs(a[i].astype(np.int16)-b[i].astype(np.int16)).max() for i in range(n)])
    changed=np.where(diffs>0.5)[0]+1
    report={'comparedFrames':int(n),'v01':str(A.relative_to(ROOT)),'v02':str(B.relative_to(ROOT)),
            'changedFrameCount':int(len(changed)),
            'firstChangedFrame':int(changed[0]) if len(changed) else None,
            'lastChangedFrame':int(changed[-1]) if len(changed) else None,
            'maxMeanDelta':round(float(diffs.max()),3),
            'maxMeanDeltaFrame':int(int(np.argmax(diffs))+1),
            'maxChannelDelta':int(raw.max()),
            'outsideBandChangedFrames':[int(f) for f in changed if f<250 or f>470][:20],
            'note':'Frames inside F280-460 are expected to change because of the door gesture and its camera framing.'}
    write(ROOT/'work/v01/version_compare.json',json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8'))
    print(json.dumps(report,ensure_ascii=False,indent=2))
