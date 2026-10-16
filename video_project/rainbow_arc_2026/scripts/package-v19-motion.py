from __future__ import annotations

"""Create a hash-verified delta package after V19Motion inputs are frozen.

Defaults to read-only preflight. Large assets stay at their existing C/D paths
and are referenced by logical path, absolute path, byte size and SHA256.
No existing source, package, or audit is overwritten or removed.
"""

import argparse
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'work/output-root-v19-motion.json').read_text(encoding='utf-8'))
OUTPUT_ROOT=Path(CONFIG['outputRoot'])

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for data in iter(lambda:f.read(8*1024*1024),b''):h.update(data)
 return h.hexdigest()
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def absolute(p):return p.resolve() if p.is_absolute() else (ROOT/p).resolve()
def logical_path(file):
 parts=file.replace('\\','/').split('/')
 if parts[0]=='public' and len(parts)>1 and parts[1] in CONFIG.get('publicOverrides',{}):return Path(CONFIG['publicOverrides'][parts[1]]).joinpath(*parts[2:]).resolve()
 return (ROOT/file).resolve()
def new_json(path,data):
 with path.open('x',encoding='utf-8',newline='\n') as f:json.dump(data,f,ensure_ascii=False,indent=2);f.write('\n')

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--source-audit',type=Path,required=True)
 ap.add_argument('--render-record',type=Path)
 ap.add_argument('--extra',type=Path,action='append',default=[],help='Additional small project source/evidence files; each <= 16 MiB')
 ap.add_argument('--output-directory',type=Path,default=OUTPUT_ROOT/'delivery')
 ap.add_argument('--execute',action='store_true')
 args=ap.parse_args()
 audit_path=absolute(args.source_audit);audit=read(audit_path)
 if audit.get('version')!='V19Motion' or not audit.get('passed') or not audit.get('sourceHashes'):raise RuntimeError('Packaging requires a passed frozen V19Motion audit')
 audit_hash=sha(audit_path)
 rows=audit['sourceHashes']
 members={};references=[]
 for row in rows:
  source=logical_path(row['file'])
  if not row.get('absolutePath') or Path(row['absolutePath']).resolve()!=source:raise RuntimeError('Mapping mismatch: '+row['file'])
  if not source.is_file() or sha(source)!=row['sha256']:raise RuntimeError('Frozen input differs: '+row['file'])
  logical=row['file'];size=source.stat().st_size
  # Include active source, small generated model sources and provenance. Media
  # frame sequences, HDR, audio and inherited binary assets stay referenced.
  include=(not logical.startswith('public/')) or (logical.startswith('public/assets_v19_motion/') and size<=16*1024**2 and source.suffix.lower() in {'.glb','.blend','.json','.md','.txt'})
  if include:members[logical]=source
  else:references.append({**row,'bytes':size})
 for relative in ['scripts/qa-delivery-v19-motion.py','scripts/package-v19-motion.py']:
  members[relative]=ROOT/relative
 for extra in args.extra:
  source=absolute(extra)
  if not source.is_file() or source.stat().st_size>16*1024**2:raise RuntimeError('Extra must be a small existing file: '+str(source))
  try:name=source.relative_to(ROOT).as_posix()
  except ValueError:name='recovery/extra/'+source.name
  if name in members and members[name]!=source:raise RuntimeError('Archive path collision: '+name)
  members[name]=source
 members['recovery/audit.snapshot.json']=audit_path
 render=None
 if args.render_record:
  render_path=absolute(args.render_record);render=read(render_path)
  if render.get('version')!='V19Motion' or render.get('status')!='completed' or render.get('preview'):raise RuntimeError('Optional render record must be completed full V19Motion delivery')
  if render.get('sourceAuditSHA256')!=audit_hash:raise RuntimeError('Render audit differs from package audit')
  members['recovery/render.json']=render_path
  for key,name in [('sourceSnapshot','inputs.snapshot.json'),('sourceAudit','render-audit.snapshot.json')]:
   if render.get(key):members['recovery/'+name]=Path(render[key])
  for filename in ['audio-finalization.json','qa-delivery.json']:
   p=render_path.parent/filename
   if p.is_file():members['recovery/'+filename]=p
 member_rows=[{'file':name,'source':str(p),'bytes':p.stat().st_size,'sha256':sha(p)} for name,p in members.items()]
 summary={'version':'V19Motion','mode':'package' if args.execute else 'read-only preflight','sourceAuditSHA256':audit_hash,
          'projectAndEvidenceFiles':len(members),'referencedLargeAssets':len(references),'notStandalone':True,
          'renderStatus':render.get('status') if render else 'not supplied','deletionPerformed':False}
 if not args.execute:
  print(json.dumps(summary,ensure_ascii=True,indent=2));return
 destination=absolute(args.output_directory);destination.mkdir(parents=True,exist_ok=True)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
 package_name='V19_动作与转场优化_源码增量包_'+stamp
 manifest={**summary,'createdUTC':datetime.now(timezone.utc).isoformat(),'members':member_rows,'references':references,
           'restoration':'Restore into a copy of the original project and retain all referenced assets. Public assets may be on C while original dependencies remain on D; work/output-root-v19-motion.json records these mappings. This is not a standalone project.'}
 manifest_path=destination/(package_name+'.manifest.json');new_json(manifest_path,manifest)
 package=destination/(package_name+'.zip')
 with zipfile.ZipFile(package,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,p in members.items():z.write(p,name)
  z.write(manifest_path,'recovery/package-manifest.json')
 with zipfile.ZipFile(package) as z:
  if z.testzip() is not None:raise RuntimeError('ZIP CRC failure')
  for row in member_rows:
   if hashlib.sha256(z.read(row['file'])).hexdigest()!=row['sha256']:raise RuntimeError('Archive hash failure: '+row['file'])
 for row in member_rows:
  if sha(Path(row['source']))!=row['sha256']:raise RuntimeError('Input changed during packaging: '+row['file'])
 for row in references:
  if sha(Path(row['absolutePath']))!=row['sha256']:raise RuntimeError('Referenced asset changed during packaging: '+row['file'])
 verification={**summary,'package':str(package),'bytes':package.stat().st_size,'sha256':sha(package),'CRCChecked':True,
               'memberSHA256Checked':True,'sourceAndReferencedAssetHashesUnchanged':True,'memberCount':len(member_rows)+1,
               'manifest':str(manifest_path),'fullPlaybackClaimed':False,'humanListeningClaimed':False}
 new_json(destination/(package_name+'.verification.json'),verification)
 print(json.dumps(verification,ensure_ascii=True,indent=2))

if __name__=='__main__':main()
