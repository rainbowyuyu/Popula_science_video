"""Read only public pages/search results; no authentication or blocked detail APIs."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime,hashlib,html,json,re,urllib.parse
import requests
OUT=Path(__file__).resolve().parent/'recheck-v7';OUT.mkdir(exist_ok=True)
items=[
 ('original-share','https://v.douyin.com/hUudVGBOFKE/'),
 ('google-video-id','https://www.google.com/search?'+urllib.parse.urlencode({'q':'"7693053715154013455"'})),
 ('bing-video-id','https://www.bing.com/search?'+urllib.parse.urlencode({'q':'"7693053715154013455"'})),
 ('duckduckgo-share-id','https://html.duckduckgo.com/html/?'+urllib.parse.urlencode({'q':'"hUudVGBOFKE"'})),
 ('bing-caption-music','https://www.bing.com/search?'+urllib.parse.urlencode({'q':'"人的眼淚總是向下墜落" "默" 音乐'})),
]
def fetch(item):
 name,url=item
 try:
  response=requests.get(url,timeout=30)
  raw=response.content;(OUT/f'{name}.html').write_bytes(raw)
  content=raw.decode(response.encoding if response.encoding and response.encoding.lower()!='iso-8859-1' else 'utf8',errors='replace')
  cleaned=re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1>',' ',content,flags=re.I)
  title=re.search(r'<title\b[^>]*>([\s\S]*?)</title>',content,re.I)
  text=html.unescape(re.sub('<[^>]+>',' ',cleaned));text=re.sub(r'\s+',' ',text).strip()
  (OUT/f'{name}.txt').write_text(text,encoding='utf8')
  return dict(name=name,requestedURL=url,status=response.status_code,finalURL=response.url,
    title=html.unescape(title[1]) if title else None,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),
    publicText=text[:12000],authenticationAttempted=False)
 except Exception as exc:return dict(name=name,requestedURL=url,error=str(exc))
with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(fetch,items))
record=dict(checkedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),results=results,
  browserObservation=dict(attempt='CUA createBrowserTab iab and getState',result='iab unavailable; apps=[]; browsers=[]'),
  policy='Only public read-only pages; did not repeat prior forbidden detail API or solve login/CAPTCHA/DRM.')
(OUT/'public-results.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for r in results:print(json.dumps({k:v for k,v in r.items() if k!='publicText'},ensure_ascii=False));print(r.get('publicText','')[:1400])
