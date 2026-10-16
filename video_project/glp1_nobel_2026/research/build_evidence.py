from pathlib import Path
from datetime import datetime,timezone
import json,re
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'research';V=R/'verified_raw'
story=json.loads((ROOT/'docs/story.json').read_text(encoding='utf-8'))
logs=[]
for path in R.glob('*log.json'):
 try:logs.extend(json.loads(path.read_text(encoding='utf-8')))
 except (ValueError,TypeError):pass
lookup={x['id']:x for x in logs if isinstance(x,dict) and 'id' in x and x.get('status')==200}
select_pmids={'native_half_life':'17928588'}
pmids={
 'mojsov1987':'3543057','holst1987':'3542566','drucker1987':'3033647','semaglutide2015':'26308095','step1':'33567185','select':'37952131','withdrawal':'35441470','receptor2017':'28538729','mechanisms2018':'29617641','native_half_life':'17928588','appetite_semaglutide':'33269530','half_life_review':None,'tirzepatide2022':'35658024'}
source_quotes={
 'mojsov1987':('GLP-I(7-37) is a potent stimulator of insulin secretion','离体灌流大鼠胰腺；37位长肽与活性31位片段的功能差别。'),
 'holst1987':('Natural and synthetic proglucagon 78-107 dose dependently and potently increased insulin secretion','猪肠黏膜分离活性片段；离体灌流猪胰腺，不能表述为1987年人体减肥试验。'),
 'drucker1987':('potently increases cAMP levels, insulin mRNA transcripts, and insulin release','培养大鼠胰岛瘤细胞中的机制结果，不能把细胞水平证据直接当作人体疗效。'),
 'semaglutide2015':('two amino acid substitutions compared to human GLP-1 (Aib(8), Arg(34))','Aib8帮助抵抗DPP-4，Lys26连接脂肪二酸链增加白蛋白亲和；文中迷你猪半衰期不是人体一周半衰期的依据。'),
 'step1':('−14.9% versus −2.4% at week 68','1961名无糖尿病的成年人；BMI≥30或≥27且有至少一种体重相关合并症；2.4 mg/周皮下注射或安慰剂；两组均生活方式干预。数字来自主要治疗政策估计量，不能与停药延伸子集17.3%混用。'),
 'select':('6.5% versus 8.0%; hazard ratio, 0.80','17604人，≥45岁，有既往心血管病，BMI≥27，无糖尿病；2.4 mg/周；平均随访39.8个月；复合终点为心血管死亡、非致死心梗或非致死卒中；1.5个百分点是原始事件比例差；20%对应HR，不是所有人绝对获益20%。'),
 'withdrawal':('participants regained two-thirds of their prior weight loss','延伸分析327人；第68周停药且结束研究生活方式干预，随后随访52周；探索性延伸研究；原药物组平均回升11.6个百分点，仍比原基线低5.6%；不能说所有人必然完全反弹。'),
 'receptor2017':('Conformational changes in the transmembrane domain','2017冷冻电镜实验结构，受体与配体结合把信号耦联到Gs蛋白；5VAI的GLP-1R来自兔，GLP-1配体来自人；图像仅用作机制结构参考。'),
 'mechanisms2018':('augmentation of insulin and inhibition of glucagon secretion','综述同时讨论内源GLP-1和药理GLP-1的不同作用路径；禁止把所有外周GLP-1画成自由穿过血脑屏障的单一路径。'),
 'native_half_life':('released in response to meal intake','选择Holst 2007 Physiological Reviews，而非检索结果中标题相似的预印本；支持肠道L细胞、DPP-4代谢、胰岛和食欲效应。'),
 'appetite_semaglutide':('suppressed appetite, improved control of eating, and reduced food cravings','72人、20周的随机试验；自由进食能量摄入降低；该研究在20周用间接方法未发现胃排空延迟证据，故不把长期减重归结为持续胃潴留。'),
 'half_life_review':('short half-life (1.5 min following intravenous dosing','全文The Discovery of Liraglutide段明确1.5分钟静脉给药、1.5小时皮下给药；口播限定进入循环后的活性肽，避免与司美格鲁肽约一周半衰期混淆。'),
 'tirzepatide2022':('glucose-dependent insulinotropic polypeptide and glucagon-like peptide-1 receptor agonist','精确取Jastreboff等原始NEJM试验PMID35658024，排除同名读者来信；只用于双受体分类，不把它的体重结果归给司美格鲁肽。'),
}
sources=[]
for sid,pmid in pmids.items():
 data=json.loads((V/(sid+'.json')).read_text(encoding='utf-8'))
 rows=data['resultList']['result'];rec=next((x for x in rows if x.get('pmid')==pmid),rows[0])
 log=lookup.get(sid,{})
 q,n=source_quotes[sid]
 sources.append({'id':sid,'status':'verified','title':rec['title'],'authors':rec.get('authorString'),'year':rec.get('pubYear'),'journal':rec.get('journalInfo',{}).get('journal',{}).get('title'),'doi':rec.get('doi'),'pmid':rec.get('pmid'),'pmcid':rec.get('pmcid'),'url':'https://doi.org/'+rec['doi'],'metadataUrl':log.get('url'),'retrievedAtUTC':log.get('retrievedAtUTC'),'savedMetadata':str((V/(sid+'.json')).relative_to(ROOT)),'evidenceExcerpt':q,'excerptType':'numeric digest' if sid in ['step1','select'] else 'short original excerpt','scopeAndLimit':n})
