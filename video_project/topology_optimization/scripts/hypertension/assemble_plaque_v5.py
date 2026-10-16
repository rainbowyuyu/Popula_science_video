"""Frame-exact replacement of the reviewed lesion passage; preserve original AAC."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import numpy as np
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/hypertension'
OUTPUT = ROOT / 'output/hypertension'
START, END = 7430, 8180

def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],text=True))

def audio_hash(p):
    return subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',str(p),'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-'],text=True).strip()

def frame_rgb(p, frame):
    data = subprocess.check_output(['ffmpeg','-v','error','-nostdin','-threads','1','-ss',str(frame/30),'-i',str(p),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
    return np.frombuffer(data,dtype=np.uint8).astype(np.float32)

def main():
    original = OUTPUT / 'hypertension_1080p.mp4'
    base = OUTPUT / 'hypertension-before-plaque-v5.mp4'
    segment = OUTPUT / f'segment-{START}-{END}.mp4'
    assembled = OUTPUT / 'hypertension-assembled-v5.mp4'
    timeline = read(ROOT/'src/hypertension/timeline.json')
    count = timeline['duration']
    segment_render = read(RESEARCH/'segment-render.json')
    assert segment_render['success'] and segment_render['frames']==[START, END]
    patch_video = next(s for s in probe(segment)['streams'] if s['codec_type']=='video')
    assert int(patch_video['nb_frames'])==END-START+1
    old_hashes = read(RESEARCH/'source-hashes-before-plaque-visibility-v5.json')
    for relative, expected in old_hashes.items():
        if relative != 'src/hypertension/World.ts':
            assert sha(ROOT/relative)==expected, relative
    before = (RESEARCH/'World-before-plaque-visibility-v5.txt').read_text(encoding='utf-8-sig')
    after = (ROOT/'src/hypertension/World.ts').read_text(encoding='utf-8-sig')
    comment = ('  // Draw the wall cutaway before its subintimal teaching layer. Object-centre\n'
               '  // transparent sorting otherwise paints the whole wall over this lesion;\n'
               '  // depth testing stays enabled so foreground blood cells still occlude it.\n')
    handoff = ("  // Hand the lesion close-up back to its atlas context before the cutaway\n"
               "  // closes. Keep this correction within the final organ pullback interval.\n"
               "  if(s.time>=timeline.clips.find(c=>c.id==='h044')!.start/30&&s.time<timeline.scenes.find(c=>c.id==='measure')!.start/30){\n"
               "   macro*=mix(1,this.aortaDetailVisibility(s.time,microContext),this.clipProgress('h044',s.time,.7));\n"
               "  }\n")
    normalized = after.replace(comment,'').replace('root.renderOrder=3;','').replace(handoff,'').replace('let macro=Math.max(nearAorta','const macro=Math.max(nearAorta')
    assert normalized==before, 'Unexpected source change outside visibility fixes'
    visibility = read(RESEARCH/'plaque-visibility-scope-v5.json')
    assert visibility['passed'] and visibility['firstVisibleFrame']>=START and visibility['lastVisibleFrame']<=END
    if base.exists():
        previous = read(RESEARCH/'plaque-assembly-v5.json')
        assert sha(base)==previous['base']['sha256'] and old_hashes==previous['base']['sourceHashes']
        assert sha(original)==previous['outputSha256'], 'Unexpected current output; inspect before replacement'
    else:
        shutil.copy2(original,base)
        shutil.copy2(RESEARCH/'final-render.json',RESEARCH/'full-render-before-plaque-v5.json')
    base_hash, segment_hash = sha(base), sha(segment)
    filters=(f'[0:v]split=2[pre][post];[pre]trim=end_frame={START},setpts=PTS-STARTPTS[v0];'
             f'[1:v]setpts=PTS-STARTPTS[v1];[post]trim=start_frame={END+1},setpts=PTS-STARTPTS[v2];'
             '[v0][v1][v2]concat=n=3:v=1:a=0[v]')
    command=['ffmpeg','-hide_banner','-nostdin','-y','-threads','2','-i',str(base),'-threads','2','-i',str(segment),
             '-filter_complex_threads','2','-filter_complex',filters,'-map','[v]','-map','0:a:0',
             '-c:v','libx264','-preset','fast','-crf','16','-threads','8','-pix_fmt','yuv420p','-r','30',
             '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','copy','-movflags','+faststart',str(assembled)]
    with (RESEARCH/'plaque-assembly-v5.log').open('w',encoding='utf8') as log:
        subprocess.run(command,stdout=log,stderr=log,check=True)
    result=probe(assembled)
    video=next(s for s in result['streams'] if s['codec_type']=='video')
    assert int(video['nb_frames'])==count and (video['width'],video['height'])==(1920,1080)
    assert video['r_frame_rate']=='30/1'
    aac = {'base':audio_hash(base),'assembled':audio_hash(assembled)}
    assert aac['base']==aac['assembled'], 'AAC packet contents changed'
    sample_checks=[]
    for frame in [START-1,START,7757,7939,8025,8047,8065,END,END+1]:
        reference, index = (segment,frame-START) if START<=frame<=END else (base,frame)
        a,b=frame_rgb(assembled,frame),frame_rgb(reference,index)
        assert a.shape==b.shape
        mae=float(np.mean(np.abs(a-b)))
        sample_checks.append({'frame':frame,'reference':str(reference),'referenceFrame':index,'meanAbsoluteRgbError':mae})
        assert mae<4, f'Frame alignment/encode discrepancy: {frame} {mae}'
    checks={'aacPacketHashes':aac,'frameComparisons':sample_checks,'passed':True,'scope':'Nine decoded frame comparisons after re-encode; exact frame counts and concat indices; unchanged compressed AAC packet content. Visual scene review remains separate.'}
    (RESEARCH/'plaque-assembly-checks-v5.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf8')
    assembled.replace(original)
    final_hashes={p:sha(ROOT/p) for p in old_hashes}
    (RESEARCH/'final-source-hashes-v5.json').write_text(json.dumps(final_hashes,indent=2),encoding='utf8')
    record={'finished':datetime.now(timezone.utc).isoformat(),'frames':[0,count-1],'success':True,
            'method':'frame-exact passage replacement, full H.264 CRF16 encode, original AAC stream copy',
            'base':{'path':str(base),'sha256':base_hash,'sourceHashes':old_hashes,'frames':[0,count-1]},
            'replacement':{'path':str(segment),'sha256':segment_hash,'frames':[START,END],'sourceHashes':final_hashes},
            'onlySourceChange':'World.buildPlaque group.renderOrder=3 plus atlas opacity handoff explicitly confined to frames 8011–8180; unchanged geometry, motion, camera and audio',
            'outsideReplacementProof':'plaque-visibility-scope-v5.json: lesion alpha is zero outside replacement; atlas handoff conditional is false outside frames 8011–8180',
            'outputSha256':sha(original),'videoFrames':int(video['nb_frames'])}
    (RESEARCH/'plaque-assembly-v5.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
    (RESEARCH/'final-render.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'frames':count,'replacement':[START,END],'outputSha256':record['outputSha256']},indent=2))

if __name__=='__main__':
    main()
