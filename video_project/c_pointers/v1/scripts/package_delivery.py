"""Allowlisted, QA-gated recovery ZIP. Default --plan writes no archive.

The unchanged movie renders from public/audio/master.wav; no private reference,
model, original music, node_modules junction, or previous render is packaged.
"""
from __future__ import annotations
import argparse,datetime as dt,hashlib,json,os,re,shutil,stat,subprocess,sys,uuid,zipfile,zlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE_ROOT='C语言指针_从地址找到原件_V1_工程'
TREE_RULES={
 'src':{'.ts','.tsx','.json'},'scripts':{'.py','.mjs','.c'},'docs':{'.md','.json'},
 'research':{'.md','.json','.txt','.pdf','.png','.html','.log'},
 'public/brand':{'.png','.svg'},'public/fonts':{'.woff2','.txt'},
 'public/papers':{'.png','.jpg'},'public/models':{'.glb'},'public/textures':{'.png','.jpg','.webp'},
 'work/audio/processing':{'.json'},
}
TEXT_EXT={'.ts','.tsx','.json','.mjs','.py','.c','.md','.txt','.srt','.html','.log'}
AUDIO_METADATA={
 'voice-generation.json','narration.json','captions.json','audio-qa.json','source-qa.json',
 'audio-delivery.json','asr-review.json','pause-audit.json','music-analysis.json',
 'music-arrangement.json','remote-transfer-verification.json','aac-preview-sync.json',
 'seed-overrides.json','speech-overrides.json','readback-review.md',
}
GATE_FILES=['work/qa/delivery.json','work/qa/av-sync.json','work/qa/motion.json','work/qa/visual-final.json']
REQUIRED=[
 'package.json','package-lock.json','tsconfig.json','src/index.tsx','src/Film.tsx','src/World.ts',
 'src/Models.ts','src/Camera.ts','src/Timeline.ts','src/story.json','src/narration.json',
 'src/captions-data.json','src/beats.json','public/audio/master.wav','public/brand/logo.png',
 'public/fonts/NotoSansSC.woff2','public/fonts/NotoSerifSC.woff2','public/fonts/OFL.txt',
 'public/papers/n1570-pointers.png','research/n1570.pdf','research/n1570-page.json',
 'research/fact-ledger.json','research/c-proof/evidence.json','research/c-proof/run.json',
 'scripts/verify_c_pointers.c','scripts/render.mjs','scripts/package_delivery.py',
 'docs/README-delivery.md','docs/audio-production.md','docs/cover-qa.json','docs/cover-layouts.json',
 'output/C语言指针_完整解说稿.md','output/C语言指针_字幕.srt','output/发布文案.md',
 'work/audio/voice-generation.json','work/audio/narration.json','work/audio/audio-qa.json',
 'work/audio/source-qa.json','work/audio/asr-review.json','work/audio/pause-audit.json',
]
LAYOUTS=('16x9','4x3','3x4','9x16')
PATTERNS=[
 ('api-key',re.compile(r'\bsk-(?:sp-)?[A-Za-z0-9_.-]{16,}')),
 ('private-key',re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
 ('credential-url',re.compile(r'https?://[^\s/:@]+:[^\s/@]+@')),
 ('aws-access-key',re.compile(r'\bAKIA[0-9A-Z]{16}\b')),
]
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf8',errors='replace')

def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
def reparse(p):
 s=Path(p).lstat();return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)
def safe(p):
 p=Path(p).absolute();rel=p.relative_to(ROOT.absolute());current=ROOT
 for part in rel.parts:
  current/=part
  if reparse(current):raise RuntimeError('Excluded junction/symlink: '+rel.as_posix())
 if not p.resolve().is_relative_to(ROOT.resolve()):raise RuntimeError('Input escapes current project')
 return p
def walk(relative,extensions):
 base=ROOT/relative
 if not base.exists():return
 safe(base)
 for directory,dirs,names in os.walk(base,followlinks=False):
  parent=Path(directory)
  dirs[:]=[n for n in dirs if n not in {'__pycache__','.git','node_modules'} and not reparse(parent/n)]
  for name in names:
   p=parent/name
   if p.suffix.lower() in extensions:yield safe(p)
