from pathlib import Path
from hashlib import sha256
from lxml import etree
from datetime import datetime, timezone
import json, math

ROOT=Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
save=lambda p,x:p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest=read(ROOT/'manifest.json')
content=read(ROOT/'ordered-content.json')
paragraphs={x['locator']:x['text'] for x in content if x['type']=='paragraph'}
captions={cell['locator']:cell['text'] for x in content if x['type']=='table' for row in x['rows'] for cell in row['cells'] if cell['text'].startswith('Fig.')}
def quote(loc):
    return {'locator':loc,'text':paragraphs.get(loc,captions.get(loc))}
def metric(id,name,base,candidate,unit,loc,pct=None,**extra):
    calculated=(candidate/base-1)*100
    return {'id':id,'name':name,'baseline':base,'selectedAI':candidate,'unit':unit,
        'deltaPercentCalculated':calculated,'deltaPercentReported':pct,'source':loc,
        'sourceQuote':paragraphs[loc],**extra}
metrics=[
metric('steel_intensity','单位功率基础用钢量',278,247.9,'t/MW','P0021',-10.8,capacityMW=20,display='−10.8%'),
metric('dlc11_surge','运行工况纵荡最大值',6.92,5.10,'m','P0023',-26.3,condition='DLC 1.1'),
metric('dlc11_pitch','运行工况纵摇最大值',2.47,3.29,'deg','P0023',33.2,condition='DLC 1.1',plottedReference=5,meanCriterion=5,maximumCriterion=10),
metric('dlc11_acceleration','运行工况塔顶加速度最大值',.82,1.10,'m/s²','P0023',34.1,condition='DLC 1.1',limit=2.94),
metric('dlc61_surge','极端工况纵荡最大值',12.38,11.20,'m','P0024',-9.5,condition='DLC 6.1'),
metric('dlc61_pitch','极端工况纵摇最大值',8.02,9.56,'deg','P0024',19.2,condition='DLC 6.1',projectLimit=10),
metric('dlc61_acceleration','极端工况塔顶加速度最大值',3.44,3.67,'m/s²','P0024',6.7,condition='DLC 6.1',limit=5.89),
metric('dlc11_mooring','运行工况系泊张力最大值',2840,2788,'kN','P0025',-1.8,condition='DLC 1.1'),
metric('dlc11_tower_moment','运行工况塔底弯矩My最大值',565.60,570.00,'MN m','P0025',.8,condition='DLC 1.1'),
metric('dlc61_mooring','极端工况含安全系数系泊张力最大值',14185,14041,'kN','P0026',-1.0,condition='DLC 6.1',factored=True,projectLimit=20165.9),
metric('dlc61_tower_moment','极端工况塔底弯矩My最大值',1074,1117,'MN m','P0026',4.0,condition='DLC 6.1'),
metric('cost_proxy','钢量同比例估算单位投资成本',19800,17656,'CNY/kW','P0021',-10.8,excludedFromPromo=True,reason='Proportional-cost assumption; not a quotation, realized saving or independent economics model.')
]
derived={'capacityMW':20,'baselineFoundationSteelTonnes':278*20,'selectedFoundationSteelTonnes':247.9*20,'lessFoundationSteelTonnes':(278-247.9)*20,'displayLessTonnes':602,'formula':'(278 − 247.9) t/MW × 20 MW = 602 t','source':'P0021','status':'Derived arithmetic from reported rounded intensities; not a directly reported measured tonnage. Say 同为20兆瓦，按文中单位功率用钢量折算，基础约少用602吨钢。'}
loop_locs=['P0014','P0015','P0036','P0039','P0063','P0064','P0065','P0066','P0067','P0068','P0069','P0070','P0071','P0072','P0073','P0074','P0075','P0076','P0077','P0078','P0079','P0080','P0081','P0108']
human_locs=['P0051','P0058','P0059','P0060','P0070','P0080']
svg=[]
for image in manifest['images']:
    if not image['file'].endswith('.svg'):continue
    root=etree.parse(str(ROOT/image['file']))
    strings=[''.join(el.itertext()).strip() for el in root.xpath('//*[local-name()="text"]')]
    svg.append({'file':image['file'],'active':any(not r['deletedByTrackedChange'] for r in image['references']),'locators':[r['locator'] for r in image['references']],'strings':strings})
save(ROOT/'svg-labels.json',svg)
with (ROOT/'svg-labels.txt').open('w',encoding='utf-8') as f:
    for entry in svg:
        f.write(f"\n[{entry['file']}] active={entry['active']} {entry['locators']}\n"+'\n'.join(entry['strings'])+'\n')

