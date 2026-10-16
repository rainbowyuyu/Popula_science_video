from pathlib import Path
import concurrent.futures, datetime, hashlib, json, re, sys
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
import fitz

OUT = Path(__file__).resolve().parent
TARGETS = [
 ('w78-2014-paper-148', 'https://itc.scix.net/pdfs/w78-2014-paper-148.pdf'),
 ('gpu-opensees-workshop-2015', 'http://www.luxinzheng.net/publication6/GPU-OpenSees_ASCE_Workshop_2015.htm'),
 ('griffith-lu2015-fulltext', 'https://research-repository.griffith.edu.au/bitstreams/8a035e17-ed40-5149-8967-65ac69a386af/download'),
 ('pan2020-publisher', 'https://www.sciencedirect.com/science/article/abs/pii/S0045794920300882'),
]
if len(sys.argv)>1: TARGETS=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
def fetch(item):
 name,url=item
 record={'name':name,'url':url,'accessUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  r=requests.get(url,timeout=(10,35),headers={'User-Agent':'Mozilla/5.0 (compatible; research source verification)'})
  record.update(status=r.status_code,finalURL=r.url,contentType=r.headers.get('content-type'),bytes=len(r.content),sha256=hashlib.sha256(r.content).hexdigest())
  ispdf=r.content[:5]==b'%PDF-'
  suffix='.pdf' if ispdf else '.html' if 'html' in r.headers.get('content-type','').lower() else '.raw'
  p=OUT/(name+suffix);p.write_bytes(r.content);record['file']=p.name
  if ispdf:
   d=fitz.open(p);record['pages']=len(d);record['embeddedFiles']=d.embfile_names()
   texts=[];links=[]
   for i,page in enumerate(d):
    texts.append(f'\n--- PDF PAGE {i+1} ---\n'+page.get_text())
    for link in page.get_links():
     if link.get('uri'):links.append({'page':i+1,'url':link['uri']})
   text='\n'.join(texts);record['metadata']=d.metadata
   (OUT/(name+'.txt')).write_text(text,encoding='utf-8');(OUT/(name+'.links.json')).write_text(json.dumps(links,ensure_ascii=False,indent=2),encoding='utf-8')
   record['links']=links
   record['matches']=[text[max(0,m.start()-120):min(len(text),m.end()+200)] for m in re.finditer(r'(?i)53,?006|48,?774|39,?315|632|121|606|download|supplement|available|github|data availability',text)]
  elif 'html' in r.headers.get('content-type','').lower():
   r.encoding=r.apparent_encoding; soup=BeautifulSoup(r.text,'html.parser');text=soup.get_text('\n',strip=True)
   links=[{'text':a.get_text(' ',strip=True),'url':urljoin(r.url,a['href'])} for a in soup.find_all('a',href=True)]
   (OUT/(name+'.txt')).write_text(text,encoding='utf-8');(OUT/(name+'.links.json')).write_text(json.dumps(links,ensure_ascii=False,indent=2),encoding='utf-8');record['links']=links
   record['matches']=[text[max(0,m.start()-120):min(len(text),m.end()+200)] for m in re.finditer(r'(?i)53,?006|48,?774|39,?315|632|121|606|download|supplement|available|github|data availability',text)]
 except Exception as e: record['error']=str(e)
 return record
OUT.mkdir(parents=True,exist_ok=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: records=list(pool.map(fetch,TARGETS))
name='retrieval-initial.json' if len(sys.argv)==1 else Path(sys.argv[1]).stem+'-retrieval.json'
(OUT/name).write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{k:v for k,v in r.items() if k not in ['links','matches']} for r in records],ensure_ascii=False,indent=2))
