"""Explicit V12 C: retired-bundle cleanup. Default: plan, never deletes.

Skill version_cleanup.py cannot accept this external output/work layout.
This narrowly scoped replacement follows its two-stage and no-reparse rules.
All public/node_modules targets, V11, source assets, and the complete V12 bundle
are protected. Apply requires current exact final QA and a verified recovery ZIP.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, stat, subprocess, sys, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=Path('C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v12')
WORK=OUT/'work'
REPORT=ROOT/'work/package-v12'
PLAN=REPORT/'cleanup-plan-v12.json'
KEEP=WORK/'bundle-20261012001328083'
TARGETS=['bundle','bundle-20261012000728864','bundle-20261012000815054','bundle-20261012000936110','bundle-20261012001113838']
BLOCKED={'node_modules','.git','.claude','.codex','.agents','__pycache__'}
CHUNK=4*1024*1024

def jd(o):return (json.dumps(o,ensure_ascii=False,indent=2)+'\n').encode('utf8')
def load(p):return json.loads(Path(p).read_text('utf8'))
def reparse(p):
    s=p.lstat();return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)
def checked(p):
    # Lexical checks BEFORE resolve, since resolve would follow a junction.
    p=Path(os.path.abspath(p))
    if not p.is_relative_to(WORK) or p==WORK:raise RuntimeError('Outside explicit V12 cache roots')
    r=p.relative_to(WORK)
    if r.parts[0] not in TARGETS:raise RuntimeError('Cache root is not allowlisted')
    if p==KEEP or p.is_relative_to(KEEP):raise RuntimeError('Full V12 bundle is protected')
    cur=Path(p.anchor)
    for part in p.parts[1:]:
        cur/=part
        if cur.exists() and reparse(cur):raise RuntimeError('Link/reparse point refused')
    if any(x.casefold() in BLOCKED for x in r.parts):raise RuntimeError('Protected source/dependency directory')
    return p
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(CHUNK),b''):h.update(b)
    return h.hexdigest()
def snapshot(p):
    s=p.stat();return {'bytes':s.st_size,'mtime_ns':s.st_mtime_ns,'hardLinkCount':s.st_nlink}
def files(base,skipped):
    if not base.exists():return
    checked(base)
    for folder,dirs,names in os.walk(base,followlinks=False):
        b=Path(folder)
        for n in dirs[:]:
            p=b/n
            if reparse(p) or n.casefold() in BLOCKED:
                skipped.append({'path':str(p),'reason':'Link/reparse or protected dependency; not followed','bytes':0});dirs.remove(n)
        for n in names:
            p=b/n
            if reparse(p):skipped.append({'path':str(p),'reason':'Link/reparse point; not followed','bytes':0});continue
            try:checked(p)
            except RuntimeError as e:skipped.append({'path':str(p),'reason':str(e),'bytes':0});continue
            if p.is_file():yield p
def build():
    rows=[];skipped=[];stats=[]
    for name in TARGETS:
        base=WORK/name;raw=0;allow=0;count=0
        if not base.is_dir():skipped.append({'path':str(base),'reason':'Already absent','bytes':0});continue
        for p in files(base,skipped):
            s=snapshot(p);raw+=s['bytes'];relative=p.relative_to(base);row={'path':str(p),'root':name,**s}
            # The only deletable public files are exact duplicates of retained
            # current public inputs. Missing/different/unique originals stay.
            if relative.parts[0]=='public':
                source=ROOT/'public'/Path(*relative.parts[1:])
                if not source.is_file() or source.stat().st_size!=s['bytes']:
                    skipped.append({'path':str(p),'reason':'Public duplicate source missing or size differs; retained','bytes':s['bytes']});continue
                digest=sha(p)
                if digest!=sha(source):
                    skipped.append({'path':str(p),'reason':'Public duplicate SHA differs; retained','bytes':s['bytes']});continue
                real=source.resolve(strict=True)
                if not real.is_relative_to(ROOT.parent.resolve()):raise RuntimeError('Public source outside retained project assets')
                row.update(kind='proven-duplicate-public-copy',source=str(real),logicalSource=str(source),sha256=digest,rebuild='Restore ordinary public copies from retained current public inputs or verified V12 recovery package')
            elif len(relative.parts)==1 and (re.fullmatch(r'(?:\d+\.)?bundle\.js(?:\.map)?',p.name) or p.name in {'index.html','favicon.ico'}):
                row.update(kind='regenerable-remotion-bundle',sha256=sha(p),rebuild='node scripts/render-v12.mjs stills --stills=0 --folder=work/cache-rebuild; Remotion bundler reproduces generated bundle from source/lock/public. The complete film bundle remains preserved separately.')
            else:
                skipped.append({'path':str(p),'reason':'Unknown cache file outside generated whitelist; retained','bytes':s['bytes']});continue
            if s['hardLinkCount']!=1:
                skipped.append({'path':str(p),'reason':'Multiple hard links; retained','bytes':s['bytes']});continue
            rows.append(row);allow+=s['bytes'];count+=1
        stats.append({'root':str(base),'ordinaryBytes':raw,'eligibleBytes':allow,'eligibleFileCount':count})
    protected=[str(KEEP),str(ROOT/'public'),str(ROOT/'node_modules'),str(ROOT/'src'),str(ROOT.parent/'rainbow_arc_2026_v11'),str(OUT/'delivery'),str(OUT.parent/'rainbow_arc_v11')]
    return {'version':'V12','status':'planned-not-applied','createdUTC':dt.datetime.now(dt.timezone.utc).isoformat(),'source':'Skill storage-cleanup.md principles; skill version_cleanup.py rejects external work layout, so exact allowlist replaces its unsupported root selection.','toolSHA256':sha(Path(__file__)),'sourceRoot':str(ROOT),'outputWorkRoot':str(WORK),'fullBundleProtected':str(KEEP),'protectedPaths':protected,'targets':TARGETS,'roots':stats,'candidates':rows,'candidateBytes':sum(r['bytes'] for r in rows),'candidateFiles':len(rows),'skipped':skipped,'CFreeBefore':shutil.disk_usage(WORK).free,'deletedFiles':0,'linkTargetsTouched':False}

def active_render_guard():
    if os.name!='nt':return
    result=subprocess.run(['powershell','-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    rows=json.loads(result.stdout or '[]')
    for r in rows if isinstance(rows,list) else [rows]:
        if r.get('ProcessId')==os.getpid():continue
        name=(r.get('Name') or '').lower();cmd=r.get('CommandLine') or ''
        if name in {'node.exe','chrome.exe','chrome-headless-shell.exe','blender.exe'} and (re.search(r'\brender-v12\.mjs\b',cmd,re.I) or any(str(WORK/x).replace('\\','/').casefold() in cmd.replace('\\','/').casefold() for x in TARGETS)):
            raise RuntimeError('Active cache-producing/using process PID '+str(r['ProcessId'])+'; command omitted')

def gate(qa_path,package_result):
    qa=load(qa_path)
    if qa.get('version')!='V12' or qa.get('status')!='pass' or qa.get('visualReviewApproved') is not True or qa.get('encodedFullDecodePassed') is not True:raise RuntimeError('Final V12 QA approval required')
    final=OUT/'delivery/彩虹为什么是弧形_V12_1080p.mp4';digest=sha(final)
    if digest!=qa.get('videoSHA256'):raise RuntimeError('Final video differs from approved hash')
    package=load(package_result)
    if package.get('version')!='V12' or package.get('status')!='verified' or not package.get('verification',{}).get('allMemberSHA256Passed'):raise RuntimeError('Verified V12 recovery package required')
    archive=Path(package['archive'])
    if not archive.is_file() or sha(archive)!=package['sha256']:raise RuntimeError('Recovery ZIP hash changed or missing')
    # Fresh CRC/decompression + member hash audit immediately before cleanup.
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:raise RuntimeError('Recovery ZIP CRC failed')
        manifest=json.loads(z.read('manifest-v12.json'))
        if manifest.get('acceptedVideo',{}).get('sha256')!=digest:raise RuntimeError('Recovery manifest does not bind the approved movie')
        for r in manifest['entries']:
            h=hashlib.sha256();size=0
            with z.open(r['member']) as f:
                for b in iter(lambda:f.read(CHUNK),b''):h.update(b);size+=len(b)
            if h.hexdigest()!=r['sha256'] or size!=r['bytes']:raise RuntimeError('Recovery member hash failed: '+r['member'])
    if not KEEP.is_dir() or reparse(KEEP):raise RuntimeError('Complete V12 frozen bundle is missing or linked')
    for rel in ['src/index.tsx','package.json','package-lock.json','src/timeline.json','public/audio_v11/master-v11.wav','public/assets/lux3d/extracted/3dgs/gaussian.ply','public/assets_v11/characters/rainbow_fish_v11/rainbow_fish_v11.glb']:
        if not (ROOT/rel).is_file():raise RuntimeError('Protected dependency missing: '+rel)
    v11=OUT.parent/'rainbow_arc_v11/delivery/彩虹为什么是弧形_V11_1080p.mp4'
    if not v11.is_file():raise RuntimeError('Required V11 rollback movie missing')
    return final,digest

def apply(plan,qa,package):
    if plan.get('version')!='V12' or plan.get('status')!='planned-not-applied' or plan.get('targets')!=TARGETS or plan.get('toolSHA256')!=sha(Path(__file__)):raise RuntimeError('Plan stale, modified or already applied')
    active_render_guard();final,digest=gate(qa,package)
    # Verify every candidate and source before the first mutation.
    for r in plan['candidates']:
        p=checked(Path(r['path']))
        if not p.is_file() or snapshot(p)!={k:r[k] for k in ['bytes','mtime_ns','hardLinkCount']} or sha(p)!=r['sha256']:raise RuntimeError('Candidate changed since plan')
        if r['kind']=='proven-duplicate-public-copy':
            source=Path(r['source'])
            if not source.is_relative_to(ROOT.parent.resolve()) or not source.is_file() or sha(source)!=r['sha256']:raise RuntimeError('Surviving public original changed')
        elif r['kind']!='regenerable-remotion-bundle':raise RuntimeError('Unknown candidate kind')
    deleted=0;total=0;log=REPORT/'cleanup-v12.deleted.jsonl'
    with log.open('x',encoding='utf8') as f:
        for r in plan['candidates']:
            p=checked(Path(r['path']))
            if snapshot(p)!={k:r[k] for k in ['bytes','mtime_ns','hardLinkCount']} or sha(p)!=r['sha256']:raise RuntimeError('Candidate changed immediately before delete')
            p.unlink();deleted+=1;total+=r['bytes'];f.write(json.dumps({'path':str(p),'bytes':r['bytes'],'sha256':r['sha256'],'deletedUTC':dt.datetime.now(dt.timezone.utc).isoformat()},ensure_ascii=False)+'\n');f.flush()
    # No recursive directory delete. Empty ordinary directories can be removed;
    # linked public entries and their parents necessarily survive.
    for name in TARGETS:
        base=WORK/name
        if not base.exists():continue
        folders=[]
        for folder,dirs,names in os.walk(base,followlinks=False):
            b=Path(folder)
            dirs[:]=[n for n in dirs if not reparse(b/n) and n.casefold() not in BLOCKED];folders.append(b)
        for b in reversed(folders):
            try:checked(b);b.rmdir()
            except OSError:pass
    if sha(final)!=digest:raise RuntimeError('Protected final video hash changed')
    result={**plan,'status':'applied','deletedFiles':deleted,'logicalBytesRemoved':total,'CFreeAfter':shutil.disk_usage(WORK).free,'latestMovieHashRechecked':True,'linkTargetsTouched':False}
    result['actualFreeIncrease']=result['CFreeAfter']-plan['CFreeBefore'];(REPORT/'cleanup-result-v12.json').write_bytes(jd(result));return result

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['plan','apply'],nargs='?',default='plan');p.add_argument('--qa',type=Path);p.add_argument('--package-result',type=Path);a=p.parse_args();REPORT.mkdir(parents=True,exist_ok=True)
    if a.mode=='plan':
        result=build();PLAN.write_bytes(jd(result))
    else:
        if not a.qa or not a.package_result:p.error('apply needs --qa and --package-result')
        result=apply(load(PLAN),a.qa,a.package_result)
    print(json.dumps({k:result[k] for k in ['version','status','roots','candidateFiles','candidateBytes','deletedFiles','linkTargetsTouched']},ensure_ascii=False,indent=2));print('Plan: '+str(PLAN))
if __name__=='__main__':
    try:main()
    except Exception as e:print('CLEANUP_V12_REJECTED: '+str(e),file=sys.stderr);sys.exit(1)
