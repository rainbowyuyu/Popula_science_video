"""Restore the encoded continuous scene and transplant only F5679's caption pill.

The source scene is a verified stream-copy segment of V17. This is a deliberately
local compositing repair, not a new 3D render. Inputs and filter are recorded.
"""
from pathlib import Path
import hashlib, json, subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/v18-caption-only-patch'
BASE=ROOT/'tmp/v18-compose-release/base-007.mp4'
CAPTION=ROOT/'tmp/v18-release-patches/patch-5500-5749.bt709.mp4'
LOCK=ROOT/'tmp/v18-release-patches/source-lock.json'

def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def rel(p):return Path(p).relative_to(ROOT).as_posix()
def run(args,name):
    p=subprocess.run(args,capture_output=True)
    (OUT/(name+'.log')).write_bytes(p.stderr)
    assert p.returncode==0,p.stderr[-4000:]
    return p.stdout
def evidence(p):return {'path':rel(p),'sha256':sha(p)}

assert sha(BASE)=='030ba1f2d1ca61ec9c95a6d6d7f88c7c7d9a7bf26a7b55597912fc75cbcfbd26'
assert sha(CAPTION)=='b022d71eb9423094cd0f5e4b85b7461e1f54e4951aeba31bc657a3f697c6c040'
assert sha(LOCK)=='df7335d675b15429e1a2263f150aaf907954a7aee0787f5acd7fcec0a15bc3d1'
OUT.mkdir(exist_ok=False)
ff=['ffmpeg','-hide_banner','-loglevel','error','-y']
for name,source in [('original',BASE),('caption',CAPTION)]:
    run(ff+['-threads','4','-i',str(source),'-vf','select=eq(n\\,179)',
            '-frames:v','1','-update','1',str(OUT/(name+'.png'))],name)

# The wider corrected pill covers the old short pill. A supersampled rounded
# mask leaves scene geometry outside the pill untouched before video encoding.
box=(596,952,1324,1042);w,h=box[2]-box[0],box[3]-box[1]
mask=Image.new('L',(w*4,h*4),0)
ImageDraw.Draw(mask).rounded_rectangle((0,2,w*4-1,h*4-1),radius=16*4,fill=255)
mask=mask.resize((w,h),Image.Resampling.LANCZOS)
with Image.open(OUT/'caption.png') as source:
    overlay=source.convert('RGB').crop(box).convert('RGBA')
overlay.putalpha(mask);overlay.save(OUT/'caption-pill.png')
with Image.open(OUT/'original.png') as original:
    original=original.convert('RGB'); preview=original.copy()
preview.paste(overlay,box[:2],overlay);preview.save(OUT/'composited-F5679.png')
a,b=np.asarray(original),np.asarray(preview)
outside=np.ones(a.shape[:2],bool);outside[box[1]:box[3],box[0]:box[2]]=False
assert np.array_equal(a[outside],b[outside])
patch=OUT/'patch-5500-5749.mp4'
filter_text="[0:v][1:v]overlay=596:952:enable='eq(n,179)':eof_action=repeat:format=yuv420[v]"
args=ff+['-threads','4','-i',str(BASE),'-i',str(OUT/'caption-pill.png'),
    '-filter_complex',filter_text,'-map','[v]','-an','-frames:v','250',
    '-c:v','libx264','-preset','slow','-crf','16','-pix_fmt','yuv420p',
    '-profile:v','high','-level:v','4.0','-g','250','-keyint_min','250',
    '-sc_threshold','0','-bf','2','-threads','8','-r','30',
    '-color_range','tv','-colorspace','bt709','-color_primaries','bt709',
    '-color_trc','bt709','-video_track_timescale','90000',
    '-map_metadata','-1','-map_chapters','-1','-movflags','+faststart+write_colr',str(patch)]
run(args,'encode')
run(ff+['-i',str(patch),'-vf','select=eq(n\\,179)','-frames:v','1',
        '-update','1',str(OUT/'encoded-F5679.png')],'encoded-caption')
marker={'start':5500,'end':5749,'path':rel(patch),'sha256':sha(patch),
    'sourceLock':rel(LOCK),'sourceLockSHA256':sha(LOCK),'runner':rel(Path(__file__)),
    'runnerSHA256':sha(__file__),'operation':'caption-only-composite-over-original-encoded-scene',
    'originalScene':evidence(BASE),'correctedCaptionSource':evidence(CAPTION),
    'changedCaptionGlobalFrame':5679,'changedCaptionLocalFrame':179,
    'captionBoundsXYXY':list(box),'mask':evidence(OUT/'caption-pill.png'),
    'preencodeRGBOutsideCaptionExactlyUnchanged':True,
    'sceneRerendered':False,'all250FramesReencoded':True,'crf':16,
    'command':args,'filter':filter_text}
patch.with_suffix('.json').write_text(json.dumps(marker,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(marker,ensure_ascii=False))
