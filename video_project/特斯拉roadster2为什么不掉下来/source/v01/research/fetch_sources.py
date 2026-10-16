"""Fetch public reference pages only; no logins, cookies or bypasses."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from html.parser import HTMLParser
import json, hashlib, datetime

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'references/v01'
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = [
    ('tesla-roadster', 'https://www.tesla.com/roadster'),
    ('nasa-thrust', 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/'),
    ('openstax-projectile', 'https://openstax.org/books/university-physics-volume-1/pages/4-3-projectile-motion'),
    ('openstax-angular', 'https://openstax.org/books/university-physics-volume-1/pages/11-4-precession-of-a-gyroscope'),
]
class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.hidden=0; self.parts=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden = max(0, self.hidden-1)
    def handle_data(self, data):
        if not self.hidden and data.strip(): self.parts.append(data.strip())

records=[]
for key,url in SOURCES:
    rec={'id':key,'url':url,'accessedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0 (public educational reference check)'}), timeout=25) as r:
            raw=r.read(2500000); rec.update(status=r.status, finalUrl=r.url)
        text=raw.decode('utf-8',errors='replace'); parser=Text(); parser.feed(text)
        (OUT/f'{key}.html').write_text(text,encoding='utf-8')
        (OUT/f'{key}.txt').write_text('\n'.join(parser.parts),encoding='utf-8')
        rec.update(sha256=hashlib.sha256(raw).hexdigest(),chars=sum(map(len,parser.parts)),bodyRetrieved=True)
    except Exception as exc:
        rec.update(bodyRetrieved=False,error=str(exc))
    records.append(rec)
    print(json.dumps(rec,ensure_ascii=False))
(OUT/'fetch_report.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