def collect():
 selected=set()
 for relative,extensions in TREE_RULES.items():selected.update(walk(relative,extensions) or [])
 direct=['package.json','package-lock.json','tsconfig.json','public/audio/master.wav',
  'output/C语言指针_完整解说稿.md','output/C语言指针_字幕.srt','output/发布文案.md']
 for layout in LAYOUTS:
  direct.extend([f'output/covers/C语言指针_封面_{layout}.jpg',f'output/covers/artwork/{layout}.blend',
   f'output/covers/artwork/{layout}.png',f'output/covers/artwork/{layout}-source.json'])
 direct.extend(['output/covers/四比例预览.jpg','output/covers/手机缩略图检查.jpg'])
 direct.extend('work/audio/'+name for name in AUDIO_METADATA)
 for name in direct:
  if (ROOT/name).is_file():selected.add(safe(ROOT/name))
 cueids=[c['id'] for c in load('src/story.json')['cues']]
 for stage in ('raw','clean'):
  for ident in cueids:
   p=ROOT/f'work/audio/{stage}/{ident}.wav'
   if p.is_file():selected.add(safe(p))
 for p in (ROOT/'work/qa').glob('*.json'):
  if not p.name.startswith('recovery-'):selected.add(safe(p))
 # Raw+clean already contain every full sentence. Derived listening excerpts and
 # their excerpt-only manifest are excluded together, avoiding dangling paths.
 selected={p for p in selected if not any(token in p.name.lower() for token in ('draft','candidate','before-'))}
 for p in selected:
  rel=p.relative_to(ROOT)
  if any(x.startswith('.') or x.lower() in {'secrets','credentials','node_modules','bundle','remote-return','protected','prior','render-temp'} for x in rel.parts):
   raise RuntimeError('Forbidden selected path: '+rel.as_posix())
  if 'clone-reference' in p.name.lower() or p.suffix.lower() in {'.mp3','.safetensors','.exe','.obj'}:
   raise RuntimeError('Private/source/binary input excluded: '+rel.as_posix())
 required=REQUIRED+[f'work/audio/{s}/{i}.wav' for s in ('raw','clean') for i in cueids]
 for layout in LAYOUTS:required.extend([f'output/covers/C语言指针_封面_{layout}.jpg',f'output/covers/artwork/{layout}.blend',f'output/covers/artwork/{layout}.png'])
 missing=[r for r in required if ROOT/r not in selected]
 if missing:raise RuntimeError('Missing recovery inputs: '+', '.join(missing))
 return sorted(selected,key=lambda p:p.relative_to(ROOT).as_posix())
def security_scan(paths):
 findings=[]
 for p in paths:
  if p.suffix.lower() not in TEXT_EXT:continue
  text=p.read_text(encoding='utf8',errors='replace')
  for name,pattern in PATTERNS:
   if pattern.search(text):findings.append({'file':p.relative_to(ROOT).as_posix(),'pattern':name})
 if findings:raise RuntimeError('Credential-like text blocks archive (matched text withheld): '+json.dumps(findings,ensure_ascii=False))
 return {'textFiles':sum(p.suffix.lower() in TEXT_EXT for p in paths),'findings':0,
  'scope':'Only allowlisted project inputs; no global credentials/settings discovery'}
def asset_metadata(relative):
 if relative=='public/audio/master.wav':
  return {'type':'mixed-master','origin':'New user-reference narration and user-selected Zella Day - Hypnotic',
   'license':'Contains user-provided commercial recording; publication rights not independently verified.',
   'evidence':'work/audio/audio-qa.json'}
 if relative.startswith('work/audio/raw/') or relative.startswith('work/audio/clean/'):
  return {'type':'narration-cue','origin':'User Qwen3-TTS-0.6B and private rainbow鱼 reference; full new sentences',
   'license':'Personal voice synthesis for this requested project; no general voice redistribution license asserted.',
   'evidence':'work/audio/voice-generation.json'}
 if relative.startswith('public/fonts/'):
  return {'type':'font','origin':'Noto Sans SC / Noto Serif SC','license':'SIL Open Font License 1.1; bundled public/fonts/OFL.txt'}
 if relative.startswith('public/brand/'):
  return {'type':'brand','origin':'User logo asset, C:/Users/zju/Desktop/logo/logo.png',
   'license':'User-provided branding; no public reuse license asserted.','evidence':'docs/cover-layouts.json'}
 if relative=='research/n1570.pdf' or relative=='public/papers/n1570-pointers.png':
  return {'type':'standard-source','origin':'https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf',
   'license':'Copyright ISO/IEC. Publicly accessible committee draft; not assumed public domain.',
   'evidence':'research/n1570-page.json'}
 if relative.startswith('output/covers/'):
  return {'type':'cover-art','origin':'Original procedural Blender illustration and project typography',
   'license':'Created for this user project; third-party logo/font rights remain with their owners.',
   'evidence':'docs/cover-layouts.json and docs/cover-qa.json'}
 if relative.startswith('research/'):
  return {'type':'research-evidence','origin':'C standard, CS50, cppreference, Stack Exchange, or original compiled verification; see source records',
   'license':'Third-party source material retains its original terms; research access does not grant a blanket redistribution license.',
   'evidence':'docs/story-research.md'}
 return None
