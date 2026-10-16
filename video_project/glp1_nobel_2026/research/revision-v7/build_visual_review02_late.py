from pathlib import Path
import json,hashlib
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'research/revision-v7'
PREVIEW=ROOT/'tmp/v7-preview-02'
# These are observations made after opening every listed image, not results
# inferred from the code or copied as passes from the earlier preview.
NOTES={
46:('usable-sampled-frames','血管剖面、弹性管壁与压力提示清晰，三个样本对应。','仍需连续片段核对泵血/回缩动作。'),
47:('improved-with-caveat','局部血管保留到中间帧，末帧才到心脏/主动脉，较前轮不再直接大腿；中间F13420背景黄色光斑抢眼。','近景减少背景血管发光，保留压力动作。'),
48:('blocker-remains','F13598原图仍是巨大不透明粉色大腿组织，完全看不到小动脉；后两帧可见目标。','进入父组织之前退透该几何；复检13560–13650。'),
49:('fixed-at-sampled-frame','F14031不再被实面覆盖，退出时能看到条状肌肉背景和逐渐缩小的血管。','核对连续退出与到肾的跨位置路线。'),
50:('unchanged-caveat','肾脏定位明确，但过滤/收回营养的句子仍停在肾外形，具体小管机制下一句才出现。','可保器官定位；不把此样本宣称为可见滤过仿真。'),
51:('improved-with-caveat','原图F14445管壁变厚、可见细青色方向符号；新增水钠回到血侧标注。F14359入场目标仍很小。','方向符号原图可辨，手机缩小仍弱，局部可增屏幕可读性。'),
52:('improved-with-caveat','少盐/钠输入减少标注明确，保持同肾单位；三帧不足以核定输入/回收的速率对比。','使用连续片段评估粒子变化；不新增无关全餐场景。'),
53:('improved-at-sampled-frames','肾发调节信号与作用到血管的标注已明确，心肾间有金色粒子。','按连续播放确认信号先到、器官后响应。'),
54:('improved-at-sampled-frames','肾上腺释放醛固酮、肾多留钠两端已标清，低对比器官上下文连贯。','方向对应可读；定量作用大小仍只是教学示意。'),
55:('improved-with-caveat','心肾信号可定位，升压环节保持同尺度；微小血管收缩/体液量变化在静帧中不易区分。','无需新镜头，连续片段核查时间顺序。'),
56:('improved-with-caveat','新增肾周脂肪标注，肾周浅黄色轮廓可见但很淡，较前轮有指向。','避免把仅有文字当作脂肪体积变化验收。'),
57:('usable-sampled-frames','心脏肾脏响应与向上气道的定位路线可读，没有前轮严重遮挡。','连续转场尚需播放验证。'),
58:('usable-sampled-frames','舌/咽壁/舌后气道标注可读，管道由前到后辨认清楚。','呼吸阻塞动态速度需连续观察。'),
59:('fixed-at-sampled-frame','F16759仍保持完整气道及正压撑开图，前轮几乎空白的问题已消失。','保留此停留，再检查下句入场。'),
60:('fixed-at-sampled-frame','F16849现为人体/大腿定位总览，没有原先整块实面盖屏；后两帧到小动脉。','连续样本间仍需查是否穿组织，不能只凭三帧宣称全解决。'),
61:('usable-with-caveat','舒张后的同一小动脉可见；副作用仍主要是文字，没有额外机制。','属于内容丰富度限制，不列渲染阻断。'),
62:('improved-with-caveat','前两帧目标保持，接收位置阻断/小动脉放松标签对应；末帧17600缩得很小但不再被大腿实面盖住。','末句仍讲留钠信号，退场可再稍迟，现为节奏弱项。'),
63:('improved-with-caveat','中后两帧清楚标出钾的血侧留存；第一帧仍在肾定位转场。','离子箭头小，连续片段核实净流向。'),
64:('improved-with-caveat','F18074原图可见青色方向符号；两端标注为减少回收/更多水钠尿侧。','粒子仍很细，机制位置为概括肾小管示意，不能当作精确药物作用部位模型。'),
65:('localized-transition-fix','前两帧尿侧失钾清楚；F18443原图出现覆盖大半画面的粉色父组织，目标小到接近点而标注仍大。','延迟父组织恢复，或先退远建立肾外形，再保留宏观定位。'),
66:('usable-with-caveat','测量坐姿、袖带与托臂稳定，记录趋势依然主要由文案说明。','没有真实记录数据可避免虚构数值；此项不列视觉阻断。'),
67:('fixed-at-sampled-frame','F19035保持正向测量构图，袖带高度句完整，钻桌底/家具盖脸已修复。','仍需检查到下一场之间的连续路径。'),
68:('improved-with-caveat','测量退出经人物、心脏/主动脉，到同一血管局部；到达后斑块可见。','前两帧在转场，不能据此认定所有中间帧均无穿模。'),
69:('usable-with-caveat','斑块在管壁位置清楚，血栓形成动作留到下一句；当前句属于铺垫。','静态概括可接受，不列阻断。'),
70:('localized-label-fix','F19789“血栓堵通道”标签先出现，团块尚不明显；F19869团块清晰生长。','标签应随可辨团块出现，避免让观众把平斑块当成新血栓。'),
71:('improved-at-sampled-frames','血栓体积增长明显，纤维网条线及剩余通道可读；材质仍为简化团块。','三帧有增长对照；颗粒与纤维的细节仍属示意，不当作真实扫描。'),
72:('usable-sampled-frames','既有血栓保留，继续聚集减少标签对应；离开时同一血管剖面一起缩小。','抗血小板未被画成消失旧栓，连续速率待视频核查。'),
73:('improved-but-local-fix-required','F20616/20709原图能辨认青色流向与生长的单团心房血栓；大血管红面仍挡住半环。F20709有巨大黄白亮带像火焰，明显抢走主体。','心房近景退透大血管并取消其发光脉冲；保留浅房壁与机制。'),
74:('improved-with-caveat','F20916已有血栓和变少的金色反应可辨，前轮完全红壳问题部分解决；红色大管仍占较多面积。','与h073共同清理主血管遮挡，保留现有栓块。'),
75:('fixed-at-sampled-frame','已退出心房到心/脑/肝肾系统概括，作用类别随句更换，不再一直讲药但显示同一心房。','第二张降脂句未见强烈局部提示，属于可读性可提升项。'),
76:('usable-with-caveat','心脑总览概括风险，上一凝血标签已移除；没有具象出血机制。','此项作为一般风险说明可保留，不列严重错误。'),
77:('fixed-at-sampled-frame','卒中识别时仅保留脑/心定位，没有上一凝血减少标签悬挂。','继续向生活场景的连续变换待播放。'),
78:('fixed-at-sampled-frame-with-caveat','F22143原图确认仍坐着，手臂正常；不再站起裁头。餐桌已左移，尚在画面内但透明度很低。','坐立严重问题解决；如果严格要求移出后再消失，应将桌子保持可见至出画。'),
79:('fixed-at-sampled-frame','F22239原图前臂恢复正常体积，姿态已站起，未见反复坐下或穿桌。','三帧主要为静立，不能据此证明完整自然步行/力量运动。'),
80:('improved-at-sampled-frames','后两帧由人物到器官系统，饱足支持持续性的标签和信号有显示，不再全句静立。','总结尺度适当；连续帧检查透明变换。'),
81:('improved-at-sampled-frames','保持脑/内脏相同整体尺度，用信号说明食欲调节；不再单纯静立人物。','睡眠内容通过概括通路说明，未做睡眠行为。'),
82:('improved-with-caveat','同系统内出现脂肪逐渐减少标签和金色提示；静帧中体积变化较弱。','不应把标签等同实际脂肪体積响应已充分可读。'),
83:('improved-at-sampled-frames','肌肉方向有明显青色信号串，活动反馈对应同一人体系统。','同尺度保持良好，动态因果待连续播放。'),
84:('improved-at-sampled-frames','脑与脂肪相关信号、标签在同人体显示，较前轮静立有机制概括。','这是概括示意，没有个人代谢定量结论。'),
85:('improved-with-caveat','器官系统联系饮食活动睡眠，末帧恢复体表进入测量；人物头顶在转场有裁切。','转场裁切若非穿模无需全景；持续帧需检查自然性。'),
86:('usable-with-caveat','坐姿测量稳定，仍无具体腰围/血糖血脂记录图。','作为结尾行动提示可保留，不列渲染阻断。'),
87:('fixed-at-sampled-frame','F24639原图确认测量姿态保持，前轮站起但标签仍说托臂的问题已消失。','前臂与垫接触较轻，属于细节，不再有明显错姿标签。'),
88:('usable-with-caveat','人物→器官→人物串联总结，前后透明层变化有中间态；结尾皮肤恢复。','三帧不构成连续切换流畅性通过。'),
89:('changed-with-caveat','已从器官静帧换为站立人物收束，没实际做甜饮换水动作。','内容落点靠文案，非阻断；若继续润色可用生活行动落地。'),
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(ROOT)).replace('\\','/')
old=json.loads((OUT/'visual-review-h046-h089.json').read_text(encoding='utf8'))
prior={r['id']:r for r in old['sentences']}
index=json.loads((PREVIEW/'sheets/index.json').read_text(encoding='utf8'))
rows=[];sheets=[]
for s in index:
 selected=[c for c in s['clips'] if 46<=int(c['id'][1:])<=89]
 if not selected:continue
 p=Path(s['sheet']);sheets.append({'path':rel(p),'sha256':sha(p),'actuallyViewed':True})
 for c in selected:
  status,observation,nextStep=NOTES[int(c['id'][1:])]
  rows.append({'id':c['id'],'text':c['text'],'frames':c['frames'],'seconds':[round(f/30,3) for f in c['frames']],'sheet':rel(p),'status':status,'observed':observation,'nextStep':nextStep,'priorStatus':prior[c['id']]['status'],'priorFinding':prior[c['id']]['finding'],'continuousMotionAssessed':False})
