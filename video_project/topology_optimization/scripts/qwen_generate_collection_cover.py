from pathlib import Path
import os,time,requests
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery'/'daily-life-knowledge'
OUT.mkdir(parents=True,exist_ok=True)
PROMPT='''A clean square 1:1 photorealistic studio still life for a premium everyday science collection. Warm ivory background, one pale cyan circular backdrop, soft paper texture. Arrange a steaming ceramic coffee cup, a transparent zipper showing its interlocking teeth, a small honeycomb cross-section inside the zipper opening, a machined bicycle gear, one soap bubble, one water droplet, and one dry leaf on a glass surface. Connect the objects with one subtle thin cyan light path. Calm, intelligent, tactile, museum-grade engineering photography, refined blue-gray and amber accents, realistic materials, balanced composition with the object group in the lower center and quiet blank space above. ABSOLUTELY NO WRITING OF ANY KIND: no Chinese characters, no Latin letters, no numbers, no symbols, no labels, no title, no logo, no watermark, no UI, no poster design, no magazine typography, no signage, no random marks.'''
key=os.getenv('DASHSCOPE_API_KEY')
if not key: raise SystemExit('DASHSCOPE_API_KEY is not set')
r=requests.post('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',headers={'Authorization':f'Bearer {key}','X-DashScope-Async':'enable','Content-Type':'application/json'},json={'model':'qwen-image','input':{'prompt':PROMPT},'parameters':{'size':'1024*1024','n':1}},timeout=60)
print('submit',r.status_code,flush=True);r.raise_for_status();task=r.json()['output']['task_id']
for _ in range(45):
 time.sleep(4); q=requests.get(f'https://dashscope.aliyuncs.com/api/v1/tasks/{task}',headers={'Authorization':f'Bearer {key}'},timeout=30);q.raise_for_status();d=q.json();s=d.get('output',{}).get('task_status');print(s,flush=True)
 if s=='SUCCEEDED':
  u=d['output']['results'][0]['url']; b=requests.get(u,timeout=60).content;(OUT/'generated_collection_hero_v2.png').write_bytes(b);print(OUT/'generated_collection_hero_v2.png');(OUT/'generation-record-v2.txt').write_text(PROMPT,encoding='utf-8');break
 if s in {'FAILED','CANCELED'}: raise SystemExit(str(d))
else: raise SystemExit('generation timeout')
