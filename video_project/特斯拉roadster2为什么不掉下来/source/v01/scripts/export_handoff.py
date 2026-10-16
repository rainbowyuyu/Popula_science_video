"""Export draft subtitles, shot contract and hashes from existing successful outputs."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[3]
t=json.loads((ROOT/'source/v01/timeline-preview.json').read_text(encoding='utf-8'))
def stamp(frame):
    ms=round(frame/30*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
subs=[];shots=[]
notes={
 'hover':('保持高度的条件','静止车体；等大反向重力与推力','质心位置固定，解释平衡条件'),
 'ballistic':('合力决定质心运动变化','同一车体滚转；质心按解析抛体轨迹','独立无推进慢放；1.2秒物理时间'),
 'couple':('净推力为零仍可有力矩','加速转动、关喷口继续、反向制动；质心下落','独立回放；0.6秒物理时间；主惯性轴x'),
 'fixed':('固定喷口方向随车翻转','转到90度停留后转向180度；显示分量','位置锁定为受力拆解，不是悬停预测')}
for scene in t['scenes']:
    for cap in scene['captions']:
        subs.append(f'{len(subs)+1}\n{stamp(cap["from"])} --> {stamp(cap["to"])}\n{cap["text"]}\n')
    subject,action,anchor=notes[scene['id']]
    shots.append({'id':scene['id'],'fromFrame':scene['from'],'endFrameExclusive':scene['from']+scene['durationInFrames'],'voiceText':scene['text'],'visualQuestion':subject,'action':action,'anchorAndTime':anchor,'evidence':'original teaching model; not measured Tesla footage','captionAlignment':'draft proportional; requires ASR or listening review'})
out=ROOT/'subtitles/v01';out.mkdir(parents=True,exist_ok=True)
(out/'preview-draft.srt').write_text('\n'.join(subs),encoding='utf-8')
(ROOT/'source/v01/shots-preview.json').write_text(json.dumps(shots,ensure_ascii=False,indent=2),encoding='utf-8')
files=[
 'assets/v01/teaching-car.blend','assets/v01/teaching-car.mesh.json','assets/v01/brand-original.png',
 'audio/v01/preview-narration.wav','source/v01/timeline-preview.json','source/v01/physics/preview-frames.json',
 'output/v01/roadster-mechanism-preview-v01.mp4','output/v01/roadster-mechanism-preview-v01a.mp4',
 'references/v01/nasa-thrust-node.html','references/v01/source-ledger.json']
rows=[]
for rel in files:
 p=ROOT/rel;rows.append({'path':rel,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(ROOT/'work/v01/asset-hashes.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('EXPORTED',len(subs),'draft captions;',len(shots),'shots;',len(rows),'hashes')
