"""V10 bridge windows and encoded-frame plan; no media access or V09 windows."""
from __future__ import annotations
from math import floor,ceil,isfinite

def frame_at(seconds,fps):return floor(float(seconds)*fps+.5)

def resolved_windows(timeline,manifest):
    if timeline.get('timeUnit','seconds')!='seconds':raise ValueError('Timeline must use seconds')
    if manifest.get('version')!='V10':raise ValueError('Actual V10 transitions manifest required')
    fps=timeline['fps'];scenes={s['id']:frame_at(s['start'],fps) for s in timeline['scenes']};clips={c['id']:frame_at(c['start'],fps) for c in timeline['clips']};rows=[];ids=set()
    for row in manifest['clips']:
        if row['id'] in ids:raise ValueError('Duplicate bridge ID '+row['id'])
        ids.add(row['id']);anchor=row['anchor'];kind=anchor['kind'];offset=anchor['offsetFrames'];length=row['frames']
        if not isinstance(offset,int) or not isinstance(length,int) or length<=0:raise ValueError('Bridge offset/length must be integer frames')
        if kind=='frame':base=0
        elif kind in ['scene','clip']:
            table=scenes if kind=='scene' else clips
            if anchor.get('id') not in table:raise ValueError('Unknown bridge anchor '+str(anchor))
            base=table[anchor['id']]
        else:raise ValueError('Unknown bridge anchor kind '+str(kind))
        start=base+offset;end=start+length
        if start<0 or end>timeline['duration']:raise ValueError('Bridge window escapes video '+row['id'])
        rows.append({'id':row['id'],'startFrame':start,'endFrameExclusive':end,'frames':length,'anchor':anchor,'taskId':row.get('taskId'),'framePath':row['framePath']})
    rows.sort(key=lambda r:r['startFrame'])
    for a,b in zip(rows,rows[1:]):
        if a['endFrameExclusive']>b['startFrame']:raise ValueError('Bridge windows overlap: '+a['id']+'/'+b['id'])
    return rows

def planned_transitions(timeline,manifest):
    fps=timeline['fps'];expected=[{'frame':frame_at(s['start'],fps),'reason':'scene rail: '+s['id']} for s in timeline['scenes']]
    for w in resolved_windows(timeline,manifest):
        # Current RealityBridgeV10 enters over12f and exits over its last13f.
        start=w['startFrame'];length=w['frames'];events=[(start,'actual Qwen bridge starts'),(start+(0 if start==0 else min(12,length-1)),'actual Qwen full cover'),(start+max(0,length-13),'actual Qwen bridge exits'),(w['endFrameExclusive'],'actual Qwen bridge retired')]
        expected.extend({'frame':f,'reason':reason+': '+w['id'],'bridgeId':w['id']} for f,reason in events)
    coda=next((s for s in timeline['scenes'] if s['id']=='references'),None)
    if coda:
        start=frame_at(coda['start'],fps);length=timeline['duration']-start
        expected.append({'frame':start+ceil(length/7.2),'reason':'V10 Coda reaches full cover'})
    return sorted(expected,key=lambda e:e['frame'])

def review_frame_plan(timeline,manifest,label_audit=None):
    fps=timeline['fps'];total=timeline['duration'];reasons={}
    def add(f,reason):
        if not isfinite(f):raise ValueError('Nonfinite review frame')
        f=max(0,min(total-1,floor(f+.5)));reasons.setdefault(f,set()).add(reason)
    for c in timeline['clips']:add(frame_at(c['start']+c['duration']*.55,fps),'narration midpoint: '+c['id'])
    for s in timeline['scenes']:
        start=frame_at(s['start'],fps)
        for dt in [-18,-6,-1,0,1,6,18,42]:add(start+dt,'actual scene handoff: '+s['id'])
    mechanisms={'r007','r013','r018','r023','r026','r027','r028','r031','r034','r035','r038','r041'}
    for c in timeline['clips']:
        if c['id'] in mechanisms:
            for q in [.15,.35,.75,.9]:add(frame_at(c['start']+c['duration']*q,fps),'mechanism phase: '+c['id'])
        if c['id'] in {'r042','r043','r044'}:
            start=frame_at(c['start'],fps);end=frame_at(c['end'],fps)
            for f in range(start,end,12):add(f,'new explanation dense 12-frame grid: '+c['id'])
            for boundary in [start,end]:
                for dt in [-8,-4,-1,0,1,4,8]:add(boundary+dt,'new explanation boundary: '+c['id'])
            for cap in timeline['captions']:
                if cap.get('clipId')==c['id']:
                    for boundary in [frame_at(cap['start'],fps),frame_at(cap['end'],fps)]:
                        for dt in [-1,0,1]:add(boundary+dt,'new explanation caption: '+c['id'])
    windows=resolved_windows(timeline,manifest)
    for w in windows:
        start=w['startFrame'];end=w['endFrameExclusive'];length=w['frames']
        for dt in [-2,-1,0,1,6,12,18]:add(start+dt,'actual bridge entry: '+w['id'])
        for q in [.25,.5,.75]:add(start+length*q,'actual bridge middle: '+w['id'])
        for dt in [-18,-13,-12,-6,-2,-1,0,1,2]:add(end+dt,'actual bridge exit: '+w['id'])
    if label_audit:
        for change in label_audit['changes']:
            for dt in [-4,-1,0,1,4]:add(change['frame']+dt,'actual V10 annotation transition')
    coda=next(s for s in timeline['scenes'] if s['id']=='references');start=frame_at(coda['start'],fps);length=total-start
    for q in [0,.05,.15,.35,.55,.75,.95,1]:add(start+length*q,'actual source coda phase')
    for f in [0,1,total-2,total-1]:add(f,'video boundary')
    return {'version':'V10','schema':'rainbow.v10.encoded-review-frame-plan/1','fps':fps,'totalFrames':total,'frames':sorted(reasons),'frameReasons':{str(f):sorted(reasons[f]) for f in sorted(reasons)},'actualBridgeWindows':windows,'actualBridgeCount':len(windows),'labelAuditIncluded':label_audit is not None,'newExplanationDenseStepFrames':12,'inheritedV09FixedWindows':False,'extracted':False}
