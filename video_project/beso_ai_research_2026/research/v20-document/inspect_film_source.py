"""Read-only content inventory for the active v20 source, separate from visual approval."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json

OUT=Path(__file__).resolve().parent
ROOT=OUT.parent.parent
files=['src/LaunchV20.tsx','src/ClosedLoopV20.tsx','src/launch-v20-story.json','src/launch-v20-captions.json','src/launch-v20-direction.ts','public/beso-research/physics/zwind-response.json']
hashes={name:sha256((ROOT/name).read_bytes()).hexdigest() for name in files}
src=(ROOT/'src/LaunchV20.tsx').read_text(encoding='utf-8-sig')
closed=(ROOT/'src/ClosedLoopV20.tsx').read_text(encoding='utf-8-sig')
story=json.loads((ROOT/'src/launch-v20-story.json').read_text(encoding='utf-8-sig'))
response=json.loads((ROOT/'public/beso-research/physics/zwind-response.json').read_text(encoding='utf-8-sig'))
ids=[s['id'] for s in story['scenes']]
checks=[
 {'id':'duration_under_two_minutes','passed':story['duration']/story['fps']<120,'seconds':story['duration']/story['fps']},
 {'id':'15_scenes','passed':len(story['scenes'])==15},
 {'id':'latest_screen_numbers','passed':all(v in src for v in ['10.8','247.9','602','5,560 t → 4,958 t','14,185 → 14,041','8.02° → 9.56°','20,165.9 kN','案例限值 10°'])},
 {'id':'latest_scope_labels','passed':all(v in src for v in ['研究案例 · 同为 20 MW','图强号参考基线','20 MW 等容量折算','构型示意 · 研究数据独立列示','含安全系数'])},
 {'id':'automatic_recheck','passed':'自动复检' in closed and '交给复查' not in closed},
 {'id':'selection_after_recovery_before_final_verification','passed':ids.index('recovery')<ids.index('recheck')<ids.index('selection')<ids.index('physics')},
 {'id':'bounded_close_copy','passed':'每个结果' not in story['scenes'][-1]['voice'] and '让设计过程' in story['scenes'][-1]['voice']},
 {'id':'software_aip_scope','passed':'AI Engineer 智能设计软件' in src and '软件功能、算法及参数原则性审查' in src},
 {'id':'mechanism_label','passed':'流程示意' in src},
 {'id':'independent_response_label','passed':'独立算例' in src or '独立回放' in src}
]
status={'schema':'v20-independent-source-content-review-v1','createdAt':datetime.now(timezone.utc).isoformat(),'hashes':hashes,'checks':checks,'allStaticChecksPassed':all(c['passed'] for c in checks),'visualAccepted':False,'normalSpeedWatchPerformed':False,'humanListeningPerformed':False,
 'sourceResponseScope':{k:response[k] for k in ['sourceTitle','evidenceType','screenLabel','claimBoundary','servoEnabled','solverProfile']},
 'reportedFindings':[{'id':'recheck_label','status':'resolved','evidence':'Component ending changed from 交给复查 to 自动复检.'},{'id':'close_absolute_claim','status':'resolved','evidence':'Final script uses 让设计过程，有据可查.'},{'id':'response_scope','status':'pending-root-review','priority':'scope clarification','detail':'Visible final-verification header describes the project method, but replay is an independent saved probe with servo disabled. Add visible independent/servo-disabled scope and visual-wave distinction; no narration rerecord needed.'},{'id':'mesh_vs_solver_repair','status':'nonblocking','detail':'Main narration differentiates mesh defects and solver convergence; recovery SVG shows two control sliders together. Avoid implying timestep alone repairs mesh; sequence these controls if desired.'}],
 'limits':['Static string checks do not prove visual readability or active frame pairing.','Current source is being edited; hashes identify the reviewed content.','Final-still review and encoded-video review remain pending.']}
status['revision'] = '2afc39fce9ba'
status['reportedFindings'][2] = {
 'id':'response_scope',
 'status':'resolved',
 'detail':'Final source and encoded frame 3082 explicitly label 存档独立回放 · 非论文验证. The product final-verification method and independent saved replay are not asserted to be the same paper-design run.'
}
status['limits'] = [
 'Static string checks alone do not prove visual readability; the separate encoded-boundaries/review.json records 55 sampled encoded frames from SHA-verified completed segments.',
 'This source review and the sampled-frame report do not constitute a continuous normal-speed viewing or audio listening review.',
 'Manuscript values, software AIP certificate scope and manual candidate selection were independently checked; evidence.json and script-review.json contain source locators and hashes.'
]
(OUT/'film-source-review.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'checksPassed':sum(c['passed'] for c in checks),'checksTotal':len(checks),'durationSeconds':story['duration']/story['fps'],'visualAccepted':False}))
