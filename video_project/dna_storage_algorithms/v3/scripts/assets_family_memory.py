"""One Qwen illustrative family-memory image, no specified real people."""
import os,json,hashlib
from datetime import datetime,timezone
from pathlib import Path
import requests
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];STATE=ROOT/'research/tool-family-memory.json';OUTPUT=ROOT/'public/bridges/family-memory.png'
if STATE.exists():raise SystemExit('Generation record exists; do not duplicate this one-image request.')
MODEL='qwen-image-2.0-pro-2026-06-22';ENDPOINT='https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
PROMPT='''A beautiful intimate candid family photograph, horizontal 16:9. Three fictional ordinary people viewed from behind: an adult woman on the left, their small child in the middle, an adult man on the right, naturally holding hands and walking away from the camera along a quiet sandy beach at sunset. The figures occupy about 35 percent of the image height, centered in the lower middle, full bodies and feet visible. Natural anatomically believable limbs, relaxed walking posture, simple comfortable ivory and muted blue-grey summer clothes, absolutely no front-facing faces. Their footprints and soft reflections trail across damp sand. Gentle ocean waves on the right, a long hazy shoreline receding to the left, the low sun near the upper-left horizon filtered through soft clouds. Film-like 35mm documentary photography with subtle fine grain, muted champagne sunlight, pearl gold highlights, pale sage blue-grey sea, delicate atmospheric depth and a quiet nostalgic feeling. Realistic textures of linen clothes, sand and small wave foam. Soft cinematic natural backlight, coherent horizon and perspective. Keep the central family sharply readable, subtle depth of field in distant dunes, not excessive blur, no high-contrast silhouette, no dramatic fantasy. The frame is the actual scene only, not a photograph lying on a table and not inside a device. No text, no letters, no numbers, no captions, no logos, no watermark, no screen, no phone, no border, no UI, no split frame. This is an invented illustrative memory, not a photograph of any particular real family.'''
params={'size':'1536*864','n':1,'watermark':False,'prompt_extend':False,'seed':26101105}
now=lambda:datetime.now(timezone.utc).isoformat()
record={'provider':'Alibaba Cloud DashScope Qwen','model':MODEL,'endpoint':ENDPOINT,'credentialAlias':'QWEN_API_KEY_BACKUP','createdAt':now(),'status':'submission_started','prompt':PROMPT,'parameters':params,'referenceDocumentation':'https://help.aliyun.com/zh/model-studio/qwen-image-api','sourceAI':True,'intendedUse':'Illustrative fictional family memory inside a programmatic phone screen. No claim to depict the user, a real family, a real experiment, or a historically stored video.','scientificEvidence':False,'visualReview':'pending'}
def save():STATE.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
save()
payload={'model':MODEL,'input':{'messages':[{'role':'user','content':[{'text':PROMPT}]}]},'parameters':params}
try:
 r=requests.post(ENDPOINT,headers={'Authorization':'Bearer '+os.environ['QWEN_API_KEY_BACKUP'],'Content-Type':'application/json'},json=payload,timeout=240)
except requests.RequestException as e:
 record.update(status='submission_unknown',errorType=type(e).__name__);save();raise SystemExit('Uncertain image submission; no retry.')
data=r.json();record.update(httpStatus=r.status_code,requestId=data.get('request_id'),usage=data.get('usage'))
if not r.ok:
 record.update(status='rejected',errorCode=data.get('code'),errorMessage=data.get('message'));save();raise SystemExit('Image request rejected: '+str(data.get('code')))
url=next(c['image'] for c in data['output']['choices'][0]['message']['content'] if 'image' in c)
try:
 r=requests.get(url,timeout=120);r.raise_for_status();OUTPUT.write_bytes(r.content)
except requests.RequestException as e:
 record.update(status='generated_download_failed',errorType=type(e).__name__);save();raise SystemExit('Generated image download failed; preserve original request ID, no paid resubmission.')
with Image.open(OUTPUT) as im:dimensions=list(im.size);fmt=im.format
record.update(status='succeeded',completedAt=now(),output={'path':str(OUTPUT.relative_to(ROOT)).replace('\\','/'),'bytes':OUTPUT.stat().st_size,'sha256':hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),'dimensions':dimensions,'format':fmt});save()
print(json.dumps({'status':record['status'],'requestId':record['requestId'],'output':record['output']},ensure_ascii=False))
