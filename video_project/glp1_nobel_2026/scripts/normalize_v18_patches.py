"""Complete the known BT.709 output metadata; copy every coded video slice."""
from pathlib import Path
import argparse, hashlib, json, subprocess

ROOT=Path(__file__).resolve().parents[1]
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def run(a):return subprocess.run(a,capture_output=True,encoding='utf8',errors='replace',check=True).stdout
ap=argparse.ArgumentParser();ap.add_argument('--plan',required=True);ap.add_argument('--out-plan',required=True);a=ap.parse_args()
planpath=(ROOT/a.plan).resolve();destplan=(ROOT/a.out_plan).resolve()
assert planpath.is_relative_to(ROOT) and destplan.is_relative_to(ROOT)
plan=json.loads(planpath.read_text('utf8'))
for row in plan['patches']:
 src=(ROOT/row['path']).resolve();dst=src.with_name(src.stem+'.bt709.mp4')
 marker=src.with_suffix('.json');outmarker=dst.with_suffix('.json')
 source=json.loads(marker.read_text('utf8'));assert source['sha256']==sha(src)
 command=['ffmpeg','-hide_banner','-nostdin','-v','error','-n','-i',str(src),'-map','0:v:0','-an','-c:v','copy','-map_metadata','-1','-map_chapters','-1','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0','-avoid_negative_ts','disabled','-video_track_timescale','90000','-movflags','+faststart+write_colr',str(dst)]
 if outmarker.exists():
  saved=json.loads(outmarker.read_text('utf8'));assert saved['sha256']==sha(dst) and saved['metadataNormalization']['inputSHA256']==sha(src)
 else:
  assert not dst.exists();run(command)
  probe=json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_streams','-of','json',str(dst)]))['streams'][0]
  assert all(probe[k]=='bt709' for k in ['color_space','color_primaries','color_transfer']) and probe['color_range']=='tv'
  assert int(probe['nb_frames'])==row['end']-row['start']+1
  saved={**source,'path':dst.relative_to(ROOT).as_posix(),'sha256':sha(dst),'metadataNormalization':{'input':src.relative_to(ROOT).as_posix(),'inputSHA256':sha(src),'originalMarkerSHA256':sha(marker),'operation':'H.264 SPS/container BT.709 primaries and transfer metadata completion; no video re-encode','command':command}}
  outmarker.write_text(json.dumps(saved,ensure_ascii=False,indent=2),'utf8')
 row['path']=dst.relative_to(ROOT).as_posix();row['marker']=outmarker.relative_to(ROOT).as_posix()
 row['sha256']=sha(dst)
destplan.write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'normalizedPatches':len(plan['patches']),'plan':str(destplan)},ensure_ascii=False))
