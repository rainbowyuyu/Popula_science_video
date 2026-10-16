from bs4 import BeautifulSoup
from pathlib import Path
s=BeautifulSoup(Path('research/raw/ctbuh.html').read_text('utf8'),'html.parser')
for a in s.select('a[href]'):
 u=a['href'];t=a.get_text(' ',strip=True)
 if any(x in u.lower() for x in ['paper','pdf','research','case-study']):print(t,u)
