"""Remove explicitly retired V3/cache files only after current V4 acceptance."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,os,stat,subprocess,zipfile
from package_delivery import MEMBERS

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/qa/cleanup-v4'
ALLOW=['tmp/bundle','tmp/stills','tmp/cardio-review-bundle','tmp/cover-anatomy-v4-bundle',
       'tmp/cover-v4-bundle','tmp/revision4-label-preview-bundle',
       'tmp/v4-color-metadata-check.mp4','tmp/v4-color-remux-check.mp4',
       'research/revision-v4/GLP1-v3.mp4','audio/selected-prior/v3-before-v4',
       'tmp/pre-local-fixes.mp4','tmp/segment-6714-7168.mp4','tmp/segment-11743-12448.mp4',
       'tmp/segment-7641-7923.mp4','tmp/segment-11743-12519.mp4',
       'tmp/v4-local-fixes-20261008T150015Z-1cc84606/composed.mp4',
       'tmp/v4-local-fixes-20261008T152157Z-eb3336b4/composed.mp4',
       'tmp/v4-local-fixes-20261008T153235Z-2c0690da/encoded-before-vui.mp4',
       'tmp/v4-before-final-fixes.mp4','tmp/segment-7946-8149.mp4','tmp/segment-16736-16981.mp4']
ALLOW += ['tmp/segment-4091-4521.mp4', 'tmp/segment-5688-5793.mp4']
ALLOW += ['tmp/v4-local-fixes-20261008T160838Z-96a9613e/encoded-before-color.mp4']
REPARSE=getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0x400)
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def safe(p):
    assert p.is_relative_to(ROOT) and p!=ROOT,str(p)
    st=p.lstat()
    assert not stat.S_ISLNK(st.st_mode) and not (getattr(st,'st_file_attributes',0)&REPARSE),str(p)
    assert p.resolve().is_relative_to(ROOT),str(p)
    assert p.name not in ['.git','node_modules'],str(p)
    return st
def walk(p):
    safe(p)
    if p.is_file():return [p]
    result=[]
    for child in p.iterdir():result+=walk(child)
    return result
def remove_empty(p):
    if not p.exists() or p.is_file():return
    safe(p)
    for child in p.iterdir():
        if child.is_dir():remove_empty(child)
    p.rmdir()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true');args=parser.parse_args()
    qa=read(ROOT/'research/qa/final-v4/automatic-report.json');review=read(ROOT/'research/qa/final-v4/visual-review.json')
    marker=read(ROOT/'tmp/final-render.json');video=ROOT/'delivery/GLP1_1080p.mp4';tl=ROOT/'src/timeline.json'
    assert qa['automaticChecksPass'] and review['sampledVisualReviewCompleted']
    assert sha(video)==qa['videoSHA256']==review['videoSHA256']==marker['videoSHA256']
    assert sha(tl)==qa['timelineSHA256']==marker['timelineSHA256']
    assert sha(ROOT/'public/master.wav')==marker['masterSHA256'],'Current master differs from rendered audio'
    if marker.get('singlePassRender') is False:
        provenance=read(ROOT/'research/revision-v4/patch-render-provenance.json')
        assert provenance['state']=='complete' and provenance['finalRenderMarker']['videoSHA256']==qa['videoSHA256']
    assert (ROOT/'research/revision-v4/source-before-v4.zip').is_file()
    package=ROOT/'delivery/封面与发布文案.zip'
    assert package.is_file(),'Build the current publishing package before cleanup'
    safe(package)
    with zipfile.ZipFile(package,'r') as archive:
        assert archive.namelist()==[member for _,member in MEMBERS],'Publishing package has retired or missing members; rebuild it'
        assert archive.testzip() is None,'Publishing package CRC failure'
        for source,member in MEMBERS:
            current=ROOT/'delivery'/source
            safe(current)
            assert current.resolve().is_relative_to((ROOT/'delivery').resolve()) and current.is_file(),'Invalid publishing source'
            assert hashlib.sha256(archive.read(member)).hexdigest()==sha(current),'Publishing package is stale: '+member
    entries=[]
    selected_raw={read(f)['raw'] for f in (ROOT/'audio/takes').glob('g*.json')}
    for rel in ALLOW:
        p=ROOT/rel
        if p.exists():
            for f in walk(p):
                st=f.stat();entries.append({'path':str(f.relative_to(ROOT)).replace('\\','/'),'bytes':st.st_size,'mtimeNS':st.st_mtime_ns})
    for f in (ROOT/'audio/raw').glob('g*-*.wav'):
        rel=f.relative_to(ROOT).as_posix()
        if rel not in selected_raw:
            st=safe(f);entries.append({'path':rel,'bytes':st.st_size,'mtimeNS':st.st_mtime_ns})
    retired_covers=list((ROOT/'delivery/covers').glob('GLP1-cover-*.jpg'))
    retired_covers += [ROOT/'delivery/covers/source-receptor.jpg',ROOT/'delivery/covers/receptor-cutout.png']
    for f in retired_covers:
        if f.exists():
            st=safe(f);entries.append({'path':f.relative_to(ROOT).as_posix(),'bytes':st.st_size,'mtimeNS':st.st_mtime_ns})
    retiring={row['path'] for row in entries}
    retained=[]
    for rel in ['src','public','scripts','docs','audio/voice','audio/takes','delivery']:
        folder=ROOT/rel
        if folder.exists():
            for f in folder.rglob('*'):
                if f.is_file() and '__pycache__' not in f.parts and f.relative_to(ROOT).as_posix() not in retiring:
                    retained.append({'path':str(f.relative_to(ROOT)).replace('\\','/'),'bytes':f.stat().st_size,'sha256':sha(f)})
    for rel in sorted(selected_raw):
        f=ROOT/rel;safe(f);retained.append({'path':rel,'bytes':f.stat().st_size,'sha256':sha(f)})
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'dependencies.json').write_text(json.dumps(retained,ensure_ascii=False,indent=2),encoding='utf8')
    plan={'createdUTC':datetime.now(timezone.utc).isoformat(),'scope':'Current film explicit retired files only; current models/voice/source/QA and shared dependencies preserved.','videoSHA256':qa['videoSHA256'],'plannedBytes':sum(r['bytes'] for r in entries),'files':entries,'executed':False}
    (OUT/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
    if args.execute:
        for row in entries:
            p=ROOT/row['path'];st=safe(p)
            assert st.st_size==row['bytes'] and st.st_mtime_ns==row['mtimeNS'],'Candidate changed while planning'
        for row in entries:(ROOT/row['path']).unlink()
        for rel in ALLOW:
            p=ROOT/rel
            if p.exists() and p.is_dir():remove_empty(p)
        assert sha(video)==qa['videoSHA256'] and sha(tl)==qa['timelineSHA256']
        for row in retained:
            p=ROOT/row['path'];assert p.is_file() and sha(p)==row['sha256'],'Dependency changed: '+str(p)
        check=subprocess.run(['node',str(ROOT/'node_modules/typescript/bin/tsc'),'--noEmit'],cwd=ROOT,capture_output=True,text=True)
        assert check.returncode==0,check.stdout+check.stderr
        plan.update(executed=True,deletedBytes=sum(r['bytes'] for r in entries),dependencyHashesPreserved=True,typeCheckPassed=True)
        (OUT/'result.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'executed':plan['executed'],'bytes':sum(r['bytes'] for r in entries),'count':len(entries)}))

if __name__=='__main__':main()
