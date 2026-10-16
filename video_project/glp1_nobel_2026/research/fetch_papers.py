from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import requests, json, hashlib
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'research'/'verified_raw'
OUT=ROOT/'public'/'papers';OUT.mkdir(parents=True,exist_ok=True)
targets={
 'mojsov1987_pdf':('https://www.jci.org/articles/view/112855/files/pdf',OUT/'mojsov1987.pdf'),
 'drucker1987_pdf':('https://europepmc.org/articles/PMC304885?pdf=render',OUT/'drucker1987.pdf'),
 'withdrawal_pdf':('https://europepmc.org/articles/PMC9542252?pdf=render',OUT/'withdrawal2022.pdf'),
 'receptor2017_pdf':('https://europepmc.org/articles/PMC5587415?pdf=render',OUT/'receptor2017.pdf'),
 'appetite2021_pdf':('https://europepmc.org/articles/PMC7898914?pdf=render',OUT/'appetite2021.pdf'),
 'half_life_review':('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.3389/fendo.2019.00155&format=json&resultType=core',RAW/'half_life_review.json'),
 'half_life_review_xml':('https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6474072/fullTextXML',RAW/'half_life_review.xml'),
 'tirzepatide2022':('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:35658024&format=json&resultType=core',RAW/'tirzepatide2022.json'),
}
def fetch(item):
 name,(url,path)=item;at=datetime.now(timezone.utc).isoformat()
 try:
  r=requests.get(url,timeout=45)
  valid=r.status_code==200 and (not name.endswith('_pdf') or r.content.startswith(b'%PDF'))
  save=path if valid else RAW/(name+'_failed.txt');save.write_bytes(r.content)
  if path.suffix=='.xml' and valid:(RAW/'half_life_review_fulltext.txt').write_text(BeautifulSoup(r.content,'xml').get_text(' ',strip=True),encoding='utf-8')
  return {'id':name,'url':url,'finalUrl':r.url,'retrievedAtUTC':at,'status':r.status_code,'bytes':len(r.content),'valid':valid,'sha256':hashlib.sha256(r.content).hexdigest(),'savedPath':str(save.relative_to(ROOT))}
 except Exception as e:return {'id':name,'url':url,'retrievedAtUTC':at,'error':str(e)}
records=[]
with ThreadPoolExecutor(max_workers=5) as pool:
 for future in as_completed([pool.submit(fetch,x) for x in targets.items()]):
  r=future.result();records.append(r);print(json.dumps(r),flush=True)
(ROOT/'research'/'paper-retrieval-log.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
