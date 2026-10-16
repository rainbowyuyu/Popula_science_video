"""Pixel-level checks on the ENCODED preview. Automated stats, not a watch review."""
from pathlib import Path
import subprocess, json, numpy as np
from prepare import write
ROOT=Path(__file__).resolve().parents[2]
VIDEO=ROOT/'output/v01/mechanism_preview_v01.mp4'
W,H=1280,720

def frames(step=6):
    cmd=['ffmpeg','-v','error','-i',str(VIDEO),'-vf',f'select=not(mod(n\\,{step}))','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','-']
    p=subprocess.run(cmd,capture_output=True)
    assert p.returncode==0,p.stderr[:400]
    buf=np.frombuffer(p.stdout,dtype=np.uint8)
    n=buf.size//(W*H*3)
    return buf[:n*W*H*3].reshape(n,H,W,3),step

def region(img,x0,y0,x1,y1):
    return img[y0:y1,x0:x1].astype(np.int16)

if __name__=='__main__':
    arr,step=frames()
    report={'sampledFrames':int(arr.shape[0]),'step':step,'scope':'automated pixel statistics on encoded H.264 frames; no continuous viewing'}
    means=arr.reshape(arr.shape[0],-1,3).mean(axis=(1,2))
    report['frameMeanMin']=round(float(means.min()),2)
    report['frameMeanMax']=round(float(means.max()),2)
    report['darkSampledFrames']=int((means<12).sum())
    first=arr[0]
    pad=region(first,44,28,94,86)
    report['logoPad']={'meanRGB':[round(float(v),1) for v in pad.reshape(-1,3).mean(axis=0)],'minChannel':int(pad.min()),'looksWhite':bool(pad.min()>200)}
    brandtxt=region(first,105,30,240,62)
    report['brandTextRegion']={'minLuma':int(brandtxt.mean(axis=2).min()),'hasDarkInkOnWhite':bool(brandtxt.mean(axis=2).min()<140 and brandtxt.mean(axis=2).max()>200)}
    title=arr[2]
    t=region(title,40,96,760,152)
    report['titleBand']={'maxLuma':int(t.mean(axis=2).max()),'contrast':int(t.mean(axis=2).max()-t.mean(axis=2).min())}
    last=arr[-1]
    cap=region(last,380,592,900,668)
    report['bottomCaption']={'maxLuma':int(cap.mean(axis=2).max()),'contrast':int(cap.mean(axis=2).max()-cap.mean(axis=2).min()),'visible':bool(cap.mean(axis=2).max()-cap.mean(axis=2).min()>60)}
    diffs=[float(np.abs(arr[i].astype(np.int16)-arr[i-1].astype(np.int16)).mean()) for i in range(1,arr.shape[0])]
    report['adjacentFrameDelta']={'mean':round(float(np.mean(diffs)),2),'max':round(float(np.max(diffs)),2),'maxAtSampledIndex':int(np.argmax(diffs))}
    write(ROOT/'work/v01/pixcheck.json',json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8'))
    print(json.dumps(report,ensure_ascii=False,indent=2))
