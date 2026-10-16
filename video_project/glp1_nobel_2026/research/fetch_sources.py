from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import requests, json, hashlib
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'verified_raw'
RAW.mkdir(exist_ok=True)
sources = {
 'nobel2026':'https://www.nobelprize.org/prizes/medicine/2026/press-release/',
 'nobel_nomination':'https://www.nobelprize.org/nomination/medicine/',
 'lasker2024':'https://laskerfoundation.org/winners/glp-1-based-therapy-for-obesity/',
 'pdb5vai':'https://www.rcsb.org/structure/5VAI',
 'fda2024':'https://www.fda.gov/news-events/press-announcements/fda-approves-first-treatment-reduce-risk-serious-heart-problems-specifically-adults-obesity-or',
 'wegovy_pi':'https://www.novo-pi.com/wegovy.pdf',
}
for name, query in {
 'mojsov1987':'EXT_ID:3543057',
 'holst1987':'EXT_ID:3542566',
 'drucker1987':'EXT_ID:3033647',
 'semaglutide2015':'EXT_ID:26308095',
 'step1':'EXT_ID:33567185',
 'select':'EXT_ID:37952131',
 'withdrawal':'EXT_ID:35441470',
 'receptor2017':'EXT_ID:28538729',
 'mechanisms2018':'TITLE:"Mechanisms of Action and Therapeutic Application of Glucagon-like Peptide-1"',
 'native_half_life':'TITLE:"The physiology of glucagon-like peptide 1"',
 'appetite_semaglutide':'TITLE:"The effect of semaglutide 2.4 mg once weekly on energy intake"',
 'tirzepatide':'TITLE:"Tirzepatide Once Weekly for the Treatment of Obesity"',
}.items():
 sources[name]='https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+requests.compat.urlencode({'query':query,'format':'json','resultType':'core','pageSize':3})

def fetch(item):
 name,url=item
 at=datetime.now(timezone.utc).isoformat()
 try:
  r=requests.get(url,timeout=45,headers={'User-Agent':'GLP1-science-video evidence verification (educational)'})
  ext='.pdf' if r.content.startswith(b'%PDF') else '.json' if 'json' in r.headers.get('content-type','') else '.html'
  path=RAW/(name+ext); path.write_bytes(r.content)
  if ext=='.html':
   soup=BeautifulSoup(r.content,'html.parser')
   for tag in soup(['script','style','nav','footer']):tag.decompose()
   (RAW/(name+'.txt')).write_text(soup.get_text(' ',strip=True),encoding='utf-8')
  result={'id':name,'url':url,'finalUrl':r.url,'retrievedAtUTC':at,'status':r.status_code,'contentType':r.headers.get('content-type'),'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest(),'savedPath':str(path.relative_to(ROOT.parent))}
  if ext=='.json' and r.status_code==200:
   data=r.json();result['hits']=data.get('hitCount');result['results']=[{k:x.get(k) for k in ('pmid','pmcid','doi','title','pubYear','fullTextUrlList')} for x in data.get('resultList',{}).get('result',[])]
  return result
 except Exception as e:return {'id':name,'url':url,'retrievedAtUTC':at,'error':str(e)}

if __name__=='__main__':
 records=[]
 with ThreadPoolExecutor(max_workers=6) as pool:
  for future in as_completed([pool.submit(fetch,x) for x in sources.items()]):
   record=future.result();records.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)
 (ROOT/'retrieval-log.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
