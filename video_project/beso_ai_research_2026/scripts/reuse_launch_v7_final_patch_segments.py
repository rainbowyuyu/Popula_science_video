"""Default/--audit proves scope only. --apply copies five validated segments.

Original source text is recovered from b6's frozen map and checked against its
original SHA. No source, render manifest, generated asset or ledger is edited.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
OLD='b6a150fc6370'
NEW='27ef33bc9eb3'
REUSE=[0,1,3,4,6]
CHANGED=['src/LaunchV7.tsx','src/beso/ContinuousLaunchWorldV7.ts']

def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): h.update(block)
    return h.hexdigest()
def replace(text,a,b):
    if text.count(a)!=1: raise RuntimeError('Reviewed statement missing or ambiguous: '+a[:100])
    return text.replace(a,b,1)
def clamp(x): return max(0,min(1,x))
def ease(x):
    q=clamp(x)
    return q*q*q*(q*(6*q-15)+10)
def ramp(t,a,b): return ease((t-a)/(b-a))

def exact_scope(original,current):
    expected=replace(original[0],"s.id==='toolchain'?ease((s.local-.6)/.4):0;","s.id==='toolchain'?ease((s.local-.6)/.4)*(1-ease((s.local-11)/1)):0;")
    expected=replace(expected,
        ' const enter=ease((s.local-.2)/1),exit=ease((s.local-s.duration+.9)/.9),handoff=ease((s.local-7.2)/.85),reduction=ease((s.local-2.4)/1.8);',
        ' const enter=ease((s.local-.2)/1),exit=ease((s.local-s.duration+.9)/.9),handoff=ease((s.local-7.2)/.85);\n'
        ' // The case result is fixed evidence. Reveal the whole result spatially;\n'
        ' // counting from zero contradicts the simultaneously shown before/after pair.\n'
        ' const reduction=(278-255.5)/278*100;')
    expected=replace(expected,'{(8.1*reduction).toFixed(1)}','{reduction.toFixed(1)}')
    expected=replace(expected,
        "paddingTop:22,display:'flex',gap:25,fontSize:35,fontWeight:570}}>{['模型','输入','日志','报告'].map((w,i)=><span key={w} style={{transform:`translateY(${25*(1-ease((s.local-5.4-i*.35)/.6))}px)`}}>",
        "paddingTop:18,display:'flex',gap:25,fontSize:35,lineHeight:1.35,fontWeight:570}}>{['模型','输入','日志','报告'].map((w,i)=><span key={w} style={{transform:`translateX(${16*(1-ease((s.local-5.4-i*.35)/.6))}px)`}}>")
    expected=replace(expected,'fontSize:30,marginTop:16}}>分别留档','fontSize:30,lineHeight:1.35,marginTop:20}}>分别留档')
    if expected!=current[0]: raise RuntimeError('Unreviewed LaunchV7 source changes')
    expected=replace(original[1],
        '  const evolution=clamp((time-30)/7)*3,lower=Math.min(this.surfaces.length-1,Math.floor(evolution)),blend=ramp(evolution-lower,.62,.97);',
        "  // Keep the generated bridge's state-0 endpoint through 30 s. Start the\n"
        '  // first archived-state handoff immediately after it, on the spoken cue.\n'
        '  // These are crossfades between saved surfaces, never invented solver steps.\n'
        '  const evolution=time<30?0:time<30.75?.62+.38*ramp(time,30,30.75):1+2*clamp((time-30.75)/6.25),lower=Math.min(this.surfaces.length-1,Math.floor(evolution)),blend=ramp(evolution-lower,.62,.97);')
    if expected!=current[1]: raise RuntimeError('Unreviewed world source changes')
    for text in original+current:
        if 'const q=clamp(x);return q*q*q*(q*(6*q-15)+10)' not in text: raise RuntimeError('Audit easing changed')
    if 'const ramp=(time:number,start:number,end:number)=>ease((time-start)/(end-start));' not in current[1]: raise RuntimeError('Audit ramp changed')
    if 'left:1035+1100*(1-enter+exit+handoff)' not in current[0] or "background:'#e7eff1',overflow:'hidden'" not in current[0]: raise RuntimeError('Panel containment changed')

def beso(t,revised,states):
    e=clamp((t-30)/7)*3 if not revised else 0 if t<30 else .62+.38*ramp(t,30,30.75) if t<30.75 else 1+2*clamp((t-30.75)/6.25)
    lower=min(len(states)-1,int(e)); blend=ramp(e-lower,.62,.97)
    weights=[1-blend if i==lower else blend if i==lower+1 else 0 for i in range(len(states))]
    active=min(len(states)-1,lower+(1 if blend>.5 else 0))
    return {'weights':weights,'active':active,'iteration':states[active]['iteration'],'fraction':states[active]['solidVolumeFraction']}

def audit():
    olddir=ROOT/f'output/launch-v7-render-{OLD}'; newdir=ROOT/f'output/launch-v7-render-{NEW}'
    old=read(olddir/'render-manifest.json'); new=read(newdir/'render-manifest.json')
    if old['revision']!=OLD or new['revision']!=NEW: raise RuntimeError('Freeze revision changed')
    for k in ['compositionId','fps','durationInFrames','width','height','overlay','blueprint','audioSHA256']:
        if old.get(k)!=new.get(k): raise RuntimeError('Render configuration changed: '+k)
    before={r['file']:r['sha256'] for r in old['sourceAssets']}; after={r['file']:r['sha256'] for r in new['sourceAssets']}
    changed=[p for p in sorted(set(before)|set(after)) if before.get(p)!=after.get(p)]
    if changed!=CHANGED: raise RuntimeError('Unexpected changed input hashes: '+repr(changed))
    for p,h in after.items():
        if sha(ROOT/p)!=h: raise RuntimeError('Current file differs from frozen input: '+p)
    mappath=ROOT/f'tmp/launch-v7-bundle-{OLD}/bundle.js.map'; smap=read(mappath)
    original=[]; current=[]; recovered=[]
    scratch=ROOT/f'work/v7-final-patch-audit/{NEW}'; scratch.mkdir(parents=True,exist_ok=True)
    for p in CHANGED:
        indices=[i for i,s in enumerate(smap['sources']) if s.endswith(p)]
        if len(indices)!=1: raise RuntimeError('Original map entry absent or ambiguous: '+p)
        text=smap['sourcesContent'][indices[0]]; data=text.encode('utf8')
        if hashlib.sha256(data).hexdigest()!=before[p]: raise RuntimeError('Original source SHA mismatch: '+p)
        target=scratch/(Path(p).name+'.b6-original.txt'); target.write_bytes(data)
        original.append(text); current.append((ROOT/p).read_bytes().decode('utf8'))
        recovered.append({'source':p,'sha256':before[p],'exactOriginalHashMatch':True,'saved':target.relative_to(ROOT).as_posix()})
    exact_scope(original,current)
    story=read(ROOT/'src/launch-v7-story.json'); scenes={s['id']:s for s in story['scenes']}
    states=read(ROOT/'public/beso-research/geometry/manifest.json')['iterations']
    if [s['iteration'] for s in states]!=[0,10,26,43]: raise RuntimeError('BESO recorded states changed')
    beso_diff=[]
    for f in range(6300):
        same=beso(f/60,False,states)==beso(f/60,True,states)
        if (f<1800 or f>=2220) and not same: raise RuntimeError('BESO escaped 30-37 s at frame '+str(f))
        if not same: beso_diff.append(f)
    tool=scenes['toolchain']; colour=[]
    for f in range(tool['start'],tool['start']+tool['duration']):
        local=(f-tool['start'])/60; a=ease((local-.6)/.4); b=a*(1-ease((local-11)/1))
        if a!=b: colour.append(f)
    proof=scenes['proof']; offscreen=[]
    for f in range(5400,proof['start']+proof['duration']):
        local=(f-proof['start'])/60
        left=1035+1100*(1-ease((local-.2)/1)+ease((local-proof['duration']/60+.9)/.9)+ease((local-7.2)/.85))
        shifts=[16*(1-ease((local-5.4-i*.35)/.6)) for i in range(4)]
        if left<2135 or min(shifts)<0: raise RuntimeError('Proof enters segment6 at '+str(f))
        offscreen.append((left,min(shifts)))
    possible=set(beso_diff+colour)|set(range(proof['start'],5400))
    if sorted({f//900 for f in possible})!=[2,5]: raise RuntimeError('Unexpected affected segments')
    records=[]; copies=[]
    for i in REUSE:
        start=i*900; end=start+899
        if any(start<=f<=end for f in possible): raise RuntimeError('Reuse intersects patch')
        source=olddir/f'segment-{i:03d}.mp4'; sidecar=read(source.with_suffix('.mp4.json')); actual=sha(source)
        if not (sidecar['revision']==OLD and sidecar['frames']==900 and sidecar['start']==start and sidecar['end']==end and sidecar['sha256']==actual): raise RuntimeError('Old segment validation failed')
        destination=newdir/source.name
        if destination.exists():
            existing=read(destination.with_suffix('.mp4.json'))
            if not (sha(destination)==actual and existing.get('revision')==NEW and existing.get('reusedFromRevision')==OLD): raise RuntimeError('Existing destination is not our identical reuse')
        records.append({'index':i,'start':start,'end':end,'sha256':actual,'bytes':source.stat().st_size,'destination':destination.relative_to(ROOT).as_posix()})
        copies.append((source,destination,sidecar))
    report={'schema':'launch-v7-bounded-final-patch-reuse-v2','createdUTC':datetime.now(timezone.utc).isoformat(),'status':'audited-only-no-segments-copied','oldRevision':OLD,'newRevision':NEW,
        'changedInputs':[{'file':p,'oldSHA256':before[p],'newSHA256':after[p]} for p in CHANGED],
        'allOtherInputHashesEqual':True,'currentInputsMatchNewFreeze':True,'originalSources':recovered,'sourceMapSHA256':sha(mappath),'exactReviewedSourceReplacementsMatch':True,
        'besoProof':{'auditedFrames':6300,'equalBefore30sFrames':1800,'equalAtOrAfter37sFrames':4080,'differingFrames':[min(beso_diff),max(beso_diff)],'state30s':beso(30,True,states),'state30_4s':beso(30.4,True,states),'state37s':beso(37,True,states),'noNewSolverStates':True},
        'colourProof':{'transitionSeconds':[76,77],'differingFrames':[min(colour),max(colour)],'differenceEndsAtSceneSwitchSeconds':(tool['start']+tool['duration'])/60,'note':'76-77 s is transition; old-white versus new-dark difference continues until toolchain ends at79 s.'},
        'proofOffscreenAfter90s':{'auditedFrames':len(offscreen),'minimumLeft':min(x[0] for x in offscreen),'minimumChildXShift':min(x[1] for x in offscreen),'canvasRight':1920,'overflowHidden':True,'realViewerUnchanged':True},
        'rerenderSegments':[2,5],'reuseSegments':REUSE,'encodedSegments':records,'generatedAssetsAndTasksUnchanged':True,'remainingQA':'Final decode and seam/visual inspection after remux; scope audit alone is not aesthetic acceptance.'}
    return report,copies

def main():
    parser=argparse.ArgumentParser(description=__doc__); mode=parser.add_mutually_exclusive_group(); mode.add_argument('--audit',action='store_true'); mode.add_argument('--apply',action='store_true'); args=parser.parse_args()
    report,copies=audit()
    if args.apply:
        for source,destination,sidecar in copies:
            if destination.exists(): continue
            temp=destination.with_suffix('.mp4.reuse-copying')
            if temp.exists(): raise RuntimeError('Stale partial reuse requires review')
            shutil.copy2(source,temp)
            if sha(temp)!=sidecar['sha256']: raise RuntimeError('Copied segment hash differs')
            temp.rename(destination)
            record={**sidecar,'revision':NEW,'file':str(destination),'reusedFromRevision':OLD,'reuseReason':'Exact two-source bounded patch audit; BESO before30s/after37s equal, proof entirely offscreen at90s, all other frozen inputs equal.'}
            destination.with_suffix('.mp4.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
        report['status']='five-unaffected-segments-reused'
    target=ROOT/'research/qa/launch-v7-final-patch-reuse.json'; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'status':report['status'],'report':str(target),'reuse':REUSE,'rerender':[2,5]},ensure_ascii=False))

if __name__=='__main__': main()
