"""Package the actual reviewed V8 export without overwriting earlier releases."""
from pathlib import Path
import hashlib,json,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
render=(ROOT/sys.argv[1]).resolve();qa_path=(ROOT/sys.argv[2]).resolve()
assert render.is_relative_to(ROOT) and qa_path.is_relative_to(ROOT)
result=json.loads((render/'result.json').read_text('utf8'));qa=json.loads(qa_path.read_text('utf8'))
assert result['mode']=='full' and result['fullDecode']
assert qa['releaseApproved'] is True and qa['videoSHA256']==result['videoSHA256']
assert qa['audioVerified'] is True and qa['sourceStable'] is True
video=ROOT/result['video'];assert sha(video)==result['videoSHA256']
for name,digest in result['hashes'].items():assert sha(ROOT/name)==digest,f'Changed source: {name}'
delivery=ROOT/'delivery';delivery.mkdir(exist_ok=True)
stem='如何科学减肥_从身体调节说起_V8'
target=delivery/(stem+'_1080p.mp4')
if target.exists():assert sha(target)==result['videoSHA256'],'Do not overwrite a different V8'
else:shutil.copy2(video,target)
assert sha(target)==result['videoSHA256']
tl=json.loads((render/'frozen/src/timeline.json').read_text('utf8'))
def stamp(frame):
 ms=round(frame*1000/tl['fps']);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{s:02},{ms:03}'
subtitle=delivery/(stem+'.srt')
subtitle.write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(tl['captions']))+'\n','utf8')
shutil.copy2(render/'chapters.ffmetadata',delivery/(stem+'.ffmetadata'))
covers=delivery/'封面-V8';covers.mkdir(exist_ok=True)
for ratio in ['16x9','3x4','4x3','9x16']:
 p=ROOT/f'research/revision-v8/covers/cardiometabolic-cover-{ratio}.jpg'
 shutil.copy2(p,covers/f'如何科学减肥_身体调节_{ratio}.jpg')
manifest={'version':'v8','title':'如何科学减肥？从身体调节说起','video':str(target),'videoSHA256':sha(target),'durationSeconds':result['frames']/result['fps'],'frames':result['frames'],'fps':result['fps'],'renderResult':str(render/'result.json'),'sourceLock':str(render/'source-lock.json'),'qa':str(qa_path),'audioSHA256':result['masterSHA256'],'timelineSHA256':result['timelineSHA256'],'subtitles':str(subtitle),'subtitleSHA256':sha(subtitle),'covers':[{'path':str(p),'sha256':sha(p)} for p in sorted(covers.glob('*.jpg'))],'v7Preserved':(delivery/'科学减重与三高_修订V7_1080p.mp4').exists()}
(delivery/'latest-v8.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
