"""Read public authoritative health pages; store provenance, not credentials."""
import concurrent.futures, datetime, hashlib, json, pathlib, re
import requests
from bs4 import BeautifulSoup

BASE = pathlib.Path(__file__).parent
SOURCES = [
 ('who_hypertension', 'https://www.who.int/news-room/fact-sheets/detail/hypertension'),
 ('who_healthy_diet', 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet'),
 ('who_activity', 'https://www.who.int/news-room/fact-sheets/detail/physical-activity'),
 ('niddk_resistance', 'https://www.niddk.nih.gov/health-information/diabetes/overview/what-is-diabetes/prediabetes-insulin-resistance'),
 ('aha_atherosclerosis', 'https://www.heart.org/en/health-topics/cholesterol/about-cholesterol/atherosclerosis'),
 ('niddk_older', 'https://www.niddk.nih.gov/health-information/weight-management/healthy-eating-physical-activity-for-life/health-tips-for-older-adults'),
 ('who_lsss', 'https://www.who.int/publications/i/item/9789240105591'),
 ('aha_heart_stroke', 'https://www.heart.org/en/about-us/heart-attack-and-stroke-symptoms'),
 ('aha_cholesterol', 'https://www.heart.org/en/health-topics/cholesterol/prevention-and-treatment-of-high-cholesterol-hyperlipidemia'),
 ('niddk_ckd', 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition'),
]

def get(item):
    source_id, url = item
    retrieved = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        r = requests.get(url, timeout=40, headers={'User-Agent':'Mozilla/5.0 (compatible; educational-source-verification/1.0)'})
        soup = BeautifulSoup(r.content, 'html.parser')
        for tag in soup(['script','style','nav','header','footer']): tag.decompose()
        main = soup.find('main') or soup.find('article') or soup.body or soup
        text = re.sub(r'\n{3,}', '\n\n', main.get_text('\n', strip=True))
        (BASE / (source_id + '.txt')).write_text(text, encoding='utf-8')
        return {'id':source_id,'requestedUrl':url,'finalUrl':r.url,'httpStatus':r.status_code,'title':soup.title.get_text(strip=True) if soup.title else '', 'retrievedUTC':retrieved,'sha256Text':hashlib.sha256(text.encode()).hexdigest(),'localText':source_id+'.txt','characterCount':len(text), 'status':'retrieved' if r.ok else 'http_error'}
    except Exception as e:
        return {'id':source_id,'requestedUrl':url,'retrievedUTC':retrieved,'status':'failed','error':str(e)}

BASE.mkdir(parents=True,exist_ok=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: results=list(pool.map(get,SOURCES))
(BASE/'research-log.json').write_text(json.dumps({'method':'Direct retrieval of authoritative public webpages; full extracted text retained for verification. No search-result snippets used as evidence.','retrievals':results}, ensure_ascii=False,indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=True,indent=2))
