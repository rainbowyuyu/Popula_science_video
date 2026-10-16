"""Join verified frozen V10 segments and encode the unchanged audio master once."""
import argparse, hashlib, json, subprocess
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
def save(p,d):Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf8')
def run(args,log):
    p=subprocess.run([str(a) for a in args],capture_output=True,text=True,encoding='utf8',errors='replace')
    Path(log).write_text(p.stdout+'\n'+p.stderr,'utf8')
    if p.returncode:raise RuntimeError('Command failed: '+str(log))
    return p.stdout
def probe(p,out):return json.loads(run(['C:/ffmpeg/bin/ffprobe.exe','-v','error','-count_frames','-show_streams','-show_format','-of','json',p],out))
ap=argparse.ArgumentParser();ap.add_argument('--tag',default='v10-final');a=ap.parse_args()
if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in a.tag):raise ValueError('Invalid tag')
folder=ROOT/'tmp'/f'{a.tag}-segments';manifest=read(folder/'segments.json');lockpath=ROOT/manifest['productionLock'];lock=read(lockpath)
assert manifest['status']=='silent-complete' and sha(lockpath)==manifest['productionLockSHA256']
out=folder/'mux';out.mkdir(exist_ok=True)
frames=lock['frames'];fps=lock['fps'];cursor=0;paths=[];seams=[]
fields=['codec_name','width','height','pix_fmt','avg_frame_rate','time_base','color_space','color_transfer','color_primaries']
identity=None
for i,row in enumerate(manifest['segments']):
    p=Path(row['outputLocation']).resolve();assert p.is_relative_to(folder.resolve()) and sha(p)==row['sha256']
    assert row['start']==cursor and row['end']>=cursor
    streams=probe(p,out/f'segment-{i+1}.json')['streams'];assert len(streams)==1
    v=streams[0];current={k:v[k] for k in fields}
    if identity is not None:assert current==identity
    else:identity=current
    assert int(v['nb_read_frames'])==row['end']-row['start']+1
    if i:seams.append(row['start'])
    cursor=row['end']+1;paths.append(p)
assert cursor==frames
assert identity['width']==1920 and identity['height']==1080 and identity['avg_frame_rate']=='30/1'
for k in ['color_space','color_transfer','color_primaries']:assert identity[k]=='bt709'
master=Path(lock['bundle'])/'public/master.wav';assert sha(master)==manifest['masterSHA256']
playlist=out/'segments.ffconcat'
playlist.write_text('ffconcat version 1.0\n'+''.join("file '"+p.as_posix().replace("'","'\\''")+"'\n" for p in paths),'utf8')
silent=out/'silent.mp4';candidate=out/'candidate.mp4'
ff='C:/ffmpeg/bin/ffmpeg.exe'
run([ff,'-v','error','-y','-f','concat','-safe','0','-i',playlist,'-map','0:v:0','-an','-c:v','copy','-map_metadata','-1','-movflags','+faststart',silent],out/'concat.log')
run([ff,'-v','error','-y','-i',silent,'-i',master,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-map_metadata','-1','-movflags','+faststart',candidate],out/'mux.log')
info=probe(candidate,out/'candidate-probe.json');v=next(x for x in info['streams'] if x['codec_type']=='video');audio=next(x for x in info['streams'] if x['codec_type']=='audio')
assert len(info['streams'])==2 and int(v['nb_read_frames'])==frames and {k:v[k] for k in fields}==identity
assert audio['codec_name']=='aac' and audio['sample_rate']=='48000' and audio['channels']==2 and abs(float(audio['duration'])-frames/fps)<.05
def video_hash(p,name):return run([ff,'-v','error','-i',p,'-map','0:v:0','-c','copy','-f','streamhash','-hash','sha256','-'],out/(name+'.txt')).strip()
assert video_hash(silent,'silent-payload')==video_hash(candidate,'candidate-payload')
# Verify actual presentation times at every frame, including all segment seams.
times=run(['C:/ffmpeg/bin/ffprobe.exe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',candidate],out/'timestamps.json')
rows=json.loads(times)['frames'];assert len(rows)==frames
maxerr=max(abs(float(x['best_effort_timestamp_time'])-i/fps) for i,x in enumerate(rows));assert maxerr<2e-6
delivery=ROOT/'delivery/ShanghaiTower_1080p_v10.mp4'
assert not delivery.exists(),'Refuse overwriting a delivered V10; choose new delivery version explicitly'
digest=sha(candidate);candidate.replace(delivery);assert sha(delivery)==digest
report=dict(tag=a.tag,success=True,finished=datetime.now(timezone.utc).isoformat(),frames=[0,frames-1],fps=fps,durationSeconds=frames/fps,outputLocation=str(delivery),videoSHA256=digest,productionLock=str(lockpath),productionLockSHA256=sha(lockpath),bundleFingerprint=lock['bundleFingerprint'],masterSHA256=sha(master),seams=seams,allFramesDecoded=True,maxTimestampErrorSeconds=maxerr,videoCodecCopied=True,audioEncodedOnce=True,finalVisualAndAACAcceptancePending=True)
save(out/'mux-report.json',report);save(ROOT/'tmp/final-render-v10.json',report);save(ROOT/'tmp/final-render.json',report)
print(json.dumps(report,ensure_ascii=False))