native=[]
for f in [13598,18443,14445,18074,20616,20709,20916,22143,22239,24639]:
 p=PREVIEW/f'frames/element-{f:05d}.jpeg';native.append({'frame':f,'path':rel(p),'sha256':sha(p),'actuallyViewed':True})
report={'schema':'rainbow.manual-visual-review.v2','createdUTC':datetime.now(timezone.utc).isoformat(),'preview':'v7-preview-02 full Film overlays','scope':'Actually viewed every one of the 23 contact sheets covering h046–h089 (3 samples/sentence) and opened 10 native frames. No continuous playback or audio listening; no whole-video visual pass. h045 in first sheet is outside assigned range.','sourceEditsInThisReview':False,'overall':'Most prior severe sampled defects improved; local fixes still required before final visual signoff.','priorityFixes':[{'frames':[13598],'issue':'Arteriole entry completely covered by opaque parent muscle','severity':'blocker'},{'frames':[18443],'issue':'Large parent kidney/tissue sheet reappears while tiny nephron and oversized labels remain','severity':'localized-transition'},{'frames':[20616,20709,20916],'issue':'Main vascular red shells and yellow emissive pulse dominate/partly obscure atrial mechanism','severity':'localized-occlusion-aesthetic'},{'frames':[19789],'issue':'Clot-blocking label arrives before a clearly visible clot','severity':'localized-label'}],'fixedAtReviewedSamples':[14031,16759,16849,19035,22239,24639],'sentences':rows,'sheetsViewed':sheets,'nativeViewed':native,'limitations':['A still contact sheet cannot certify temporal easing, all intermediate occlusions, causality, beat synchronization, or natural gait.','No audio was played; V7 audio installation and numerical verification are separate evidence.','Some summary sentences are supported by organ-scale signal illustrations instead of full detailed mechanisms.','Clinical images are teaching models, not patient-specific scans or CFD.']}
(OUT/'visual-review02-h046-h089.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
md=['# V7 preview02 后半段复检','',report['scope'],'','结论：大部分前轮严重抽帧缺陷已修复，仍需局部修补。此轮只读，没有修改 src。','','## 优先局部修补','']
for f in report['priorityFixes']:md.append('- '+', '.join('F'+str(x) for x in f['frames'])+'：'+f['issue']+'（'+f['severity']+'）。')
md+=['','已在对应样本确认改善：F14031、F16759、F16849、F19035、F22239、F24639。','','## 逐句观察','','| 句子 | 帧 | 状态 | 实际观察 | 下一步 |','|---|---|---|---|---|']
for r in rows:md.append('| '+r['id']+' | '+', '.join(map(str,r['frames']))+' | '+r['status']+' | '+r['observed']+' | '+r['nextStep']+' |')
md+=['','## 证据','','JSON记录23张接触表、10张原图的路径和SHA256，并逐句保留上一轮结论便于比对。仅审查所列样本，不等同完整播放通过或完整听审。','']
(OUT/'visual-review02-h046-h089.md').write_text('\n'.join(md),encoding='utf8')
print(json.dumps({'sentences':len(rows),'sheets':len(sheets),'native':len(native),'srcEdited':False}))
