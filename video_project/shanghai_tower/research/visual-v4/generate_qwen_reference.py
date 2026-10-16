"""Qwen architectural reference edit. Credentials and signed URLs are never logged."""
from pathlib import Path
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent
REFERENCE = ROOT / 'source-previews/Shanghai_Shanghai_Tower_5166304_jpg.jpg'
OUTPUT = ROOT / 'assets/qwen-shanghai-tower-opening.png'
MANIFEST = ROOT / 'qwen-generation.json'
MODEL = 'qwen-image-2.0-pro-2026-06-22'
PROMPT = '''Create a premium architectural documentary opening photograph, using the supplied real Shanghai Tower photograph as the structural reference. Preserve the recognizable actual Shanghai Tower: its taper, continuous twisting curved glass facade, dense real horizontal window bands, curved seam and asymmetrically sloped crown. Keep the complete crown visibly inside the frame with generous sky above it. Keep the same dramatic ground-level low-angle upward camera direction and a convincing long-lens architectural perspective; do not invent another tower or change its roof shape. Expand the composition to a horizontal 16:9 image. The tower rises from the lower-right edge toward the upper-right third, with its crown around x=66 percent and y=22 percent, taking roughly 45 percent of image width near the lower edge. The left third is calm open sky for an editorial title that will be added separately. Refine the surroundings with beautiful pale powder-blue morning sky, delicate soft cumulus clouds with visible texture and gentle atmospheric depth, natural warm-white daylight touching the silver-blue facade, restrained greenery only along the bottom-right edge, tasteful contemporary architectural photography. Retain detailed realistic facade reflections and crisp tiny window rhythm, no smooth toy cylinder, no painted surface. Visually rich but quiet, realistic exposure, soft highlights, tangible materials, high-end architectural photography, clean composition. Do not add writing, labels, logos, watermarks, duplicate towers, fictional steel beams, flying objects, futuristic building parts, captions, diagrams, people or render UI. This is an illustrative edited setting, not an engineering drawing.'''

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

record = {
    'created_utc': datetime.now(timezone.utc).isoformat(),
    'provider': 'Alibaba Cloud DashScope',
    'model': MODEL,
    'endpoint': 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    'status': 'submitted',
    'credential_selection': 'backup; primary previously returned 401 InvalidApiKey',
    'reference': {
        'path': str(REFERENCE.relative_to(ROOT)),
        'page': 'https://commons.wikimedia.org/wiki/File:Shanghai_Shanghai_Tower_5166304.jpg',
        'creator': 'Ermell', 'license': 'CC0',
        'sha256': digest(REFERENCE),
    },
    'prompt': PROMPT,
    'parameters': {'size': '2048*1152', 'n': 1, 'watermark': False, 'prompt_extend': False, 'seed': 241009},
    'intended_use': 'Reference-preserving illustrative architectural opening; not structural evidence.',
    'visual_review': 'pending',
}
MANIFEST.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
key = os.environ.get('QWEN_API_KEY_BACKUP')
if not key:
    raise SystemExit('Backup API credential unavailable in process environment')
payload = {
    'model': MODEL,
    'input': {'messages': [{'role': 'user', 'content': [
        {'image': 'data:image/jpeg;base64,' + base64.b64encode(REFERENCE.read_bytes()).decode('ascii')},
        {'text': PROMPT},
    ]}]},
    'parameters': record['parameters'],
}
try:
    response = requests.post(record['endpoint'], json=payload, headers={
        'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
    }, timeout=240)
    if not response.ok:
        try:
            err = response.json()
        except ValueError:
            err = {}
        record.update(status='failed', http_status=response.status_code,
                      error_code=err.get('code'), request_id=err.get('request_id'))
        MANIFEST.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
        raise SystemExit(f"Qwen request failed: HTTP {response.status_code}, code={err.get('code')}")
    result = response.json()
    record['request_id'] = result.get('request_id')
    items = result['output']['choices'][0]['message']['content']
    image_url = next(item['image'] for item in items if 'image' in item)
    download = requests.get(image_url, timeout=120)
    download.raise_for_status()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(download.content)
    with Image.open(OUTPUT) as img:
        dimensions = list(img.size)
        fmt = img.format
    record.update(status='succeeded', output={
        'path': str(OUTPUT.relative_to(ROOT)), 'sha256': digest(OUTPUT),
        'bytes': OUTPUT.stat().st_size, 'dimensions': dimensions, 'format': fmt,
    }, completed_utc=datetime.now(timezone.utc).isoformat())
    MANIFEST.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'status':record['status'], 'request_id':record['request_id'], 'output':record['output']}, ensure_ascii=False))
except requests.RequestException as exc:
    record.update(status='failed', error_type=type(exc).__name__)
    MANIFEST.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
    raise SystemExit('Network request failed: '+type(exc).__name__)
