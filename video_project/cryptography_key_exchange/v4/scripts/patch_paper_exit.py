"""Splice the reviewed 73-frame paper exit; retain the original audio packets."""
from pathlib import Path
import hashlib,json,shutil,subprocess

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'work/paper-upgrade'
VIDEO=ROOT/'delivery/密码学_纸张质感升级版_V5_1080p.mp4'
PATCH=WORK/'exit-repair.mp4'
OUT=WORK/'v5-exit-fixed.mp4'
BACKUP=WORK/'v5-before-exit-fix.mp4'

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))

assert not BACKUP.exists(), 'Repair already applied; do not re-encode again.'
assert next(s for s in probe(VIDEO)['streams'] if s['codec_type']=='video')['nb_frames']=='9153'
assert next(s for s in probe(PATCH)['streams'] if s['codec_type']=='video')['nb_frames']=='73'
before=sha(VIDEO)
frozen=WORK/'render-inputs.json'
shutil.copy2(frozen,WORK/'base-render-inputs.json')
subprocess.run(['python',str(ROOT/'scripts/paper_upgrade_release.py'),'freeze'],check=True,cwd=ROOT)
filters='[0:v]split=2[head][tail];[head]trim=start_frame=0:end_frame=8092,setpts=PTS-STARTPTS[a];[1:v]trim=start_frame=0:end_frame=73,setpts=PTS-STARTPTS[b];[tail]trim=start_frame=8165:end_frame=9153,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]'
subprocess.run(['ffmpeg','-hide_banner','-v','warning','-y','-threads','3','-i',str(VIDEO),'-threads','2','-i',str(PATCH),'-filter_complex_threads','2','-filter_complex',filters,'-map','[v]','-map','0:a:0','-c:v','libx264','-crf','16','-preset','fast','-threads','6','-pix_fmt','yuvj420p','-color_range','pc','-colorspace','bt470bg','-fps_mode','cfr','-r','30','-c:a','copy','-movflags','+faststart',str(OUT)],check=True)
streams=probe(OUT)['streams']
v=next(s for s in streams if s['codec_type']=='video')
assert v['nb_frames']=='9153' and v['width']==1920 and v['height']==1080
assert abs(float(v['duration'])-305.1)<1/30
VIDEO.rename(BACKUP)
OUT.rename(VIDEO)
record={'baseVideoSha256':before,'patchSha256':sha(PATCH),'finalVideoSha256':sha(VIDEO),'replacedFramesInclusive':[8092,8164],'patchFrameCount':73,'totalFrames':9153,'audio':'Original AAC packets stream-copied unchanged.','video':'Single re-encode of reviewed base + source-rendered correction at CRF 16; full-range yuvj420p preserved.','baseSourceManifest':'work/paper-upgrade/base-render-inputs.json','finalSourceManifest':'work/paper-upgrade/render-inputs.json'}
(ROOT/'docs/paper-exit-repair.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(record,ensure_ascii=False,indent=2))
