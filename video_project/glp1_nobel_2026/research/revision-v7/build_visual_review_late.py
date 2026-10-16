"""Record human-model visual review of actual Film preview samples; not an automatic QA pass."""
from pathlib import Path
import json, hashlib
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[2]
INDEX=ROOT/'tmp/v7-preview-01/sheets/index.json'
OUT=ROOT/'research/revision-v7'
NOTES={
46:('usable-static-samples','开口血管、血流和压力提示可辨认，主题对应；三帧不能验证泵血/弹性因果的连续动作。','保留该血流上下文，连续播放核查流向与压力动作。'),
47:('needs-fix','从血管转心脏主动脉再拉到躯干/大腿，句末弹性回缩解释可能提前失去局部对象。','延迟离场，并核对正常弹性段不自行变为硬化。'),
48:('blocker','F13598小动脉入场被不透明粉色组织完全遮住；后两帧可见小动脉但竖向肌肉条纹占据背景。','先淡透父组织再接近目标；固定流量/固定压差二选一，明确收缩动作。'),
49:('blocker','F14031退出时又被巨大的组织表面盖住；三种升压因素仍主要依靠文字。','修退出透明层级；保持同尺度，用已有血管/循环表现容量、阻力与弹性。'),
50:('needs-fix','滤过/重吸收叙述时仍主要显示不透明肾外形，机制没有进入可见窗口。','在述及滤过前，平滑显示肾内肾单位并留下器官锚点。'),
51:('needs-fix','F14359肾单位过小；F14445原图管路清楚但颗粒极细淡，钠/水回到血侧的方向不可辨。','增大机制粒子的屏幕尺寸、对比和方向；同视野显示管腔到血侧。'),
52:('needs-fix','三帧未清晰展示盐摄入减少与水钠回收变化之间的动作差异。','在既有肾单位保持视角，显示钠输入和回收减少，避免只换标签。'),
53:('needs-fix','干净的心肾总览和黄色粒子，但肾素/血管紧张素路径与分支不够明确。','同器官尺度分步高亮肾→血管信号，不要把RAAS画成神经实体管。'),
54:('needs-fix','同心肾总览，未清楚见到肾上腺分支或可辨认的水钠响应。','标出肾上腺并让到达信号触发回收响应。'),
55:('needs-fix','心肾总览有运动提示，但信号、血管与水钠反应的先后因果不清。','保留器官连线，减少同时高亮，让支路依次响应。'),
56:('needs-fix','讲内脏/肾周脂肪时画面仍主要是心肾，脂肪极弱或不可辨。','以柔和半透明脂肪包绕相关区域，避免任意压扁真实器官。'),
57:('needs-fix','同心肾段落转上气道，需要连续播放验证父层透明与目标到达；单帧不能证明呼吸作用。','复检跨尺度入场，并让气道通气/阻力有可见过程。'),
58:('usable-static-samples','舌、咽部与上气道可辨认，标注对应且布局清楚。','连续段检查呼吸阻塞与恢复的顺序、通道截面变化。'),
59:('blocker','F16575上气道清楚，F16671已缩小；讲气压撑开气道时F16759几乎空白，仅很淡的人体。','撑开作用结束前保留气道，再平滑转往血管。'),
60:('blocker','F16849进入小动脉时被肌肉/皮肤实面盖住；后两帧小动脉可见，钙符号很小。','先退透父组织，并清楚区分钙流入减少→平滑肌舒张。'),
61:('needs-fix','小动脉主体清楚，水肿/潮红/头晕副作用只有文字，无对应可见机制。','保留舒张机制为主，必要时加入同体系毛细血管侧滤出示意。'),
62:('needs-fix','F17507小动脉已缩在肌肉背景，F17600几乎是大腿肌肉，醛固酮/钠信号句子尚未结束。','延迟离场，在肾/血管对应路径上强调阻断受体而非停止AngII生成。'),
63:('needs-fix','F17696肾外形仍遮住内部；后两帧有留钾提示，但流向颗粒小且淡。','提高钾粒子可辨性，让血侧滞留与尿侧流失区别明确。'),
64:('needs-fix','F18074原图可确认：肾单位外形清晰，却看不清减少回收钠的动作，仅更换主题字。','在原远端小管位置表现Na回收变少、尿侧排出变多。'),
65:('needs-fix','先有钾尿侧流失标签，后两帧很快拉远为小肾单位和肾外形。','让尿侧流失过程完整结束再离场；保留标签到对应对象仍可见时。'),
66:('needs-fix','血压测量坐姿/袖带可读，但讲一段时间记录时未见可比较的记录趋势。','在测量场景加入少量日期和同尺度趋势作为生活收束，避免装饰性数据。'),
67:('blocker','F19035原图确认镜头进入桌底/背面，巨大桌板和桌腿盖住人，袖带/支撑标签指家具，字幕正讲袖带与心脏高度。','此句保持测量方向；之后从侧面绕过家具再离开。'),
68:('usable-static-samples','动脉壁上的斑块清晰，与风险话题对应，文字/主体分布可读。','连续播放验证到达时无突然替换和侧壁穿越。'),
69:('needs-fix','三帧均是同一斑块血管，血栓形成变化尚不清楚。','让斑块破口在对应时机可见，再引入聚集细胞。'),
70:('needs-fix','F19789血栓/剩余通道标签出现时团块尚不明显，F19869才见红色团块增长。','标签跟随可辨认目标出现，不早于其形态。'),
71:('needs-fix','血栓表现为实心红色团块外侧少量白线，纤维蛋白网固定细胞/血小板的结构不够可见。','用局部半透明或剖面暴露网与细胞，使网逐步把聚集物固定。'),
72:('usable-static-samples','已有团块保持，标签指后续聚集减少，没有把抗血小板画成溶栓。','连续段验证聚集速率降低而非已有栓块消失。'),
73:('blocker','F20616原图确认巨大半透明心脏红壳，未能辨认心房内涡流/血栓；叙述脑栓塞时无清楚行进路径。','在左心房局部剖窗暴露血流与附壁栓，血块沿真实出口方向迁移，避免单靠标签。'),
74:('blocker','F20916同样心脏红壳遮住机制；只有凝血减少标签，无法辨认减少形成/继续长大的可见动作。','与h073同尺度显示新网/新聚集减少，保留原有栓块。'),
75:('needs-fix','解释降压/降脂/抗血小板/抗凝的作用差别，三帧仍为同一心房凝血画面。','用当前人体系统内连续移焦/分部高亮对应作用位置，避免单一心房代替全部药物。'),
76:('needs-fix','讲出血风险仍是心脏凝血图，未见止血过程；“别错过急救时间”标题此时已提前出现。','让出血风险对应止血凝聚减弱，或在此句维持明确总结，不误指心房出血。'),
77:('needs-fix','脑/心到人体总览可见，但第一帧残留凝血减少标签，与卒中识别叙述不一致。','进入卒中识别时收掉上一机制标签，保持脑和生活识别的视觉联系。'),
78:('blocker','前两帧坐着吃饭，F22143突然站在桌后且头顶裁切；字幕仍总结饭菜选择。','保持完整生活动作，起身要有连贯支撑/重心过程，并确保构图包含头部。'),
79:('blocker','F22239原图确认前臂被拉成薄丝带，双手张开，膝顶近桌面；上一句已站起，此句又坐下。','修骨骼/蒙皮过渡，取消坐立回弹与穿桌；完成起身后再展示活动。'),
80:('needs-fix','三帧几乎同一静立人物，选择能坚持的吃法没有生活/生理动作。','用少量可见选择或饮食分量改变与饱足联系，避免只放人物待机。'),
81:('needs-fix','讲睡眠影响食欲仍为同一静立模型，无睡眠/食欲调节可见过程。','让脑部信号与饱足通路在人物上柔和显现，保持概括尺度。'),
82:('needs-fix','讲脂肪减少减轻肾留钠/神经升压负担，仍为静立人物，无对应系统响应。','体表半透明后让内脏脂肪减量与肾/神经提示相连，不必深钻。'),
83:('needs-fix','讲活动正向反馈，三帧仍为静立人物。','人物自然活动或肌肉/器官同屏响应，表达行动与身体能力的联系。'),
84:('needs-fix','讲减重后饥饿增加/能耗下降，仍为静立人物；没有变化对照。','同人物内提示食欲信号回升和能耗适应，避免拟定精确个体数值。'),
85:('needs-fix','维持饮食活动睡眠/药物帮助的句子仍为静立人物，第三帧测量桌进入但对当前内容关联弱。','生活行为摘要与人体调节呼应；测量只在下句到达。'),
86:('needs-fix','三帧测血压坐姿清楚，但体重/腰围/血糖血脂趋势没有可见相应记录。','保留测量场景并展示整洁的趋势记录，明确为示意。'),
87:('blocker','F24639原图确认人站立，前臂垂下而“前臂得到支撑”标签仍保留，袖带管线和桌面随其残留。','坐姿测量持续到句末，退场先收测量标注；不要先站起再继续标支撑。'),
88:('usable-static-samples','从人体渐显器官全景，整体调节总结的对象对应且干净。','连续段检查皮肤和器官透明曲线，无骤换。'),
89:('needs-fix','三帧均为器官全景，最后甜饮换水的生活落点未见具体动作。','若保留器官总览，可用同一人物水杯动作收尾；确保片尾进场承接。'),
}
NATIVE=[13598,19035,14445,18074,20616,20916,22239,24639]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def relative(p): return str(p.relative_to(ROOT)).replace('\\','/')
index=json.loads(INDEX.read_text(encoding='utf8'))
rows=[]; sheets=[]
for sheet in index:
    selected=[x for x in sheet['clips'] if 46<=int(x['id'][1:])<=89]
    if not selected: continue
    p=Path(sheet['sheet'])
    sheets.append({'path':relative(p),'sha256':sha(p),'actually_viewed':True,'view_mode':'contact sheet image'})
    for clip in selected:
        n=int(clip['id'][1:]); status, finding, recommendation=NOTES[n]
        rows.append({'id':clip['id'],'narration_text':clip['text'],'sample_frames':clip['frames'],'sample_times_seconds':[round(x/30,3) for x in clip['frames']],'sheet':relative(p),'status':status,'finding':finding,'recommendation':recommendation,'continuous_motion_assessed':False})
