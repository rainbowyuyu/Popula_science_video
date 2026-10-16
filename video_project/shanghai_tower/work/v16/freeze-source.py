from pathlib import Path
import json,hashlib,datetime,zipfile
r=Path.cwd();out=r/'research/qa/v16';out.mkdir(parents=True,exist_ok=True)
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
registry=[]
for aspect,name in [('16:9','audio-timeline.json'),('9:16','audio-timeline-vertical.json')]:
 t=json.loads((r/'src/v16'/name).read_text(encoding='utf-8-sig'))
 for i,x in enumerate(t['sceneSegments']):
  next=t['sceneSegments'][i+1] if i+1<len(t['sceneSegments']) else None
  delta=next['sourceStart']-min(x['sourceEnd']+1,x['sourceStart']+x['voiceEnd']-x['start']) if next else 0
  gap=next['start']-x['voiceEnd'] if next else x['end']-x['voiceEnd']
  registry.append(dict(id=x['id'],aspect=aspect,startFrame=x['start'],endFrame=x['end'],sourceStart=x['sourceStart'],sourceEnd=x['sourceEnd'],camera='V16CameraRig: original-cue orbit with aspect-specific framing',section=x['section'],transition='sky-whip-hidden-join' if delta>max(80,6*gap) else 'continuous-cue-travel',dataMode='solver+illustrative',voiceSpeed=1))
(out/'shot-registry.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2),encoding='utf-8')
files=[p for p in (r/'src').rglob('*') if p.is_file() and p.suffix in ['.ts','.tsx','.json']]
files += [r/'scripts/render-v16.mjs',r/'scripts/renderer-options.mjs',r/'scripts/tag-v16-color.mjs',r/'package.json',r/'package-lock.json']
files += [p for p in (r/'public').rglob('*') if p.is_file()]
files += [r/'tsconfig.json',r/'work/v16/vendor/waterpro-local.js']
files += [p for p in (r/'work/v16/assets').glob('*.blend')]
files=[p for p in files if p.is_file()]
lock=json.loads((out/'production-lock.json').read_text(encoding='utf-8-sig'))
check={p:sha(r/p)==h for p,h in lock['protected'].items()}
assert all(check.values()),check
record={'version':'V16','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'render-candidate','protectedOriginalsMatch':check,'files':{p.relative_to(r).as_posix():sha(p) for p in files}}
(out/'source-freeze.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'sources':len(files),'protected':check},ensure_ascii=False))

