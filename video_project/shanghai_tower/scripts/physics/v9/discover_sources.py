"""Read-only public-source retrieval; never executes downloaded model code."""
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import hashlib, json, urllib.request, urllib.parse

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'research/physics-v9/discovery'

class Page(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.text=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
        if tag=='a':
            href=dict(attrs).get('href')
            if href:self.links.append(href)
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden and data.strip():self.text.append(data.strip())

SOURCES=[
 ('crossref-shanghai-opensees','https://api.crossref.org/works?'+urllib.parse.urlencode({'query':'Shanghai Tower OpenSees Lu','rows':15})),
 ('crossref-shell-doi','https://api.crossref.org/works/10.1016/j.finel.2015.01.006'),
 ('author-shanghai-collapse','http://www.luxinzheng.net/publication5/Shanghai_Tower_SCTS.htm'),
 ('author-english-publications','http://www.luxinzheng.net/enpublications.htm'),
 ('author-chinese-download','http://www.luxinzheng.net/download.htm'),
 ('github-repos-opensees-shanghai','https://api.github.com/search/repositories?'+urllib.parse.urlencode({'q':'Shanghai Tower OpenSees','per_page':30})),
 ('github-repos-shanghai-chinese','https://api.github.com/search/repositories?'+urllib.parse.urlencode({'q':'上海中心 OpenSees','per_page':30})),
 ('github-repos-luxinzheng','https://api.github.com/search/repositories?'+urllib.parse.urlencode({'q':'OpenSeesTHU','per_page':30})),
 ('zenodo-shanghai-opensees','https://zenodo.org/api/records?'+urllib.parse.urlencode({'q':'"Shanghai Tower" OpenSees','size':20})),
 ('datacite-shanghai-opensees','https://api.datacite.org/dois?'+urllib.parse.urlencode({'query':'"Shanghai Tower" OpenSees','page[size]':25})),
 ('ctbuh-search','https://global.ctbuh.org/resources/papers/'),
 ('bing-shanghai-model','https://www.bing.com/search?'+urllib.parse.urlencode({'q':'"Shanghai Tower" "OpenSees" model download','format':'rss'})),
 ('bing-shanghai-chinese','https://www.bing.com/search?'+urllib.parse.urlencode({'q':'上海中心 OpenSees 模型 下载 节点','format':'rss'})),
]

def retrieve(item):
    name,url=item;record=dict(name=name,url=url,startedAtUTC=datetime.now(timezone.utc).isoformat())
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (research; public source verification)','Accept':'application/json,text/html,*/*'})
        with urllib.request.urlopen(request,timeout=30) as response:
            raw=response.read(12*1024*1024);record.update(status=response.status,finalURL=response.url,contentType=response.headers.get('content-type'))
        (OUT/(name+'.raw')).write_bytes(raw)
        record.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
        text=raw.decode('utf-8',errors='replace')
        try:
            value=json.loads(text);(OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8')
        except json.JSONDecodeError:
            page=Page();page.feed(text)
            (OUT/(name+'.txt')).write_text('\n'.join(page.text),'utf-8')
            (OUT/(name+'.links.json')).write_text(json.dumps(sorted(set(urllib.parse.urljoin(url,x) for x in page.links)),ensure_ascii=False,indent=2),'utf-8')
    except Exception as e:record.update(error=type(e).__name__+': '+str(e))
    return record

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=5) as pool:records=list(pool.map(retrieve,SOURCES))
    (OUT/'retrieval.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps(records,ensure_ascii=False,indent=2))
