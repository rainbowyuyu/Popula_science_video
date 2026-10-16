"""Read-only take/ASR audit; never writes timeline, audio, or captions."""
import argparse, datetime, hashlib, json, pathlib

P=pathlib.Path(__file__).resolve().parents[2]
ap=argparse.ArgumentParser(); ap.add_argument('--reviewed-through',default='g060'); args=ap.parse_args()
story=json.loads((P/'docs/story.json').read_text(encoding='utf-8'))
rows=[]
for shot in story['shots']:
    key=shot['id']; take_path=P/'audio/takes'/f'{key}.json'; asr_path=P/'audio/asr'/f'{key}.json'
    if not take_path.exists() or not asr_path.exists(): continue
    take=json.loads(take_path.read_text(encoding='utf-8')); asr=json.loads(asr_path.read_text(encoding='utf-8'))
    if take.get('text')!=shot['text'] or asr.get('sourceSHA256')!=take.get('sha256'): continue
    if key>args.reviewed_through: continue
    words=asr.get('words',[])
    rows.append({'id':key,'takeSHA256':take['sha256'],'expected':asr['expected'],'heard':asr['heard'],'ratio':asr.get('ratio'),'flags':asr.get('flags',[]),'duration':take['duration'],'rawEndpointDB':take.get('rawEndpointDB'),'lastRecognizedWordEnd':words[-1]['end'] if words else None,'asrTextReviewed':True,'subjectiveListeningChecked':False})

by_id={r['id']:r for r in rows}
required=[]
if 'g027' in by_id and '简称低密度脂蛋白' in by_id['g027']['expected']:
    required.append({'id':'g027','takeSHA256':by_id['g027']['takeSHA256'],'priority':1,'reason':'确定的spoken展开重复：形成低密度脂蛋白，简称低密度脂蛋白。expected/实际ASR一致，需修改ttsText后重生。','basis':'Text+ASR, not subjective listening.'})
if 'g024' in by_id and 'raw_endpoint' in by_id['g024']['flags']:
    required.append({'id':'g024','takeSHA256':by_id['g024']['takeSHA256'],'priority':1,'reason':'尾音风险：最后的“身”识别到9.50s，原片9.52s，仅20ms余量；rawEndpointDB约-35dB且raw_endpoint=True。重新生成自然收尾候选，不能靠压低音尾掩盖截断。','basis':'Endpoint metric+ASR word alignment; no definite omitted word.'})

candidate_specs=[
 ('g019','贝塔细胞被识别为胚胎细胞，医学概念误听风险高，应生成候选比较。ASR本身不能证明原音必定念错。'),
 ('g013','两次胰腺均识别为一线；ratio.794主要由胃/位、胰腺/一线造成，没有整句缺失证据。需要确保yi2xian4清晰，候选比较而非仅按分数判失败。'),
 ('g005','小肠被识别为小城，肠壁为长臂；医学定位关键词有近音歧义，建议候选比较。'),
 ('g068','已有疾病被识别为医药级别，末尾医学适用条件出现较明显近音歧义。建议候选改读“以及已经患有的疾病”，但ASR不能替代听辨。'),
]
candidates=[{'id':key,'takeSHA256':by_id[key]['takeSHA256'],'reason':reason,'required':False,'subjectiveListeningChecked':False} for key,reason in candidate_specs if key in by_id]
report={'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'revision':'V4-incremental','storySHA256':hashlib.sha256((P/'docs/story.json').read_bytes()).hexdigest(),'method':'Read matching audio/asr JSON and audio/takes metadata only. Compared recognized wording to actual ttsText. No audio regenerated, no timeline touched, no subjective listening claimed.','reviewedThrough':args.reviewed_through,'reviewedCount':len(rows),'totalStoryClips':len(story['shots']),'requiredRegeneration':required,'priorityCandidateComparisons':candidates,'notAutomaticallyRejected':['ASR胃→位、胰岛素→遗导素/移导素、血→学、脂蛋白→直蛋白等同音字并不能单独证明发音错误。','g013的低字面匹配不等于漏句；数字/简繁/β字形先区分格式差异。'],'clips':rows}
(P/'research/revision-v4/voice-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'reviewed':len(rows),'required':[x['id'] for x in required],'candidates':[x['id'] for x in candidates]},ensure_ascii=True))
