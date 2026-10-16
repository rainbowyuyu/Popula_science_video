import requests,fitz,pathlib,bs4
p=pathlib.Path('research/structural')
u='https://ira.lib.polyu.edu.hk/bitstream/10397/6740/1/SHM%20of%20Shanghai%20Tower%20-%20R1.pdf'
r=requests.get(u,timeout=35);print(r.status_code,len(r.content),r.content[:4]);
if r.content[:4]==b'%PDF':
 (p/'su2013-monitoring-accepted.pdf').write_bytes(r.content)
 d=fitz.open(stream=r.content,filetype='pdf'); t='\n'.join('--- PDF PAGE '+str(i+1)+' ---\n'+x.get_text() for i,x in enumerate(d));(p/'su2013-monitoring-accepted.txt').write_text(t,'utf8');print(t[:37000])
s=bs4.BeautifulSoup((p/'google-scholar.html').read_text('utf8'),'html.parser')
for a in s.select('a[href]'):
 if 'versions' in a.get_text().lower():print('VERSIONS',a['href'])
