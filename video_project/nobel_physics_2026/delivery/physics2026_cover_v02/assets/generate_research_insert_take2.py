from pathlib import Path
import os,time,json,hashlib,requests,datetime
OUT=Path(__file__).resolve().parent
key=os.environ.get('DASHSCOPE_API_KEY')
if not key: raise SystemExit('DASHSCOPE_API_KEY not configured')
prompt='''Use case: scientific-educational illustration. Asset type: airy hand-drawn background insert for a premium Nobel physics cover. Scene/backdrop: warm ivory rice paper, very subtle blue-grey wash, no frame, no rectangular panel. Subject: three connected scientific motifs only, arranged left to right with generous space: a translucent blue Earth with a single fine cyan neutrino track passing through it; a vertical string of small glowing optical modules embedded in deep blue ice; a clean luminous Cherenkov cone expanding from a particle track. Style/medium: refined Nobel-Prize editorial ink-and-watercolor line art, thin charcoal strokes, restrained cyan and muted ochre, soft paper grain, elegant museum illustration. Composition: horizontal 16:9, motifs small and airy so this image can sit behind later typography; leave the left third quieter. Lighting/mood: calm, precise, curious, premium science documentary. Text: none. Constraints: ABSOLUTELY NO PEOPLE, NO HANDS, NO FINGERS, NO FACES, NO HUMAN FIGURES, NO BODY PARTS. No text, no letters, no numbers, no labels, no logo, no watermark, no UI, no border, no black strips, no collage, no hard rectangle, no dark background. Motifs fade softly into the paper and share one visual language.'''
params={'size':'1280*720','n':1,'prompt_extend':False,'watermark':False,'seed':20261008,'negative_prompt':'人物，手，手指，脸，身体，人体，文字，英文字母，数字，标签，水印，logo，界面，边框，拼贴，黑色块，硬矩形，霓虹，塑料感，低质量，模糊'}
payload={'model':'qwen-image','input':{'prompt':prompt},'parameters':params}
(OUT/'qwen-request-take2.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
r=requests.post('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',headers={'Authorization':'Bearer '+key,'X-DashScope-Async':'enable','Content-Type':'application/json'},json=payload,timeout=120); r.raise_for_status(); task=r.json()['output']['task_id']; print('task',task,flush=True)
record={'model':'qwen-image','task_id':task,'prompt':prompt,'parameters':params,'submitted_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'RUNNING'}
(OUT/'qwen-status-take2.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
for _ in range(60):
 time.sleep(4); q=requests.get(f'https://dashscope.aliyuncs.com/api/v1/tasks/{task}',headers={'Authorization':'Bearer '+key},timeout=60); q.raise_for_status(); data=q.json(); st=data.get('output',{}).get('task_status'); print(st,flush=True); record['status']=st; (OUT/'qwen-status-take2.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
 if st=='SUCCEEDED':
  b=requests.get(data['output']['results'][0]['url'],timeout=120); b.raise_for_status(); fp=OUT/'research-insert-qwen-take2.png'; fp.write_bytes(b.content); record['file']=str(fp); record['sha256']=hashlib.sha256(b.content).hexdigest(); (OUT/'qwen-status-take2.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8'); break
 if st in ('FAILED','CANCELED'): raise RuntimeError(data)
else: raise TimeoutError('Qwen generation timed out')
