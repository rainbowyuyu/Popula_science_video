"""Remove only retired V16 bundles after both final videos pass media QA."""
from pathlib import Path
import datetime
import json
import shutil
import stat

ROOT=Path(__file__).resolve().parents[2]
QA=ROOT/'research/qa/v16'
CACHE=(ROOT/'tmp/v16/render-runs').resolve()

def load(path): return json.loads(path.read_text('utf-8-sig'))

def main():
    for name in ['main-media','vertical-media']:
        report=load(QA/name/'media-report.json')
        assert report['automaticChecksPassed'], f'Media QA is incomplete: {name}'
    assert load(QA/'acceptance.json')['deliveryAccepted'], 'Visual review must finish before cleanup'
    keep={(ROOT/'tmp/v16/last-bundle.txt').read_text().strip()}
    keep={Path(p).resolve().parent for p in keep}
    for name in ['v16-main-render.json','v16-vertical-render.json']:
        keep.add(Path(load(ROOT/'tmp/v16'/name)['runDir']).resolve())
    entries=[]
    for candidate in sorted(CACHE.iterdir()):
        resolved=candidate.resolve()
        assert resolved.parent==CACHE and ROOT.resolve() in resolved.parents
        if resolved in keep or not candidate.is_dir(): continue
        descendants=[candidate,*candidate.rglob('*')]
        if any(p.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT for p in descendants):
            entries.append({'path':str(resolved),'deleted':False,'reason':'reparse point retained'})
            continue
        if any(p.name=='.git' for p in descendants):
            entries.append({'path':str(resolved),'deleted':False,'reason':'nested repository retained'})
            continue
        size=sum(p.stat().st_size for p in descendants if p.is_file())
        shutil.rmtree(resolved)
        entries.append({'path':str(resolved),'deleted':True,'bytes':size})
    report={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'scope':'Only superseded V16 render-runs directories; V14/V15, previews, shared dependencies, current bundle and render records retained.',
            'kept':[str(p) for p in sorted(keep)],'entries':entries,
            'freedBytes':sum(e.get('bytes',0) for e in entries if e['deleted'])}
    (QA/'cleanup.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'deletedDirectories':sum(e['deleted'] for e in entries),'freedBytes':report['freedBytes']}))

if __name__=='__main__': main()