def audit_sources():
 narrative=load('src/narration.json');ledger=load('work/audio/voice-generation.json');ids=[c['id'] for c in narrative['cues']]
 for cue in narrative['cues']:
  ident=cue['id'];raw=ROOT/f'work/audio/raw/{ident}.wav';clean=ROOT/cue['audio']
  if sha(raw)!=ledger[ident]['sha256'] or sha(clean)!=cue['sha256']:raise RuntimeError('Audio source hash changed: '+ident)
  if ledger[ident]['text']!=cue['spokenText']:raise RuntimeError('Audio transcript changed: '+ident)
 aq=load('work/audio/audio-qa.json');master=next(x for x in aq['files'] if x['path']=='public/audio/master.wav')
 if sha(ROOT/master['path'])!=master['sha256']:raise RuntimeError('Final master differs from measured audio')
 for row in load('docs/cover-qa.json')['files']:
  if sha(ROOT/row['file'])!=row['sha256']:raise RuntimeError('Cover changed after inspection: '+row['file'])
 page=load('research/n1570-page.json')
 if sha(ROOT/'research/n1570.pdf')!=page['pdfSha256'] or sha(ROOT/page['image'])!=page['imageSha256']:
  raise RuntimeError('Standard source hash changed')
 caps=load('src/captions-data.json')['cues']
 def stamp(fr):
  m=round(fr/30*1000);return f'{m//3600000:02d}:{m//60000%60:02d}:{m//1000%60:02d},{m%1000:03d}'
 expected='\n\n'.join(f"{i+1}\n{stamp(c['startFrame'])} --> {stamp(c['endFrame'])}\n{c['text']}" for i,c in enumerate(caps))+'\n'
 if (ROOT/'output/C语言指针_字幕.srt').read_text(encoding='utf-8-sig')!=expected:raise RuntimeError('Published SRT differs from final captions')
 narration_md=(ROOT/'output/C语言指针_完整解说稿.md').read_text(encoding='utf8')
 if any(c['text'] not in narration_md for c in narrative['cues']):raise RuntimeError('Published script is incomplete/outdated')
 return {'narrationCues':len(ids),'rawAndCleanHashesVerified':True,'masterHashVerified':True,'coverHashesVerified':True,'standardHashesVerified':True,'publishedSrtAndScriptVerified':True}
def check_final_qa():
 missing=[r for r in GATE_FILES if not (ROOT/r).is_file()]
 if missing:raise RuntimeError('Final QA incomplete: '+', '.join(missing))
 delivery,sync,motion,visual=[load(r) for r in GATE_FILES]
 if any(d.get('passed') is not True for d in (delivery,sync,motion)):raise RuntimeError('Delivery/sync/motion QA not passed')
 if delivery.get('issues') or motion.get('issues') or sync.get('failures'):raise RuntimeError('QA issues remain')
 video=Path(delivery['video']);video=video if video.is_absolute() else ROOT/video
 sv=Path(sync['video']);sv=sv if sv.is_absolute() else ROOT/sv
 safe(video)
 if video.resolve()!=sv.resolve():raise RuntimeError('QA video paths disagree')
 st=video.stat();digest=sha(video)
 if digest!=delivery['sha256'] or st.st_size!=delivery['bytes'] or st.st_size!=sync['fileBytes'] or st.st_mtime_ns!=sync['fileMtimeNs']:
  raise RuntimeError('Final video changed after QA')
 if sha(ROOT/'public/audio/master.wav')!=sync['masterSha256']:raise RuntimeError('Master changed after sync QA')
 for report in (delivery,motion):
  for relative,h in report.get('sourceHashes',{}).items():
   if sha(ROOT/relative)!=h:raise RuntimeError('Render source changed after QA: '+relative)
 if visual.get('representativeEncodedReviewCompleted') is not True or visual.get('videoSha256')!=digest or visual.get('blockers')!=[]:
  raise RuntimeError('Current encoded visual review missing or has blockers')
 if load('docs/cover-qa.json').get('passed') is not True:raise RuntimeError('Cover QA has not passed')
 return {'passed':True,'videoSha256':digest,'videoBytes':st.st_size,'reports':GATE_FILES,
  'limits':'Full decode, source hashes, numeric motion, three-window AAC sync and recorded representative visual review. Not a claim of uninterrupted viewing or subjective audio listening.'}
