"""Hash and verify an incremental recovery archive, then remove exact reproducible intermediates."""
from pathlib import Path
import json,zipfile,os
from assemble import ROOT,OUT,WORK,sha

q=json.loads((ROOT/'work/v06/qa/report.json').read_text(encoding='utf8'))
assert q['passed'] and q['videoSha256']==sha(OUT/'Roadster_倒挂与飞行翻滚_1080p.mp4')
files=set()
def addtree(relative,extensions=None):
    for p in (ROOT/relative).rglob('*'):
        if p.is_file() and '__pycache__' not in p.parts and (extensions is None or p.suffix in extensions):files.add(p)
addtree('source/v06/scripts');files.add(ROOT/'source/v06/README.md')
addtree('source/v06/public/audio')
addtree('source/v06/work/audio',{'.json','.log','.mp3'})
addtree('assets/v06');addtree('subtitles/v06');addtree('research/iterations/v06')
addtree('work/v06/qwen',{'.py','.md','.txt','.json','.mp4','.jpg'})
addtree('work/v06/qa',{'.json','.log','.jpg'})
addtree('work/v06/assembly',{'.json','.txt','.log'})
addtree('output/v06',{'.json','.md','.html','.jpg'})
files={p for p in files if p.name not in ['recovery-manifest.json','package-report.json','cleanup.json']}
manifest={'version':'v06-incremental','baseVideo':{'path':'output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4','sha256':sha(ROOT/'output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4')},
    'baseSourceArchive':{'path':'output/v05/Roadster_v05_可恢复源码.zip','sha256':sha(ROOT/'output/v05/Roadster_v05_可恢复源码.zip')},
    'files':[{'path':str(p.relative_to(ROOT)).replace('\\','/'),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(files)]}
mp=OUT/'recovery-manifest.json';mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8');files.add(mp)
archive=OUT/'Roadster_v06_增量恢复包.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as z:
    for p in sorted(files):z.write(p,p.relative_to(ROOT))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.infolist())==len(files)
    for f in manifest['files']:
        import hashlib
        assert hashlib.sha256(z.read(f['path'])).hexdigest()==f['sha256']
report={'archive':archive.name,'sha256':sha(archive),'files':len(files),'crcAndHashesVerified':True,'bytes':archive.stat().st_size}
(OUT/'package-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')

# Explicit candidates, all recreated from frozen master/assets/scripts. Never walk shared dependencies.
candidates=[WORK/'body-normalized.mp4',WORK/'intro-picture.mp4',WORK/'timing-probe.mp4']
A=ROOT/'source/v06/work/audio'
candidates += [A/n for n in ['music-source-decoded.wav','music-arranged.wav','music-filtered.wav','score-ducked.wav','mix-premaster.wav','master-aac-precheck.m4a']]
root=ROOT.resolve();deleted=[]
for p in candidates:
    if not p.exists():continue
    target=p.resolve()
    if not target.is_relative_to(root) or p.is_symlink() or not p.is_file():raise RuntimeError('Unsafe cleanup candidate')
    for parent in p.parents:
        if parent==root:break
        if parent.is_symlink() or (hasattr(parent,'is_junction') and parent.is_junction()):raise RuntimeError('Linked cleanup ancestor')
    size=p.stat().st_size;digest=sha(p);p.unlink()
    deleted.append({'path':str(p.relative_to(root)),'bytes':size,'sha256':digest,'reason':'Reproducible intermediate; retained final video/master, source assets, scripts and verified incremental recovery archive.'})
assert q['videoSha256']==sha(OUT/'Roadster_倒挂与飞行翻滚_1080p.mp4')
cleanup={'deleted':deleted,'releasedBytes':sum(x['bytes'] for x in deleted),'preserved':'V05 video/source archive; V06 final video, master/stems, official source excerpts, Qwen original/task/provenance, QA and scripts.','archive':report}
(OUT/'cleanup.json').write_text(json.dumps(cleanup,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'package':report,'releasedBytes':cleanup['releasedBytes']},ensure_ascii=False))
