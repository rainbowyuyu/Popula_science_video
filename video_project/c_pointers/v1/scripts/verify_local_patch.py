"""Confirm a replacement closed GOP did not alter any other decoded frame."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def read(name):
 rows=[]
 for line in (ROOT/'work/qa'/name).read_text().splitlines():
  if line and not line.startswith('#'):rows.append([v.strip() for v in line.split(',')])
 return rows
old=read('before-null-fix.framemd5');new=read('after-null-fix.framemd5')
assert len(old)==len(new)==9585,(len(old),len(new))
changed=[i for i,(a,b) in enumerate(zip(old,new)) if a[-1]!=b[-1]]
unexpected=[i for i in changed if not 7500<=i<7750]
timestamps=[i for i,(a,b) in enumerate(zip(old,new)) if a[:-1]!=b[:-1]]
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
report={'passed':not unexpected and not timestamps,'frames':9585,'replacedFrameRange':[7500,7749],
 'changedDecodedFrameCount':len(changed),'changedRange':[min(changed),max(changed)] if changed else [],
 'unexpectedChangesOutsideReplacement':unexpected,'timestampMismatches':timestamps,
 'sourceVideoSha256':sha(ROOT/'output/C语言指针_从地址找到原件_1080p.mp4'),
 'fixedCandidateSha256':sha(ROOT/'work/final-fixed.mp4'),
 'method':'Every decoded full-resolution YUV frame MD5 compared; replacement GOP re-encoded from final source, all other GOPs copied; original frozen master newly muxed.'}
(ROOT/'work/qa/local-patch.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2));assert report['passed']
