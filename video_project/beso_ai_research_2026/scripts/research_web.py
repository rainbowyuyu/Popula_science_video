from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests, json, re, html, sys
sys.stdout.reconfigure(encoding='utf-8')
R=Path(__file__).resolve().parents[1]
O=R/'research/web';O.mkdir(parents=True,exist_ok=True)
sources=[
('floating-wind','https://www.energy.gov/cmei/systems/floating-offshore-wind-shot'),
('topology-explained','https://formlabs.com/blog/topology-optimization/'),
('wan-keyframes','https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference'),
('wan-video','https://help.aliyun.com/zh/model-studio/image-to-video-api-reference'),
('wan-text-video','https://help.aliyun.com/zh/model-studio/text-to-video-api-reference')]
def fetch(row):
    name,url=row
    try:
        r=requests.get(url,timeout=45,headers={'User-Agent':'Mozilla/5.0'})
        r.encoding='utf-8'
        (O/f'{name}.html').write_text(r.text,'utf8')
        body=re.sub(r'<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?</\1>', ' ', r.text, flags=re.I)
        text=html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', body))).strip()
        (O/f'{name}.txt').write_text(text,'utf8')
        return dict(id=name,url=url,http=r.status_code,chars=len(text),excerpt=text[:650])
    except Exception as e:return dict(id=name,url=url,error=type(e).__name__)
rows=list(ThreadPoolExecutor(max_workers=5).map(fetch,sources))
(O/'sources.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),'utf8')
for r in rows:print(json.dumps(r,ensure_ascii=False))