issues=[
{'id':'tracked_media','kind':'version-control hazard','finding':'Document preserves deleted figure binaries alongside current figures; old artwork must not be reused as latest data.','resolution':'Use active=false/deleted flags in manifest; active Fig2c–f are image15/18/21/24.png and SVG16/19/22/25.'},
{'id':'aip_scope','kind':'external source conflict requiring bounded phrasing','finding':'P0010/P0017/P0033/P0129 characterize AIP as selected-design concept approval. Previously inspected certificate originals name AI Engineer端对端浮式基础智能设计软件认证项目 and scope software functions/algorithms/parameters. No new certificate is embedded in this DOCX.','resolution':'Keep video approval claim bounded to the software certificate; do not imply this depicted hull or every generated design is approved.','documentSources':['P0017','P0033','P0129'],'certificateSource':'D:/python_project/beso_ai/docs/assets/浙江大学AIP证书-1.png','secondCertificateSource':'D:/python_project/beso_ai/docs/assets/浙江大学AIP证书-2.png'},
{'id':'figure1_review_arrow','kind':'diagram simplification','finding':'Active Fig1b image2.png visibly links S≥85 toward CCS AIP, which could imply automatic certification if copied without explanation. Text P0043/P0081/P0117 says score is internal selection and physical/completion checks plus external review remain separate.','resolution':'Redesign loop with internal review and external review separate; do not present score as guarantee.'},
{'id':'figure3_score_channels','kind':'different retained score records','finding':'Active Fig3b selected-design steel AI score is visually about45, while P0121 retained candidate worksheet lists steel score92 and overall91.2. P0121 explicitly says worksheet is separate from fleet-calibration scores. These are not interchangeable score records.','resolution':'Omit composite score/radar superiority from short promo unless source channel is explained.'},
{'id':'human_version_choice','kind':'interpretation boundary','finding':'Document supports optional human inspection before meshing, changes to priorities/frozen subdomains, candidate identifiers/lineage and human final accountability. It does not explicitly document a UI operation called manual version selection.','resolution':'User-directed narrative 人来选版本/定方向 is compatible with these roles, but should be treated as product/user framing and checked against live implementation; do not describe manual review as every automatic recovery step.'},
{'id':'data_scope','kind':'evidence limit','finding':'Latest DOCX reports selected research campaign values. This review has not rerun solvers nor bound the latest selected design to current three-column cinematic geometry.','resolution':'Use 本研究案例/同为20MW and separate geometry illustration from reported results.'},
{'id':'cost_scope','kind':'assumption not measured outcome','finding':'17,656 CNY/kW is explicitly proportional to steel update, not independent cost estimation.','resolution':'Focus material efficiency; omit investment saving claims.'},
{'id':'multi_seeds','kind':'unsupported quantitative promise','finding':'The text mentions multiple random seeds but provides no seed count, task success rate, speedup factor or production ROI in this main document.','resolution':'Do not invent efficiency multipliers, success percentages or time-to-market savings.'}
]
visual_files=['image1.png','image2.png','image5.png','image8.png','image12.png','image15.png','image18.png','image21.png','image24.png','image28.png','image32.png']
visual_review={'method':'Direct visual inspection of all 11 active raster figure panels extracted from DOCX; SVG text labels also extracted. Current PNGs correlate with active SVG counterparts. No Word-page rendering or verified page numbering claimed.','filesViewed':visual_files,'findings':{'fig2c':'5.10/6.92;3.29/2.47;1.10/.82 and −26.3/+33.2/+34.1 match P0023.','fig2d':'11.20/12.38;9.56/8.02;3.67/3.44 and −9.5/+19.2/+6.7 match P0024.','fig2e':'2788/2840 and570.00/565.60 match P0025.','fig2f':'14041/14185 factored tension;1117/1074 moment match P0026.','fig1c':'Six candidates differ support counts/load placement; no same-global-load claim is warranted.'},'wordPageRender':'Not performed. Runtime dependency loader on Windows supplied no bundled LibreOffice path; no installed desktop office app was invoked. Body/table locators are structural OOXML locators, not page numbers.'}
checks=[]
for m in metrics:
    checks.append({'id':m['id']+'_percentage','passed':round(m['deltaPercentCalculated'],1)==m['deltaPercentReported'],'calculated':m['deltaPercentCalculated'],'reported':m['deltaPercentReported']})
