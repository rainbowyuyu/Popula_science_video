from pathlib import Path
import json
R=Path('.');p=R/'research/story.json';d=json.loads(p.read_text(encoding='utf8'));patch={'r037':'这也解释了为什么追不到彩虹。你一直往前走，接到阳光的水滴就一直在换。','r047':'背对太阳，缓慢调整你和水雾的位置。你会发现，彩虹会随着你的移动而改变。','r050':'一滴滴雨水，把不同颜色的光送到你的眼前。你站的位置，决定了天空里那条彩虹。'}
for c in d['clips']:
 if c['id'] in patch:c['text']=c['spoken']=patch[c['id']]
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
# Explicit record of narration repair, preserves old takes in audit directory.
backup=R/'research/audio/superseded';backup.mkdir(exist_ok=True)
for cid in patch:
 for src in [R/'public/audio'/f'{cid}.wav',R/'research/audio/raw'/f'{cid}-raw.wav',R/'research/audio/takes'/f'{cid}.json']:
  if src.exists():src.replace(backup/src.name)
(R/'research/audio/pronunciation-repair.json').write_text(json.dumps({'patch':patch,'reason':'Potential ASR ambiguity on 尽头,亮起,一封/信. Rewrite to direct ordinary speech and re-synthesize; no pitch or time manipulation.','subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
