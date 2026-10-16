from pathlib import Path
from datetime import datetime,timezone
import concurrent.futures,json,hashlib,requests
from bs4 import BeautifulSoup

OUT=Path(__file__).resolve().parent/'music-public-recheck';OUT.mkdir(exist_ok=True)
queries=[
 ('bing-exact-video','https://www.bing.com/search',{'format':'rss','q':'"7693053715154013455"'}),
 ('duckduckgo-exact-video','https://html.duckduckgo.com/html/',{'q':'"7693053715154013455"'}),
 ('bing-caption-author','https://www.bing.com/search',{'format':'rss','q':'"人的眼泪总是向下坠落" "默" "音乐"'}),
]
def fetch(job):
 name,url,params=job
 record={'route':name,'publicURL':url,'query':params['q']}
 try:
  r=requests.get(url,params=params,headers={'User-Agent':'Mozilla/5.0'},timeout=25)
  suffix='.xml' if 'rss' in r.headers.get('content-type','') else '.html'
  p=OUT/(name+suffix);p.write_bytes(r.content)
  record.update(httpStatus=r.status_code,finalURL=r.url,bytes=len(r.content),sha256=hashlib.sha256(r.content).hexdigest(),file=str(p.name))
  soup=BeautifulSoup(r.content,'xml' if '<rss' in r.text[:500] else 'html.parser')
  if soup.find('rss'):
   record['results']=[{'title':it.find('title').get_text() if it.find('title') else '', 'link':it.find('link').get_text() if it.find('link') else '', 'description':it.find('description').get_text() if it.find('description') else ''} for it in soup.find_all('item')[:10]]
  else:
   for x in soup(['script','style']):x.decompose()
   text=soup.get_text(' ',strip=True)
   (OUT/(name+'.txt')).write_text(text,encoding='utf8')
   record['visibleTextExcerpt']=text[:1800]
   record['results']=[{'title':a.get_text(' ',strip=True),'link':a.get('href','')} for a in soup.select('.result__a')[:10]]
 except requests.RequestException as e:record.update(status='network_error',errorType=type(e).__name__)
 return record
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:results=list(ex.map(fetch,queries))
report={'checkedUTC':datetime.now(timezone.utc).isoformat(),'videoID':'7693053715154013455','priorEvidenceRead':['audio/requested-bgm/availability.json','audio/requested-bgm/recheck-v3/summary.json'],'avoidedRepeatedRoutes':['403 detail API','empty legacy API','script-only public share redirect','Baidu CAPTCHA'],'attempts':results,'musicTitle':None,'musicAuthor':None,'musicID':None,'audioDownloaded':False,'status':'pending_read_of_new_search_results'}
(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
