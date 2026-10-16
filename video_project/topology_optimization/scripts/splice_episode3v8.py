"""Replace a repaired 1250-frame GOP-aligned section without recoding the rest.

The original complete video stays available until the patched film passes its
independent media audit. No audio samples are re-encoded by this repair.
"""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/episode3v8'
TMP=ROOT/'tmp/episode3v8-splice'
def run(args):
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr[-6000:])
    return p.stdout
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def info(p):
    return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))
def video(p):return next(s for s in info(p)['streams'] if s['codec_type']=='video')
def main():
    TMP.mkdir(parents=True,exist_ok=True)
    source=OUT/'joinery_v8_1080p.mp4';replacement=OUT/'segment-2750-3999.mp4'
    if not replacement.exists():raise FileNotFoundError(replacement)
    if int(video(source)['nb_frames'])!=9764 or int(video(replacement)['nb_frames'])!=1250:raise AssertionError('Unexpected source/replacement frame counts')
    before=sha(source)
    run(['ffmpeg','-v','error','-y','-i',str(source),'-map','0:v:0','-an','-c','copy',
         '-f','segment','-segment_times','91.666666667,133.333333333','-segment_time_delta','0.016666667',
         '-reset_timestamps','1','-avoid_negative_ts','disabled',str(TMP/'base-%d.mp4')])
    sections=[TMP/f'base-{i}.mp4' for i in range(3)]
    counts=[int(video(p)['nb_frames']) for p in sections]
    if counts!=[2750,1250,5764]:raise AssertionError(f'Split did not honor IDR boundaries: {counts}')
    listing=TMP/'concat.txt'
    listing.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in [sections[0],replacement,sections[2]])+'\n',encoding='utf8')
    dest=OUT/'joinery_v8_bracket_fixed.mp4'
    run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-i',str(source),
         '-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',str(dest)])
    vi=video(dest)
    if int(vi['nb_frames'])!=9764 or abs(float(vi['duration'])-9764/30)>.001:raise AssertionError('Patched video frame count/time changed')
    # Prove that every decoded image outside the repaired IDR block survived
    # unchanged, including the full hip, force, wind and reference sections.
    def framehash(p):
        rows=run(['ffmpeg','-v','error','-i',str(p),'-map','0:v:0','-an','-f','framemd5','-'])
        return [line.split(',')[-1].strip() for line in rows.splitlines() if line and not line.startswith('#')]
    old,new=framehash(source),framehash(dest)
    if len(old)!=9764 or len(new)!=9764:raise AssertionError('Decoded frame count differs')
    outside=[i for i in range(9764) if not 2750<=i<4000]
    changed=[i for i in outside if old[i]!=new[i]]
    if changed:raise AssertionError(f'Unexpected image changes outside repair: {changed[:12]}')
    # Audio packet data, independent of container/edit-list metadata.
    def audiohash(p):
        return run(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-']).strip()
    original_audio,patched_audio=audiohash(source),audiohash(dest)
    if original_audio!=patched_audio:raise AssertionError('Audio packet content changed')
    backup=OUT/'joinery_v8_before_bracket_fix.mp4'
    if backup.exists():raise FileExistsError('Do not overwrite a repair fallback')
    source.rename(backup);dest.rename(source)
    report={'sourceSha256':before,'finalSha256':sha(source),'repairedFrames':[2750,3999],
            'actualChangedFrameCount':sum(a!=b for a,b in zip(old,new)),
            'outsideRepairDecodedFramesUnchanged':len(outside),'audioPacketSha256Unchanged':True,
            'audioPacketHash':original_audio,'sourceFallback':str(backup),'video':str(source),
            'finalFrames':9764,'success':True,'requiresFinalMediaReaudit':True}
    (ROOT/'research/episode3v8/final-splice.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
