"""Package an explicitly reviewed V7 export; never overwrite V6's marker.

Usage: python -X utf8 scripts/package_v7.py <render-directory> <release-qa.json>
The QA document is authored after actual inspection, not generated as a pass.
"""
from pathlib import Path
import hashlib,json,shutil,sys

ROOT=Path(__file__).resolve().parents[1]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
render=(ROOT/sys.argv[1]).resolve()
qa_path=(ROOT/sys.argv[2]).resolve()
assert render.is_relative_to(ROOT) and qa_path.is_relative_to(ROOT)
result=json.loads((render/'result.json').read_text('utf8'))
qa=json.loads(qa_path.read_text('utf8'))
assert result['mode']=='full' and result['fullDecode']
assert qa['releaseApproved'] is True and qa['videoSHA256']==result['videoSHA256']
assert qa['audioVerified'] is True and qa['sourceStable'] is True
video=ROOT/result['video'];assert sha(video)==result['videoSHA256']
for name,digest in result['hashes'].items():
 assert sha(ROOT/name)==digest,f'Changed source: {name}'
delivery=ROOT/'delivery';delivery.mkdir(exist_ok=True)
target=delivery/'科学减重与三高_修订V7_1080p.mp4'
if target.exists():assert sha(target)==result['videoSHA256'],'Do not overwrite another V7 output'
else:shutil.copy2(video,target)
assert sha(target)==result['videoSHA256']
shutil.copy2(ROOT/'delivery/GLP1_V5.srt',delivery/'科学减重与三高_修订V7.srt')
shutil.copy2(render/'chapters.ffmetadata',delivery/'科学减重与三高_修订V7.ffmetadata')
manifest={'version':'v7','video':str(target),'videoSHA256':sha(target),'durationSeconds':result['frames']/result['fps'],'frames':result['frames'],'fps':result['fps'],'renderResult':str(render/'result.json'),'sourceLock':str(render/'source-lock.json'),'qa':str(qa_path),'audioSHA256':result['masterSHA256'],'timelineSHA256':result['timelineSHA256'],'v6Preserved':True}
(delivery/'latest-v7.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
