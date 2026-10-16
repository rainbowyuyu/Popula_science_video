from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = Path('D:/python_project/beso_ai')


def source(path: Path, role: str) -> dict:
    data = path.read_bytes()
    return {'path': path.as_posix(), 'role': role, 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}


def metric(name: str, baseline: float, candidate: float, unit: str, scope: str,
           use: str) -> dict:
    return {'name': name, 'baseline': baseline, 'candidate': candidate,
            'unit': unit, 'scope': scope,
            'change': candidate - baseline,
            'changePercent': (candidate / baseline - 1) * 100,
            'recommendedUse': use}


document = {
    'schema': 'v19-comparison-evidence-v1',
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'purpose': 'Restore substantiated TuQiang comparison and investor-relevant AI Engineer contributions.',
    'newSolverRun': False,
    'publishedPaperIndependentlyVerified': False,
    'sources': [
        source(PRODUCT / 'rules/ai_vs_tuqiang_comparison.yaml', 'canonical comparison configuration'),
        source(PRODUCT / 'rules/fleet_ai_review_reference.yaml', 'reference confidence: TuQiang target / planned'),
        source(PRODUCT / 'rules/validation_rules.yaml', 'review reference targets; cost proxy limitation'),
        source(PRODUCT / 'submission/manuscript/nature_article_draft_v1.md', 'current draft manuscript'),
        source(PRODUCT / 'third_party/zwind_newmodel/paper_fig2_metrics.json', 'saved paper response metrics'),
        source(PRODUCT / 'third_party/zwind_newmodel/draw.py', 'plot values independently agree with metrics JSON'),
        source(PRODUCT / 'third_party/zwind_newmodel/README.md', 'original optimized_geometry30.json has 30-degree columns'),
        source(PRODUCT / 'docs/assets/浙江大学AIP证书-1.png', 'visually inspected original certificate image'),
        source(PRODUCT / 'docs/assets/浙江大学AIP证书-2.png', 'visually inspected certificate attachment'),
        source(PRODUCT / 'backend/orchestrator/closed_loop.py', 'bounded replan and tool results implementation'),
        source(PRODUCT / 'backend/orchestrator/registry.py', 'engineering tool adapter registry'),
        source(PRODUCT / 'backend/pipeline/steps.py', 'geometry edits and downstream artifact invalidation'),
        source(ROOT / 'public/beso-research/web-live/v7/replan-visual.json', 'saved replan remains awaiting_post_check'),
        source(ROOT / 'public/beso-research/web-live/v7/visual-data.json', 'saved parameter demo uses rules parser')
    ],
    'comparison': {
        'capacityMW': 20,
        'baselineLabel': '图强号参考基线',
        'candidateLabel': '本研究案例',
        'visibleAttribution': '研究案例 · 同为20 MW',
        'primary': metric('foundation_steel_intensity', 278, 255.5, 't/MW',
                          'current manuscript comparison; not weighing of an installed asset', 'hero evidence'),
        'mass': metric('foundation_steel_mass', 5560, 5110, 't',
                       'same 20 MW reference capacity; intensity multiplied by 20', '450 t explanatory figure'),
        'secondary': metric('maximum_mooring_tension', 14185, 13037, 'kN',
                            'saved paper extreme DLC 6.1', 'secondary evidence if scope remains visible'),
        'tradeoffs': [
            {**metric('pitch', 8.02, 9.56, 'deg', 'extreme DLC 6.1', 'prevent all-metrics-better claim'), 'recordedLimit': 10},
            metric('surge', 8.53, 12.38, 'm', 'extreme DLC 6.1', 'not every motion is reduced'),
            metric('tower_base_my', 1139.26, 1372, 'MN.m', 'extreme DLC 6.1', 'not every load is reduced')
        ],
        'excluded': [
            {'claim': 'capital cost reduction', 'reason': 'configuration labels scaled EPC proxy; manuscript and rules use differing absolute cost series'},
            {'claim': 'all motions lower', 'reason': 'contradicted by stored DLC metrics'},
            {'claim': 'new three-column visualization solved to these results', 'reason': 'saved comparison references original optimized_geometry30; cinematic hull differs'},
            {'claim': 'actual purchase savings / ROI', 'reason': 'no audited procurement or economic realization evidence'},
            {'claim': 'operating TuQiang measured 278 t/MW', 'reason': 'reference YAML tags target/planned and old prose conflicts'}
        ]
    },
    'aip': {
        'issuer': '中国船级社', 'certificateId': 'OT25QTS60026', 'date': '2026-02-05',
        'applicant': '浙江大学',
        'subject': 'AI Engineer端对端浮式基础智能设计软件认证项目',
        'scope': '软件的功能、算法及参数等方面的原则性审查',
        'visualSourceInspected': True, 'issuerOnlineAuthenticityVerified': False,
        'safeNarration': 'AI Engineer 智能设计软件，已获中国船级社原则性批准。',
        'notCovered': ['本次视觉模型的认证', '任意自动生成候选均获证', '型式认可', '最终入级', '制造安装批准'],
        'attachment': ['软件需求规格书 v2', '软件设计说明书 v1', '软件测试大纲 v1',
                       '测试报告 v2', '软件使用说明书 v1', '软件运维手册 v1']
    },
    'web': [
        {
            'url': 'https://news.qq.com/rain/a/20260521A099ZE00',
            'status': 200, 'readDate': '2026-10-14',
            'title': '全球首台！20兆瓦“图强号”开建，阳江深远海风电再添“国之重器”',
            'readScope': 'page title and meta description only; not script-rendered full article',
            'descriptionExcerpt': '5月20日，国家电投“图强号”20兆瓦漂浮式风电示范机组建造启动仪式在珠海举行。这是全球首台适配钢混结构的20兆瓦漂浮式风机。',
            'supports': ['20 MW capacity', 'construction-start background', 'steel-concrete design background'],
            'doesNotSupport': ['278 t/MW', '5560 t', 'candidate advantages']
        },
        {'url': 'https://finance.people.com.cn/n1/2026/0522/c1004-40725195.html', 'status': 'TLS certificate validation error; not used'},
        {'url': 'https://finance.people.com.cn/n1/2026/0521/c1004-40724826.html', 'status': 'TLS certificate validation error; not used'}
    ],
    'comparisonNarration': {
        'durationEstimateOnly': True,
        'long20to25s': '研究案例中，同为二十兆瓦，相对图强号参考基线，基础少用约四百五十吨钢，单位功率用钢量降低百分之八点一。极端工况的系泊峰值张力也更低。纵摇会增加，约束仍要逐项核查。',
        'short15to20s': '看二十兆瓦研究案例：相对图强号参考基线，单位功率用钢量降低百分之八点一，相当于基础少用四百五十吨钢。系泊峰值张力也更低，运动约束继续核查。',
        'pronunciation': {'Zwind': 'Zee wind', 'AI Engineer': 'English', 'BESO': '贝索', '系泊': 'xì bó per user request', '图强号': '图强号'}
    },
    'investorRelevantContributions': [
        'requirements and constraints become structured engineering work',
        'heterogeneous deterministic engineering tools share inputs and artifacts',
        'failure logs feed bounded next-step planning',
        'engineer edits invalidate dependent inputs and preserve version consistency',
        'replayable models, inputs and logs retain evidence',
        'saved manuscript steel-intensity improvement with explicit comparison scope',
        'software Approval in Principle documented in original certificate images'
    ],
    'limits': ['No new coupled simulation performed', 'No elapsed-time or investor-return guarantees',
               'Do not turn saved pending replan into successful rerun',
               'Cinematic three-column model is explanatory visualization, not the original solved hull']
}
out = ROOT / 'research/v19-comparison-evidence.json'
out.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'output': out.as_posix(), 'metrics': document['comparison'], 'sourceCount': len(document['sources'])}, ensure_ascii=False))
