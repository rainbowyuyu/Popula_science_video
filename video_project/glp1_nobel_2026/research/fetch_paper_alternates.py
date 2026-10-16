from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
import requests,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
targets={
 'drucker1987_pnas':'https://www.pnas.org/doi/pdf/10.1073/pnas.84.10.3434',
 'drucker1987_pmc':'https://pmc.ncbi.nlm.nih.gov/articles/PMC304885/pdf/pnas00296-0338.pdf',
 'drucker1987_page':'https://pmc.ncbi.nlm.nih.gov/articles/PMC304885/',
 'withdrawal_wiley':'https://onlinelibrary.wiley.com/doi/pdfdirect/10.1111/dom.14725',
 'holst1987_wiley':'https://onlinelibrary.wiley.com/doi/pdfdirect/10.1016/0014-5793%2887%2981430-8',
 'discovery2019_frontiers':'https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2019.00155/pdf',
 'withdrawal_oa_new':'https://pmc.ncbi.nlm.nih.gov/utils/oa/oa.fcgi?id=PMC9542252',
 'withdrawal_xml':'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC9542252/fullTextXML',
}
def get(item):
 name,url=item;at=datetime.now(timezone.utc).isoformat()
 try:
  r=requests.get(url,timeout=40);valid=r.content.startswith(b'%PDF')
  p=ROOT/('public/papers' if valid else 'research/verified_raw')/(name+('.pdf' if valid else '.txt'));p.write_bytes(r.content)
  return {'id':name,'url':url,'finalUrl':r.url,'retrievedAtUTC':at,'status':r.status_code,'bytes':len(r.content),'pdf':valid,'savedPath':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(r.content).hexdigest()}
 except Exception as e:return {'id':name,'url':url,'retrievedAtUTC':at,'error':str(e)}
records=[]
with ThreadPoolExecutor(max_workers=6) as pool:
 for future in as_completed([pool.submit(get,x) for x in targets.items()]):
  r=future.result();records.append(r);print(json.dumps(r),flush=True)
(ROOT/'research/paper-alternates-log.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
