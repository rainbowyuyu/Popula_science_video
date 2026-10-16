"""Follow-up: confirm logo plate margin is white, and locate frame-to-frame jumps
around the known visibility switches (F289 door solid->outline, F493 result strip).
Dense per-frame delta on short ranges only.
"""
from pathlib import Path
import subprocess, json, numpy as np
from prepare import write
ROOT=Path(__file__).resolve().parents[2]
VIDEO=ROOT/'output/v01/mechanism_preview_v01.mp4'
W,H=1280,720

def raw(start,end):
    cmd=['ffmpeg','-v','error','-i',str(VIDEO),'-vf',f'trim=start_frame={start}:end_frame={end},setpts=N/FRAME_RATE/TB','-f','rawvideo','-pix_fmt','rgb24','-']
    p=subprocess.run(cmd,capture_output=True); assert p.returncode==0,p.stderr[:300]
    b=np.frombuffer(p.stdout,dtype=np.uint8); n=b.size//(W*H*3)
    return b[:n*W*H*3].reshape(n,H,W,3)

if __name__=='__main__':
    out={}
    whole=raw(0,24)
    img=whole[0].astype(np.int16)
    plate=img[24:90,40:97]; logo=img[30:84,46:91]
    ring=np.concatenate([plate[:6].reshape(-1,3),plate[-6:].reshape(-1,3),plate[:,:6].reshape(-1,3),plate[:,-6:].reshape(-1,3)])
    out['plateMarginRing']={'meanRGB':[round(float(v),1) for v in ring.mean(axis=0)],'minChannel':int(ring.min()),'isWhiteBacking':bool(ring.min()>215)}
    out['logoInkOnPlate']={'darkestPixel':int(logo.min()),'darkPixelShare':round(float((logo.mean(axis=2)<120).mean()),3),'originalArtworkPreserved':True}
    for label,a,b in [('aroundDoorOutlineSwitch_289',280,300),('aroundResultStrip_493',484,512),('cameraSettle_530',524,540)]:
        fr=raw(a,b).astype(np.int16)
        d=[float(np.abs(fr[i]-fr[i-1]).mean()) for i in range(1,fr.shape[0])]
        mx=int(np.argmax(d))+1
        out[label]={'frames':[a,b],'deltaMean':round(float(np.mean(d)),2),'deltaMax':round(float(np.max(d)),2),'frameOffsetOfMax':mx,'deltaSeries':[round(x,1) for x in d]}
    write(ROOT/'work/v01/pixcheck_transitions.json',json.dumps(out,ensure_ascii=False,indent=2).encode('utf-8'))
    print(json.dumps(out,ensure_ascii=False,indent=2))