official={
 'nobel2026':('Press release: Nobel Prize in Physiology or Medicine 2026','Nobel Assembly / NobelPrize.org','2026','for their discoveries concerning light-gated ion channels and optogenetics','2026-10-05公布，Karl Deisseroth、Peter Hegemann、Georg Nagel；只可证明本届医学奖结果，不能证明GLP-1已被提名或进入决选。'),
 'nobel_nomination':('Nomination and selection of Nobel Prize laureates in physiology or medicine','NobelPrize.org',None,'cannot be revealed until 50 years later','提名及评审信息保密50年；不可捏造候选名单、评委分歧或落选原因。'),
 'lasker2024':('GLP-1-based therapy for obesity — 2024 Lasker~DeBakey Clinical Medical Research Award','Lasker Foundation','2024','For the discovery and development of GLP-1-based drugs','2024临床医学奖三人：Joel Habener、Svetlana Mojsov、Lotte Bjerre Knudsen；不得把其他贡献者说成当年该奖得主。'),
 'pdb5vai':('5VAI: Cryo-EM structure of the activated GLP-1 receptor in complex with G protein','RCSB PDB','2017','Resolution: 4.10 Å','实验结构；GLP-1R兔源、GLP-1人源；真实坐标可用于结构重绘，但后续运动为教学动画。'),
 'wegovy_pi':('WEGOVY (semaglutide) US Prescribing Information','Novo Nordisk official prescribing information',None,'Semaglutide decreases calorie intake. The effects are likely mediated by affecting appetite.','第11节分子结构与白蛋白结合；12.2节葡萄糖依赖性胰岛素/胰高血糖素和胃排空；12.3节约一周消除半衰期；胃肠道反应/禁忌等遵循完整说明书，不提供用药方案。')}
for sid,(title,author,year,quote,note) in official.items():
 log=lookup[sid];sources.append({'id':sid,'status':'verified','title':title,'authors':author,'year':year,'url':log['url'],'retrievedAtUTC':log['retrievedAtUTC'],'savedMetadata':log['savedPath'],'evidenceExcerpt':quote,'excerptType':'short original excerpt','scopeAndLimit':note})
source_map={x['id']:x for x in sources}
claim_notes={
 'g001':'虚构的普遍生活情境，不声称来自某位患者或真实试验。',
 'g002':'虚构的普遍生活情境；个体饱腹与食欲受多因素影响。',
 'g003':'用于提问和过渡；GLP-1是食欲调节的一部分，不能解释一切。',
 'g009':'化学信号的通俗比喻，实际由分泌细胞、受体和神经/体液通路完成。',
 'g010':'经典肠促胰素效应应在两种途径产生相近血糖曲线的条件下比较胰岛素。',
 'g011':'打招呼为比喻；不是独立意识或有意预判，且GIP也参与肠促胰素效应。',
 'g013':'教学动画应标注据实验结构；不能把形变示意称为实时分子录像。',
 'g016':'葡萄糖依赖不等于绝对不会低血糖，与胰岛素或促泌剂合用的风险不同。',
 'g020':'肠脑轴是多通路；大脑也有内源GLP-1神经元，外周激素与长效药不可画成完全相同的分布。',
 'g022':'并非持续胃潴留的单一减重解释；支持慢性食欲调节，视觉应避免把胃完全阻断。',
 'g023':'体重随能量平衡改变发生；分子不可直接击碎、燃烧或溶解脂肪。',
 'g025':'天然活性GLP-1的循环半衰期，与给药途径和长效类似物区分。',
 'g030':'约一周是司美格鲁肽人体消除半衰期；每周一次明确是这里讨论的皮下注射制剂。',
 'g033':'画面写全入组条件，不把超重体重正常人等同。',
 'g034':'画面应出现目标剂量2.4 mg/周、两组均生活方式干预，不是操作性注射指导。',
 'g038':'必须在画面注明复合终点三项、SELECT入组人群与平均随访39.8个月。',
 'g039':'HR是时间到事件分析的危险率比；8.0%-6.5%=1.5个百分点是粗事件比例差。',
 'g041':'务必保留停药与研究生活方式干预一同结束的条件。',
 'g042':'结果是子集均值，不能做个体必然性预测。',
 'g043':'科学史逻辑可以先受体再药物，但时间轴必须按1987→2015→2017等真实年代排序。',
 'g045':'不推断特定提名、评委偏好或诺奖所谓漏评原因。',
 'g046':'编辑性结论；奖项选择不会使既有数据消失，也不把获奖等同安全有效。',
 'g047':'饮食行为是多因素调节，列举三器官非穷尽。',
 'g048':'叙事回扣，不构成具体疗效承诺。'
}
claims=[]
for s in story['shots']:
 assert all(x in source_map for x in s['sourceIds']),s
 claims.append({'shotId':s['id'],'section':s['section'],'text':s['text'],'caption':s['caption'],'sourceIds':s['sourceIds'],'status':'illustrative scene' if not s['sourceIds'] else 'supported with scope','note':claim_notes.get(s['id'],'具体适用范围参见对应来源的scopeAndLimit。')})
