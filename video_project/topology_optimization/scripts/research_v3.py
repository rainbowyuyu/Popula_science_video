from pathlib import Path
import requests,json,hashlib
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
R=Path(__file__).resolve().parents[1]; Q=R/'research/v3';Q.mkdir(parents=True,exist_ok=True)
urls={
 'search-topic':'https://www.bing.com/search?q=%22topology%20optimization%22%20explained&ensearch=1',
 'search-story':'https://www.bing.com/search?q=%22science%20storytelling%22&ensearch=1',
 'formlabs':'https://formlabs.com/blog/topology-optimization/',
 'autodesk':'https://www.autodesk.com/products/fusion-360/blog/topology-optimization/',
 'storytelling':'https://www.pnas.org/doi/10.1073/pnas.1320645111',
 'music-license':'https://incompetech.com/music/royalty-free/licenses/',
 'music-catalog':'https://incompetech.com/music/royalty-free/pieces.json',
}
def get(item):
 name,url=item;s=requests.Session();s.trust_env=False
 try:
  r=s.get(url,timeout=35);r.raise_for_status();r.encoding='utf8'
  if name=='music-catalog':
   data=r.json(); candidates=[v for v in data if v['title'] in ['Cipher','Thinking Music','Carefree','Deliberate Thought','As I Figure','Cylinder Five']];text=json.dumps(candidates,ensure_ascii=False,indent=2)
  else:
   p=BeautifulSoup(r.content,'html.parser');[v.decompose() for v in p(['script','style','nav','footer'])];text=p.get_text(' ',strip=True)
  (Q/(name+'.txt')).write_text(text,encoding='utf8');return {'id':name,'url':url,'status':r.status_code,'chars':len(text),'file':name+'.txt'}
 except Exception as e:return {'id':name,'url':url,'error':type(e).__name__}
rows=list(ThreadPoolExecutor(max_workers=5).map(get,urls.items()));(Q/'sources.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(rows,ensure_ascii=False,indent=2))
