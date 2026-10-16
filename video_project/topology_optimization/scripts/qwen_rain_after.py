from pathlib import Path
import os,time,requests,json
root=Path(__file__).resolve().parents[1]
out=root/'public/episode2/rain_after.png'; log=root/'research/episode2/qwen-rain-after.json'
prompt='cinematic documentary still, after summer rain in a quiet city park, a person seen from behind facing a faint natural rainbow through fine mist, wet pavement reflections, pale overcast sky with warm sun breaking from behind the observer, elegant ivory and cool gray palette, realistic photography, subtle film grain, no text, no logo, no watermark, no diagram, not fantasy, wide 16:9 composition with clean space on left'
key=os.getenv('DASHSCOPE_API_KEY')
if not key: raise SystemExit('DASHSCOPE_API_KEY missing')
r=requests.post('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',headers={'Authorization':f'Bearer {key}','X-DashScope-Async':'enable','Content-Type':'application/json'},json={'model':'qwen-image','input':{'prompt':prompt},'parameters':{'size':'1280*720','n':1}},timeout=60);r.raise_for_status(); data=r.json(); task=data['output']['task_id']
for _ in range(45):
 time.sleep(4); q=requests.get(f'https://dashscope.aliyuncs.com/api/v1/tasks/{task}',headers={'Authorization':f'Bearer {key}'},timeout=30);q.raise_for_status(); d=q.json(); st=d.get('output',{}).get('task_status'); print(st,flush=True)
 if st=='SUCCEEDED':
  u=d['output']['results'][0]['url'];out.write_bytes(requests.get(u,timeout=60).content); log.write_text(json.dumps({'model':'qwen-image','task_id':task,'prompt':prompt,'purpose':'生活情境开场，不能作为物理证据'},ensure_ascii=False,indent=2),encoding='utf8'); print(out);break
 if st in {'FAILED','CANCELED'}: raise SystemExit(str(d))
else: raise SystemExit('timeout')