checks += [{'id':'source_unchanged','passed':sha256(Path(manifest['source']).read_bytes()).hexdigest()==manifest['sourceSHA256']},
{'id':'derived_steel_602','passed':math.isclose(derived['lessFoundationSteelTonnes'],602)},
{'id':'old_steel_not_active_text','passed':not any(s in '\n'.join(paragraphs.values()) for s in ['255.5','13,037','13, 037','8.1%'])},
{'id':'cost_proportional_rounding','passed':round(19800*247.9/278)==17656}]
evidence={'schema':'v20-latest-document-evidence-v1','createdAt':datetime.now(timezone.utc).isoformat(),'source':{'file':manifest['source'],'sha256':manifest['sourceSHA256'],'title':paragraphs['P0001'],'documentLastWriteReported':'2026-10-09 21:04:39 Asia/Shanghai','readOnly':True},'metrics':metrics,'derivedSteel':derived,'comparisonScope':{'baseline':'TuQiang / 图强号 human-designed reference; main document treats reference fleet entry as planned','capacityMW':20,'candidate':'Selected AI-generated research candidate in manuscript','notValidated':'No claim these are freshly calculated responses of the current cinematic 3D model'},'closedLoop':{'summary':'需求→已注册工具操作→确定性计算→数值/诊断回到任务状态→有边界的修正→重执行与后验检查→内部筛选→选定方案Zwind最终验证。','recovery':'网格缺陷调整离散化；结构求解不收敛调整数值设置；记录触发诊断、修改、执行任务及post-check。只有重运行成功并复检原故障条件才记为恢复；不放松原始荷载/材料/接受限值。','guardrails':'重复规格、无效补丁、重试预算耗尽终止自动修改；未解决恢复/未完成计算/物理限值不通过禁止推进。','zwindRole':'Final coupled verification only; does not propose/rank iterative modifications.','sourceQuotes':[quote(loc) for loc in loop_locs]},'humanRole':{'supported':'可在网格前检查中间结果、调整约束优先级或冻结子域；最终工程责任由人承担。人工决定版本/取舍不应替代系统的自动诊断修正循环。','manualVersionSelection':'User-requested framing, not an exact UI workflow specified in the document. Verify product support separately.','sourceQuotes':[quote(loc) for loc in human_locs]},'figures':{'captions':[quote(loc) for loc in captions],'activeImageManifest':'manifest.json','visualReview':visual_review},'issues':issues,'checks':checks,'checksAllPassed':all(c['passed'] for c in checks),'publicationStatus':'Author-supplied manuscript; no publication DOI for this study is established. Data availability P0137 says deposit upon publication.','narrationSuggestions':['AI Engineer，连接工程工具，也接住计算的反馈。','网格出了问题、求解没有收敛，它会读回诊断，在允许的范围内调整，再调用工具重算。','每一步都要用新的计算结果复查；不满足条件，就继续修改或停止。','工程师决定目标、版本和取舍；系统承担重复的工具执行与闭环检查。','同为二十兆瓦，本研究案例的单位功率用钢量，比图强号参考基线降低百分之十点八。','按相同容量折算，基础约少用六百零二吨钢。','节省材料，也要看响应：极端工况系泊张力略低，纵摇增加，但仍在本案例十度阈值内。']}
save(ROOT/'evidence.json',evidence)
lines=['# v20 最新文档证据核验','',f"原始文件：`{manifest['source']}`",f"SHA-256：`{manifest['sourceSHA256']}`",'','只读提取。以下 P/T 定位为 OOXML 正文段落/表格单元格编号，不是页码。删除修订已排除，插入修订保留；文中批注/编辑指令仅作为内容记录。','', '## 立即替换的数值','', '|指标|图强号基线|本研究选定方案|变化|原文定位|','|---|---:|---:|---:|---|']
for m in metrics:lines.append(f"|{m['name']}|{m['baseline']} {m['unit']}|{m['selectedAI']} {m['unit']}|{m['deltaPercentReported']:+.1f}%|{m['source']}|")
lines += ['', '**同容量派生量：** 278×20=5560 t；247.9×20=4958 t；约少用602 t。602是按文中已四舍五入的单位功率钢量折算，不是文中直接报告的过磅结果。','', '## 闭环及人工角色','',evidence['closedLoop']['summary'],'',evidence['closedLoop']['recovery'],'',evidence['closedLoop']['guardrails'],'','Zwind只做选定候选的最终耦合验证，不参与本轮优化修改/排序。','',evidence['humanRole']['supported'],'',evidence['humanRole']['manualVersionSelection'],'', '## 原句及定位','']
for loc in ['P0010','P0015','P0021','P0023','P0024','P0025','P0026','P0059','P0063','P0070','P0071','P0073','P0074','P0077','P0079','P0080','P0081','P0108','P0121']:
    lines += [f'### {loc}','',paragraphs[loc],'']
lines += ['## 交叉核验及不可混用的内容','']
for issue in issues:lines += [f"- **{issue['id']}**：{issue['finding']} 处理：{issue['resolution']}"]
lines += ['', '## 图表核验','',visual_review['method'],'',*['- '+k+'：'+v for k,v in visual_review['findings'].items()],'',visual_review['wordPageRender'],'',f"算术/来源检查：{sum(c['passed'] for c in checks)}/{len(checks)}通过。未重新运行工程求解，也未获得这篇稿件独立发表DOI。",'']
(ROOT/'evidence.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'checksPassed':sum(c['passed'] for c in checks),'checksTotal':len(checks),'metrics':len(metrics),'lessSteelTonnes':derived['displayLessTonnes'],'issues':len(issues),'sourceSHA256':manifest['sourceSHA256']},ensure_ascii=False))
