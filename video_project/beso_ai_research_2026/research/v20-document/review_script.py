from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json

ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parent.parent
DRAFT=PROJECT/'work/v20-audio/draft.json'
draft=json.loads(DRAFT.read_text(encoding='utf-8-sig'))
text_by_id={s['id']:' '.join(c['text'] for c in s['clips']) for s in draft['scenes']}
tts_by_id={s['id']:' '.join(c['ttsText'] for c in s['clips']) for s in draft['scenes']}
order=[s['id'] for s in draft['scenes']]
sources=[
('D:/python_project/beso_ai/frontend_static/flow_main.beso7_demo.js',487,'showCandidatePanelInteractive; user button, API request and90s timeout recommendation'),
('D:/python_project/beso_ai/backend/candidates/registry.py',86,'select_candidate; user/system selected flag and selected_at, preserving registry entries'),
('D:/python_project/beso_ai/backend/routes/candidates_api.py',57,'POST /select; optional candidate snapshot'),
('D:/python_project/beso_ai/backend/demo/beso7_live_pipeline.py',1335,'confirm_candidate_selection; user confirmation and versions snapshot')]
code_sources=[{'path':p,'line':line,'role':role,'sha256':sha256(Path(p).read_bytes()).hexdigest()} for p,line,role in sources]
scene_reviews=[
{'id':'hook','status':'supported-with-visual-scope','locators':['P0010','P0021','P0108'],'note':'Material/response tradeoff is a supported engineering goal. Do not visually imply full-scale storm trials.'},
{'id':'value','status':'supported','locators':['P0015','P0064','P0065'],'note':'Requirements, tasks and tool orchestration match the document.'},
{'id':'tools','status':'supported','locators':['P0015','P0064','P0085'],'note':'BESO narration 贝索 is consistent with pronunciation requirement.'},
{'id':'sizing','status':'supported','locators':['P0100','P0101','P0107'],'note':'Topology then dimensional optimization; strength/hydrostatic/fatigue constraints supported.'},
{'id':'recovery','status':'supported-with-visual-scope','locators':['P0039','P0071','P0072'],'note':'Automatic recovery is configured and bounded. Display Mesh/求解设置 as modified parameters; hold loads/material/criteria fixed.'},
{'id':'recheck','status':'supported','locators':['P0073','P0074','P0081'],'note':'Rerun and original failure post-check are required before advancement; numerical recovery remains separate from engineering feasibility.'},
{'id':'selection','status':'supported-by-document-and-code','locators':['P0051','P0059','P0080'],'note':'Optional human intervention in manuscript plus actual selection UI/API in product; do not imply every selection must be manual.'},
{'id':'physics','status':'supported','locators':['P0015','P0108'],'note':'Zwind follows selected candidate and performs final coupled verification. ttsText uses Zee wind and 细泊 solely for pronunciation; subtitles retain Zwind/系泊.'},
{'id':'comparison','status':'supported','locators':['P0010','P0021'],'note':'20MW and10.8% updated correctly; research-case and reference-baseline qualification included.'},
{'id':'steel','status':'supported-derived','locators':['P0021'],'note':'(278−247.9)×20=602t, rounded input; “按同容量折算/约” correctly qualifies it.'},
{'id':'tradeoff','status':'supported','locators':['P0024','P0026'],'note':'Factored mooring tension−1.0%, pitch+19.2%; pitch9.56°<project10° and factored tension14041<20165.9kN. Avoid old8.1%/13037kN.'},
{'id':'workflow','status':'supported','locators':['P0039','P0059','P0060'],'note':'Auto recovery and human tradeoff roles are clear.'},
{'id':'version','status':'supported-with-visual-scope','locators':['P0015','P0069','P0080'],'note':'Model/input/log retention and report/drawing workflow supported. Actual complete artifacts must be present for the displayed run; selection alone is not physical feasibility.'},
{'id':'certificate','status':'supported-by-certificate-limited-scope','locators':[],'note':'Software Approval in Principle wording preserves original certificate scope; avoids manuscript’s broader selected-design claim.'},
{'id':'close','status':'supported-after-wording-tightening','locators':['P0057','P0133'],'note':'Updated “让设计过程，有据可查” removes the previous absolute every-result promise. Visual should still show a concrete retained bundle rather than claim full reconstruction for every historic run.'}
]
checks=[
{'id':'latest_steel_108','passed':'百分之十点八' in text_by_id['comparison']},
{'id':'latest_steel_602','passed':'六百零二' in text_by_id['steel']},
{'id':'same_capacity_20','passed':'二十兆瓦' in text_by_id['comparison']},
{'id':'zwind_after_selection','passed':order.index('selection')<order.index('physics')},
{'id':'recovery_followed_by_recheck','passed':order.index('recovery')<order.index('recheck')<order.index('selection')},
{'id':'retains_original_requirements','passed':'原来的设计要求始终保留' in text_by_id['recheck']},
{'id':'tradeoff_both_directions','passed':'张力略降' in text_by_id['tradeoff'] and '纵摇增加' in text_by_id['tradeoff']},
{'id':'subtitle_spelling_not_phonetic','passed':'Zwind' in text_by_id['physics'] and '系泊' in text_by_id['physics'] and '细泊' not in text_by_id['physics']},
{'id':'tts_mapping','passed':'Zee wind' in tts_by_id['physics'] and '细泊' in tts_by_id['physics']},
{'id':'software_certificate_scope','passed':'智能设计软件' in text_by_id['certificate'] and '原则性批准' in text_by_id['certificate']}]
suggestions=[
{'id':'mesh_patch_repair','scenes':['recovery'],'durationSeconds':5.5,
 'camera':'沿现有三浮柱径向梁推进到一段局部网格，保持连接到同一整体模型；最后沿梁切向退出，为重算镜头让位。',
 'animation':'0–1.2s仅把2–3个细长/翻折三角元的边线染成低饱和朱红，并短促描边；1.2–2.2s诊断点沿一条线送入Mesh设置；2.2–4.4s在原表面位置将局部三角元拆分/重新分布，外轮廓保持不动；4.4–5.5s细密网格回到深青，状态由“待修复”移到“待复算”。',
 'copy':['网格质量','局部重划','待复算'],
 'implementation':'同一BufferGeometry保留边界顶点；仅局部索引/顶点在固定边界内插值。用一根tube或屏幕投影路径连接诊断和工具。easing采用smoothstep五次曲线；不瞬间换整个模型。',
 'evidenceRule':'几何动画标为流程示意；不杜撰质量数值。修网格后不能立即显示工程通过，要等下一镜头重算。'},
{'id':'rerun_then_postcheck','scenes':['recheck'],'durationSeconds':5.0,
 'camera':'镜头继续沿梁飞行，一条任务轨道贴着梁的投影从近到远；始终留出模型主体和字幕安全区。',
 'animation':'0–1s“荷载/材料/限值”三枚小锁保持原位不动；1–3s一个数据光点经过“重算”并回到刚才故障位置进行环形扫描；3–4s先点亮“故障复检”，再点亮“工程检查”；4–5s两项完成后，路闸才向侧面打开，光点进入候选分支。',
 'copy':['重算','故障复检','工程检查'],
 'implementation':'一个进度scalar驱动光点position和轨道drawRange；两道门用门条位置控制，通过次序写死到时间线。复检成功符号用小型对钩描边，不用全屏弹窗。',
 'evidenceRule':'若无对应真实run，只呈现机制示意，不放捏造残差/通过率。荷载箭头、材料图例与阈值锁应在修复前后完全一致。'},
{'id':'candidate_choice_to_zwind','scenes':['selection','physics'],'durationSeconds':7.0,
 'camera':'从模型侧前方轻轻后撤，形成三份保持同一比例的候选，沿浅弧排开；选中后镜头追随中间方案前进，自然接海面Zwind镜头。',
 'animation':'0–2s原模型分出三条细版本轨迹，模型不随机爆炸；2–4s仅显示版本名与各自真实已有状态，用户光标点击“选择此方案”；4–5s选中边框收拢为一个小版本印记，其余两案沿弧线后撤保留；5–7s选中方案带着模型/输入/日志三个文件点继续前进，先显示“已选·待验证”，进入Zwind后才显示运行状态。',
 'copy':['候选A','候选B','候选C','已选 · 待验证'],
 'implementation':'3个共享geometry的group，位置用CatmullRom弧线；未选模型移动到离屏后再隐藏。保留版本连接线；鼠标点击坐标绑定选中卡片锚点。可用真实候选名替代A/B/C。',
 'evidenceRule':'没有三案独立结果时，不给它们编造钢量/分数，也不声称都已求解通过。自动推荐与人工选择是不同状态；人工选中不等于Zwind验证已通过。'}]
