"""Audit 27ef -> 4dcf opaque-ink repair; --apply reuses six verified segments.

Default is a no-copy audit. A new frozen render manifest is mandatory. Source
is recovered from the retained 27ef map with the exact original file SHA.
Only segment 5 changes. No source, render manifest or generated ledger edits.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
OLD='27ef33bc9eb3'
NEW='4dcf5c443110'
SOURCE='src/LaunchV7.tsx'
REUSE=[0,1,2,3,4,6]

def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def ease(x):
    q=max(0,min(1,x))
    return q*q*q*(q*(6*q-15)+10)

def audit():
    olddir=ROOT/f'output/launch-v7-render-{OLD}';newdir=ROOT/f'output/launch-v7-render-{NEW}'
    newpath=newdir/'render-manifest.json'
    if not newpath.is_file():raise RuntimeError('New frozen manifest is not ready; no encoded segment copied')
    old=read(olddir/'render-manifest.json');new=read(newpath)
    if old['revision']!=OLD or new['revision']!=NEW:raise RuntimeError('Unexpected revision')
    for k in ['compositionId','fps','durationInFrames','width','height','overlay','blueprint','audioSHA256']:
        if old.get(k)!=new.get(k):raise RuntimeError('Render configuration changed: '+k)
    before={r['file']:r['sha256'] for r in old['sourceAssets']};after={r['file']:r['sha256'] for r in new['sourceAssets']}
    changed=[p for p in sorted(set(before)|set(after)) if before.get(p)!=after.get(p)]
    if changed!=[SOURCE]:raise RuntimeError('Unexpected changed inputs: '+repr(changed))
    for p,h in after.items():
        if sha(ROOT/p)!=h:raise RuntimeError('Input differs from new freeze: '+p)
    mappath=ROOT/f'tmp/launch-v7-bundle-{OLD}/bundle.js.map';smap=read(mappath)
    indices=[i for i,s in enumerate(smap['sources']) if s.endswith(SOURCE)]
    if len(indices)!=1:raise RuntimeError('Original source-map entry absent or ambiguous')
    original=smap['sourcesContent'][indices[0]];original_bytes=original.encode('utf8')
    if hashlib.sha256(original_bytes).hexdigest()!=before[SOURCE]:raise RuntimeError('Recovered original source SHA mismatch')
    oldline="const lightTypeWeight=(s:State)=>s.id==='physics'?1-ease((sampleV7Camera(s.time).position.y+.10)/1.40):s.id==='toolchain'?ease((s.local-.6)/.4)*(1-ease((s.local-11)/1)):0;"
    replacement='// After the close inspection passes the light tower, select one opaque theme.\n'
    replacement+='// Mixing white and dark glyphs made a low-contrast grey at 76.5 seconds.\n'
    replacement+=oldline.replace('(1-ease((s.local-11)/1))','(s.local<11.25?1:0)')
    if original.count(oldline)!=1:raise RuntimeError('Reviewed original statement missing or ambiguous')
    current=(ROOT/SOURCE).read_bytes().decode('utf8')
    if original.replace(oldline,replacement,1)!=current:raise RuntimeError('Changes exceed the exact two comments and multiplier repair')
    if 'const q=clamp(x);return q*q*q*(q*(6*q-15)+10)' not in current:raise RuntimeError('Audit easing differs from implementation')
    story=read(ROOT/'src/launch-v7-story.json');scenes={s['id']:s for s in story['scenes']};tool=scenes['toolchain']
    differing=[];late_values=set();early_equal=True
    for f in range(6300):
        if not tool['start']<=f<tool['start']+tool['duration']:continue
        local=(f-tool['start'])/60;initial=ease((local-.6)/.4)
        a=initial*(1-ease((local-11)/1));b=initial*(1 if local<11.25 else 0)
        if local<=11 and a!=b:early_equal=False
        if f>=int((tool['start']/60+11.25)*60) and b!=0:raise RuntimeError('Late theme is not fully opaque dark')
        if local>=1:late_values.add(b)
        if a!=b:differing.append(f)
    if not differing or sorted({f//900 for f in differing})!=[5] or not early_equal:raise RuntimeError('Repair escapes segment5 or changes the initial fade')
    if late_values!={0,1}:raise RuntimeError('Late toolchain theme mixes white/dark glyphs')
    scratch=ROOT/f'work/v7-opaque-ink-audit/{NEW}';scratch.mkdir(parents=True,exist_ok=True)
    recovered=scratch/'LaunchV7.tsx.27ef-original.txt';recovered.write_bytes(original_bytes)
    copies=[];records=[]
    for i in REUSE:
        start=i*900;end=start+899
        if any(start<=f<=end for f in differing):raise RuntimeError('Reusable segment intersects repair')
        source=olddir/f'segment-{i:03d}.mp4';sidecar=read(source.with_suffix('.mp4.json'));actual=sha(source)
        if not (sidecar['revision']==OLD and sidecar['frames']==900 and sidecar['start']==start and sidecar['end']==end and actual==sidecar['sha256']):raise RuntimeError('Old segment SHA/900-frame sidecar mismatch: '+str(i))
        dest=newdir/source.name
        if dest.exists():
            existing=read(dest.with_suffix('.mp4.json'))
            if not (sha(dest)==actual and existing.get('revision')==NEW and existing.get('reusedFromRevision')==OLD):raise RuntimeError('Refusing to overwrite another encoded destination')
        copies.append((source,dest,sidecar))
        records.append({'index':i,'start':start,'end':end,'frames':900,'sha256':actual,'bytes':source.stat().st_size,'destination':dest.relative_to(ROOT).as_posix(),'priorReuseFromRevision':sidecar.get('reusedFromRevision')})
    report={'schema':'launch-v7-opaque-ink-reuse-v1','createdUTC':datetime.now(timezone.utc).isoformat(),'status':'audited-only-no-segments-copied','oldRevision':OLD,'newRevision':NEW,
        'changedInputs':[{'file':SOURCE,'oldSHA256':before[SOURCE],'newSHA256':after[SOURCE]}],
        'allOtherInputHashesEqual':True,'currentInputsMatchNewFreeze':True,'exactReviewedSourceReplacementMatch':True,'originalSourceExactSHA256Match':True,'originalSourceMapSHA256':sha(mappath),'recoveredOriginalSource':recovered.relative_to(ROOT).as_posix(),
        'numericalScope':{'timelineFrames':6300,'differenceFrames':[min(differing),max(differing)],'differenceCount':len(differing),'switchSeconds':tool['start']/60+11.25,'initialFadeUnchanged':early_equal,'lateThemeWeights':sorted(late_values),'fullyDarkAtAndAfter76_25Seconds':True},
        'rerenderSegments':[5],'reuseSegments':REUSE,'encodedSegments':records,'generationTasksAndCostsUnchanged':True,'remainingQA':'Final patched remux, full decode and seam/contrast review required.'}
    return report,copies

def main():
    p=argparse.ArgumentParser(description=__doc__);g=p.add_mutually_exclusive_group();g.add_argument('--audit',action='store_true');g.add_argument('--apply',action='store_true');args=p.parse_args()
    report,copies=audit()
    if args.apply:
        required=sum(s.stat().st_size for s,d,_ in copies if not d.exists())
        if shutil.disk_usage(ROOT).free<required+64*1024*1024:raise RuntimeError('Insufficient space for verified segment copies plus64MiB; no copying started')
        for source,dest,sidecar in copies:
            if dest.exists():continue
            temp=dest.with_suffix('.mp4.reuse-copying')
            if temp.exists():raise RuntimeError('Partial copy needs review')
            shutil.copy2(source,temp)
            if sha(temp)!=sidecar['sha256']:raise RuntimeError('Copy SHA mismatch')
            temp.rename(dest)
            record={**sidecar,'revision':NEW,'file':str(dest),'reusedFromRevision':OLD,'priorReuseFromRevision':sidecar.get('reusedFromRevision'),'reuseReason':'Exact LaunchV7-only opaque-ink patch changes only segment5; original source SHA, all other inputs and this900-frame encoded segment were validated.'}
            dest.with_suffix('.mp4.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
        report['status']='six-unaffected-segments-reused'
    output=ROOT/'research/qa/launch-v7-opaque-ink-reuse.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'status':report['status'],'report':str(output),'reuse':REUSE,'rerender':[5]},ensure_ascii=False))

if __name__=='__main__':main()