def estimate(p):
 n=p.stat().st_size
 if n<=196608:return len(zlib.compress(p.read_bytes(),6))+180
 with p.open('rb') as f:
  parts=[]
  for at in (0,(n-65536)//2,n-65536):f.seek(at);parts.append(f.read(65536))
 sample=b''.join(parts);return int(n*len(zlib.compress(sample,6))/len(sample))+180
def verify_source(archive):
 node=shutil.which('node');tsc=ROOT/'node_modules/typescript/bin/tsc'
 if not node or not tsc.is_file():raise RuntimeError('Existing project TypeScript required for restored-source check')
 parent=ROOT/'work/recovery-checks';parent.mkdir(exist_ok=True);safe(parent)
 target=parent/('verify-'+uuid.uuid4().hex);target.mkdir();safe(target)
 with zipfile.ZipFile(archive) as z:
  for member in z.infolist():
   rel=Path(member.filename)
   if rel.is_absolute() or '..' in rel.parts or not rel.parts or rel.parts[0]!=ARCHIVE_ROOT or stat.S_ISLNK(member.external_attr>>16):raise RuntimeError('Unsafe ZIP entry')
   if not (target/rel).resolve().is_relative_to(target.resolve()):raise RuntimeError('ZIP entry escapes verification directory')
  z.extractall(target)
 project=target/ARCHIVE_ROOT
 result=subprocess.run([node,str(tsc),'--noEmit','-p',str(project/'tsconfig.json')],cwd=ROOT,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=180)
 report={'passed':result.returncode==0,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,
  'dependencyScope':'Current lock-compatible ancestor node_modules used; not a clean npm install.',
  'restoredFiles':sum(1 for p in target.rglob('*') if p.is_file())}
 if result.returncode:raise RuntimeError('Restored-source typecheck failed; retained '+str(target)+' '+result.stdout)
 # Delete only this newly created, resolved, junction-free verification directory.
 if not target.resolve().is_relative_to(parent.resolve()) or target.resolve()==parent.resolve():raise RuntimeError('Unsafe verification cleanup')
 for directory,dirs,names in os.walk(target,followlinks=False):
  if any(reparse(Path(directory)/n) for n in dirs+names):raise RuntimeError('Unexpected junction in restored source')
 shutil.rmtree(target);report['scopedVerificationDirectoryRemoved']=not target.exists();return report
def build(output,paths,security,source_audit,gate):
 if output.suffix.lower()!='.zip' or not output.resolve().is_relative_to((ROOT/'output').resolve()):raise RuntimeError('Package must be a ZIP in this project output')
 if output.exists() or output.with_suffix('.zip.partial').exists():raise RuntimeError('Output exists; choose another name, no overwrite')
 output.parent.mkdir(exist_ok=True,parents=True);safe(output.parent)
 inventory=[];assets=[]
 for p in paths:
  st=p.stat();rel=p.relative_to(ROOT).as_posix();entry={'path':rel,'bytes':st.st_size,'mtimeNs':st.st_mtime_ns,'sha256':sha(p)};inventory.append(entry)
  metadata=asset_metadata(rel)
  if metadata:assets.append({**entry,**metadata})
 music=load('work/audio/music-analysis.json');covers=load('docs/cover-layouts.json')
 provenance={'assets':assets,'externalDependencies':[
  {'path':'D:/CloudMusic/Zella Day - Hypnotic.mp3','sha256':music['sourceSha256'],'purpose':'Rebuilding changed music mix only; unchanged render uses packaged master','included':False,'license':'User-provided commercial music; publication permission not independently verified'},
  {'path':'D:/python_project/tts','purpose':'Regenerating changed narration only; raw/clean and final master are packaged','included':False,'privateReferenceCopied':False},
  {'path':covers['fontSource'],'sha256':covers['fontSha256'],'purpose':'Rebuilding cover typography','included':False,'license':'Noto Sans SC, SIL OFL; browser subset and OFL bundled'},
  {'path':'C:/Windows/Fonts/consolab.ttf','purpose':'Rebuilding Blender cover lettering','included':False,'license':'Microsoft Windows font; not redistributed'},
 ],'subjectiveListeningChecked':False}
 manifest={'format':1,'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),'rootFolder':ARCHIVE_ROOT,'qaGate':gate,
  'sourceAudit':source_audit,'securityScan':security,'fileCount':len(inventory),'uncompressedBytes':sum(e['bytes'] for e in inventory),'entries':inventory,
  'excluded':['node_modules and every symlink/junction','work/bundle/render-temp and preview renders','original commercial music MP3','private reference voice and model weights','duplicate master/narration/score/premaster WAVs','remote-return copies and archives','executables and compiler objects','superseded cover drafts'],
  'recovery':'npm ci; npm run check; npm run render. Included public/audio/master.wav removes any need for private voice or source song during unchanged rendering.'}
 extra={'恢复清单.json':manifest,'资产来源许可与SHA256.json':provenance}
 extra_bytes={k:(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf8') for k,v in extra.items()}
 partial=output.with_suffix('.zip.partial')
 with zipfile.ZipFile(partial,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
  for p,e in zip(paths,inventory):
   z.write(p,f'{ARCHIVE_ROOT}/{e["path"]}');st=p.stat()
   if st.st_size!=e['bytes'] or st.st_mtime_ns!=e['mtimeNs']:raise RuntimeError('Input changed during archive: '+e['path'])
  for name,data in extra_bytes.items():z.writestr(f'{ARCHIVE_ROOT}/{name}',data)
 with zipfile.ZipFile(partial) as z:
  if len(z.namelist())!=len(inventory)+len(extra) or len(z.namelist())!=len(set(z.namelist())):raise RuntimeError('Archive entry count/duplicates')
  for e in inventory:
   h=hashlib.sha256();n=0
   with z.open(f'{ARCHIVE_ROOT}/{e["path"]}') as f:
    for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk);n+=len(chunk)
   if h.hexdigest()!=e['sha256'] or n!=e['bytes']:raise RuntimeError('Archive SHA mismatch: '+e['path'])
  for name,data in extra_bytes.items():
   if z.read(f'{ARCHIVE_ROOT}/{name}')!=data:raise RuntimeError('Manifest changed')
 recovery=verify_source(partial);partial.rename(output);digest=sha(output)
 report={'archive':str(output),'sha256':digest,'bytes':output.stat().st_size,'files':len(inventory)+len(extra),'allCRCAndSHA256Verified':True,'qaGate':gate,'restoredSourceCompile':recovery}
 output.with_suffix('.sha256').write_text(f'{digest}  {output.name}\n',encoding='utf8')
 output.with_suffix('.inventory.json').write_bytes(extra_bytes['恢复清单.json'])
 output.with_suffix('.assets.json').write_bytes(extra_bytes['资产来源许可与SHA256.json'])
 output.with_suffix('.verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 return report
def main():
 p=argparse.ArgumentParser(description=__doc__);a=p.add_mutually_exclusive_group();a.add_argument('--plan',action='store_true');a.add_argument('--create',action='store_true')
 p.add_argument('--output',type=Path,default=ROOT/'output/C语言指针_V1_可重新渲染工程.zip');args=p.parse_args()
 paths=collect();security=security_scan(paths);source_audit=audit_sources()
 if not args.create:
  print(json.dumps({'mode':'read-only plan; no archive written','files':len(paths),'uncompressedBytes':sum(p.stat().st_size for p in paths),'estimatedZipBytes':sum(estimate(p) for p in paths),
   'security':security,'sourceAudit':source_audit,'finalQAPresent':{p:(ROOT/p).is_file() for p in GATE_FILES},'output':str(args.output)},ensure_ascii=False,indent=2));return
 gate=check_final_qa();print(json.dumps(build(args.output.resolve(),paths,security,source_audit,gate),ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except (OSError,RuntimeError,ValueError,KeyError,zipfile.BadZipFile) as e:print(str(e),file=sys.stderr);raise SystemExit(1)