result={'schema':'v20-second-pass-script-review-v1','createdAt':datetime.now(timezone.utc).isoformat(),'draftFile':str(DRAFT),'draftSHA256':sha256(DRAFT.read_bytes()).hexdigest(),'documentSHA256':'2d6c177f8f7a29c73b77074336131e75d3a7f96013b425fc42fd781ce4160c9d','blockingIssues':[],'synthesisStopRequired':False,'checks':checks,'checksAllPassed':all(c['passed'] for c in checks),'sceneReviews':scene_reviews,'productSelectionEvidence':code_sources,'productSelectionLimits':['Read-only source inspection, no live selection mutation executed.','Demo UI supports manual button and90s timeout recommended choice. Do not claim mandatory human selection on every run.','Demo score explicitly says AI Review prediction, not final Phase V measured verification.','Snapshot errors can be reported/handled separately, so selected status alone does not prove complete artifact archival.'],'dynamicVisualizationSuggestions':suggestions,'noSrcOrAudioModified':True,'audioListeningPerformed':False,'limits':['Text-only review; ASR and listening still required after TTS.','Visual mechanism proposals are not fresh engineering calculation results.']}
save=ROOT/'script-review.json'
save.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'draftSHA256':result['draftSHA256'],'blockingIssues':0,'checksPassed':sum(c['passed'] for c in checks),'checksTotal':len(checks),'suggestions':len(suggestions)},ensure_ascii=False))