evidence={'createdAtUTC':datetime.now(timezone.utc).isoformat(),'title':story['title'],'scope':'2026-10-08科学科普视频核验。不能从本届未获奖推断已知提名或评委理由。','method':'实际HTTP请求：NobelPrize.org、Lasker Foundation、RCSB PDB、Europe PMC原始论文元数据、官方药品说明书和开放全文；各请求记录URL、时间、响应和SHA-256。学术搜索MCP未挂载，使用公开HTTP端点。','sources':sources,'claims':claims,'failedAndExcluded':['FDA新闻网页返回404/abuse-detection，未作为证据。','Europe PMC PDF、Wiley/PNAS PDF部分入口403；未伪称成功下载，采用公开仓储原页。','初次tirzepatide同名检索命中读者来信，已改为原始研究PMID35658024。','native_half_life初次结果包含预印本，证据只取Holst 2007 PMID17928588。'],'sourceLogs':[str(x.relative_to(ROOT)) for x in R.glob('*log.json')]}
(R/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
md=['# GLP-1 科普视频证据核验','',f"核验日期：2026-10-08。当前口播 {len(claims)} 镜头，{sum(len(re.findall(r'[\u4e00-\u9fff]',x['text'])) for x in claims)} 汉字。",'',evidence['method'],'','## 关键边界','',
'- “诺奖落选”只表达2026年未获本届医学奖；没有公开提名或决选名单证据。',
'- GLP-1的生理信号、GLP-1受体激动剂、GIP/GLP-1双受体激动剂分开表述。',
'- 不画药物直接融脂；不把所有肠源GLP-1画成自由穿过血脑屏障。',
'- 5VAI为混合来源实验复合物，其中GLP-1R为兔源；配体为人源。',
'- STEP 1、SELECT和停药延伸研究均保留对应人群、时间、剂量和干预条件。','', '## 来源','']
for s in sources:
 md.extend([f"### {s['id']}",f"**{s['title']}**",f"{s.get('authors','')} · {s.get('year') or '当前官方资料'}",f"来源：{s['url']}",f"检索：{s.get('retrievedAtUTC')}",f"核对片段：{s['evidenceExcerpt']}",f"适用范围：{s['scopeAndLimit']}",''])
md.extend(['## 逐镜头证据','', '| 镜头 | 口播 | 来源 | 核验边界 |','|---|---|---|---|'])
for c in claims:md.append(f"| {c['shotId']} | {c['text']} | {', '.join(c['sourceIds']) or '生活情境'} | {c['note']} |")
md.extend(['','## 真实论文页','', '论文文件和首页图见 `public/papers/manifest.json`。Mojsov1987为JCI原刊PDF；Drucker1987为PMC提供的五张原版扫描页，PDF仅把这五张原页合并，不重排内容；停药研究为UCL公开仓储原刊PDF。','', '## 已记录的失败及排除','']+['- '+x for x in evidence['failedAndExcluded']])
(R/'evidence.md').write_text('\n\n'.join(md[:0]) if False else '\n'.join(md),encoding='utf-8')
print('sources',len(sources),'claims',len(claims),'all references resolved')
