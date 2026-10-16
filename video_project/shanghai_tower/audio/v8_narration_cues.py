"""Expose measured utterance cue times for continuous scene choreography."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from qc import chars,map_times
def read(p):return json.loads(p.read_text('utf-8-sig'))
tl=read(ROOT/'public/timeline.json')
phrases={
 's001':['上海中心','六百三十二米','先把这座楼拆开','摊在眼前','一排排重复的构件','每一组都有自己的位置和任务','名字旁边','它来自哪一段','站在哪个位置','这栋楼的骨架'],
 's002':['最外面','玻璃和边框','围出室内空间','往里一层','楼板接住人和家具','脚下的钢梁','交给旁边的柱子','看不见这场接力'],
 's003':['斜着交叉的杆件','一座座小钢桥','上下两根横杆','分别叫上弦和下弦','斜杆','连成三角形','伸臂从中间搭到外圈','环带沿着周边接力','把巨柱连成一伙','风从侧面推来','它们就一起分担'],
 's004':['中间的厚墙','围成核心筒','外圈巨柱','送往地下的筏板和桩群','现在','把这些部分放回原位','顺着传力的路','从地下看起'],
 's006':['沿着桩身向下传','从侧面提供向上的阻力','桩底的土'],
 's007':['变化的侧向推力','桩头先移动','颜色把桩身的受力标出来','推力撤掉以后','一根桩的计算例子'],
 's013':['核心筒','画面放大了位移','旁边的直线'],
 's018':['先拆开看','上下两条横杆','上弦和下弦','中间的斜杆','上下弦连住两端','楼一弯','合起来以后','六处关键高度'],
 's019':['一起转动','一头向下压','另一头向上提','看这两根斜杆的颜色','这一刻的受力变化'],
 's020':['橙色','向受压方向变化','蓝色','向受拉方向变化','风带来的增量','再看外圈的柱子','压力减小的一边','仍然在受压'],
 's021':['伸臂把力带到外圈','环带钢架','分给更多柱子','借整个宽度'],
 's029':['平均风压','迎风的一面受到推压','侧面和背面的压力','哪一片在被推','哪一片在被向外吸'],
 's030':['一百米高处','平均风速','从两边绕过去','切面升到三百米','来风方向没变','再升到五百米','三个高度的风'],
 's031':['切面竖起来','穿过塔身中间','楼顶上方的风','慢了下来'],
 's032':['一百二十度的扭转','接下来','变化的侧向推力','沿着连接','送回地下'],
}
output=[]
for c in tl['clips']:
 if c['id'] not in phrases:continue
 asr=read(ROOT/'audio/asr'/f"{c['id']}.json")
 assert asr['sourceSHA256']==c['audioSHA256']
 target,mapping,_=map_times(c.get('ttsText',c['text']),asr['words'],c['voiceDurationSeconds'])
 clip_phrases=phrases[c['id']]
 # Current review audio stays usable while the independently checked final
 # candidates are held for one coordinated promotion with the CFD narration.
 if c['id']=='s019' and chars('看这两根斜杆的颜色') not in target:
  clip_phrases=['一起转动','一头向下压','另一头向上提','柱子的颜色跟着改变']
 if c['id']=='s020' and not target.startswith('橙色'):
  clip_phrases=['风带来的受力变化','压力增加','压力减小','指的是这份增量','仍然可能在受压']
 if c['id'] in ['s029','s030','s031','s032'] and chars(clip_phrases[0]) not in target:
  continue
 cues=[]
 for phrase in clip_phrases:
  normalized=chars(phrase);i=target.find(normalized)
  if i<0:raise ValueError((c['id'],phrase))
  start=mapping[i][0];end=mapping[i+len(normalized)-1][1]
  cues.append(dict(phrase=phrase,voiceStart_s=round(start,4),voiceEnd_s=round(end,4),
      clipStartFraction=round(start/(c['duration']/tl['fps']),6),clipEndFraction=round(end/(c['duration']/tl['fps']),6),
      filmStart_s=round(c['start']/tl['fps']+start,4),filmEnd_s=round(c['start']/tl['fps']+end,4)))
 output.append(dict(id=c['id'],clipStartFrame=c['start'],clipEndFrame=c['end'],voiceDuration_s=c['voiceDurationSeconds'],cues=cues))
record=dict(revision='v8-parts-atlas-opening',timingSource='Actual selected waveform and ASR word alignment; inspect shots around each cue. ASR alignment does not certify tonal pronunciation.',clips=output)
for name in ['v8-narration-cues.json','v7-narration-cues.json']:
 out=ROOT/'research'/name
 out.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Saved',len(output),'clip cue groups')