native=[]
for f in NATIVE:
    p=ROOT/f'tmp/v7-preview-01/frames/element-{f:05d}.jpeg'
    native.append({'frame':f,'time_seconds':round(f/30,3),'path':relative(p),'sha256':sha(p),'actually_viewed':True})
report={'schema':'rainbow.manual-visual-review.v1','created_utc':datetime.now(timezone.utc).isoformat(),'reviewer':'lemon_opening_audio subagent','preview':'v7-preview-01 Film; source not frozen','scope':'h046–h089: all 23 contact sheets actually viewed, 3 samples/sentence; 8 native 1920x1080 frames opened for confirmation. h045 on the first sheet is outside assigned review. This is not full playback, animation smoothness certification, full-frame coverage or audio listening.','overall_status':'changes-required; no automatic pass','source_may_already_have_changed':True,'index_sha256':sha(INDEX),'sentence_count':len(rows),'sheets_viewed':sheets,'native_frames_viewed':native,'sentences':rows,'cross_cutting':['Typography is generally large and coherent in sampled frames; main failures are visibility, premature transitions and mechanisms explained only by labels.','Many identified issues have already been sent to root/camera/person agents. Fixes require new rendered evidence; these findings describe preview01 only.','Three still samples cannot establish continuous causality, speed, easing, flow direction over time, or absence of popping between samples.'],'priority_recheck_frames':[13598,14031,14359,14445,16759,16849,17507,17600,18074,19035,20616,20916,22143,22239,24639,25219]}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'visual-review-h046-h089.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
md=['# V7 后半段画面人工抽帧审查','',report['scope'],'','结论：需要修改。所审画面为 preview01，源代码正在修改；本报告不对更新后版本作结论。','',f'覆盖 {len(rows)} 句、{len(sheets)} 张接触表、{len(native)} 张原生帧。每张接触表均实际打开查看；不等同全片播放。','','## 优先复检','',', '.join('F'+str(x) for x in report['priority_recheck_frames']),'','## 逐句','', '| 句子 | 帧 | 状态 | 观察 | 建议 |','|---|---|---|---|---|']
for r in rows: md.append('| '+r['id']+' | '+', '.join(map(str,r['sample_frames']))+' | '+r['status']+' | '+r['finding']+' | '+r['recommendation']+' |')
md+=['','## 证据与边界','','接触表索引：`tmp/v7-preview-01/sheets/index.json`。JSON 附全部接触表/原图的 SHA-256、路径与采样帧，便于区别旧图与后续复检。','','本轮未听音轨，未连续播放全片；未将静帧判定为流畅度通过。','']
(OUT/'visual-review-h046-h089.md').write_text('\n'.join(md),encoding='utf8')
print(json.dumps({'sentences':len(rows),'sheets':len(sheets),'native':len(native),'status_counts':{s:sum(r['status']==s for r in rows) for s in sorted(set(r['status'] for r in rows))}},ensure_ascii=False))
