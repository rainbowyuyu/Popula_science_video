from pathlib import Path
import requests,json,hashlib
from bs4 import BeautifulSoup
R=Path(__file__).resolve().parents[1];Q=R/'research/v3';P=R/'public/v3/music';P.mkdir(parents=True,exist_ok=True)
s=requests.Session();s.trust_env=False
u='https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher2.mp3';dest=P/'Cipher2.mp3'
if not dest.exists():r=s.get(u,timeout=90);r.raise_for_status();assert len(r.content)>1000000;dest.write_bytes(r.content)
for name,url in [('cipher-page','https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100844'),('cc-by','https://creativecommons.org/licenses/by/4.0/'),('narrative-paper','https://pmc.ncbi.nlm.nih.gov/articles/PMC4183174/')]:
 try:
  r=s.get(url,timeout=35);r.raise_for_status();p=BeautifulSoup(r.content,'html.parser');[v.decompose() for v in p(['script','style'])];(Q/(name+'.txt')).write_text(p.get_text(' ',strip=True),encoding='utf8');print(name,r.status_code,len(r.content),flush=True)
 except Exception as e:print(name,type(e).__name__,flush=True)
(Q/'music-source.json').write_text(json.dumps({'title':'Cipher','artist':'Kevin MacLeod','isrc':'USUAN1100844','source':'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100844','download':u,'license':'CC BY 4.0','permission':'https://incompetech.com/music/royalty-free/licenses/','sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'changes':'Selection, phrase-aligned overlap, EQ, loudness normalization and narration ducking; original tempo and pitch','selection':'Electric piano, synths, strings and light percussion support everyday curiosity and iterative engineering; replaces the previous synthetic four-chord score','notUsedInPriorFilmTitles':['Digital Lemonade','Galactic Rap','Bleeping Demo','Getting it Done','Inspired','Pamgaea']},ensure_ascii=False,indent=2),encoding='utf8')
print('Music ready')
