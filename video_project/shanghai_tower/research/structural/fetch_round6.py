import requests,pathlib,fitz,concurrent.futures,bs4
p=pathlib.Path('research/structural')
urls={
'zhu2012-http':'http://eeme.ntua.gr/proceedings/8th/Invited_Speakers/PAP_Velivasakis.pdf',
'zhu2012-www':'https://www.eeme.ntua.gr/proceedings/8th/Invited_Speakers/PAP_Velivasakis.pdf',
'zhao2011-files-core':'https://files.core.ac.uk/download/pdf/82001482.pdf',
'zhao2011-archive':'https://scholar.archive.org/work/uijqo5swnnb6vm452fgvww5sza/access/wayback/https://core.ac.uk/download/pdf/82001482.pdf',
'zhu2012-scholar':'https://scholar.google.com/scholar?q=%22Structural+design+challenges+of+Shanghai+Tower%22',
'outrigger-scholar':'https://scholar.google.com/scholar?q=%22Shanghai+Tower%22+%22outrigger%22+%227%22',
'period-scholar':'https://scholar.google.com/scholar?q=%22Shanghai+Tower%22+%22period%22+%222011%22'
}
def get(a):
 k,u=a
 try:
  r=requests.get(u,timeout=25,headers={'User-Agent':'Mozilla/5.0'});isp=r.content[:4]==b'%PDF';(p/(k+('.pdf' if isp else '.html'))).write_bytes(r.content)
  if isp:
   d=fitz.open(stream=r.content,filetype='pdf');t='\n'.join('--- PDF PAGE '+str(i+1)+' ---\n'+x.get_text() for i,x in enumerate(d));(p/(k+'.txt')).write_text(t,'utf8');return k,r.status_code,len(d),t[:1400]
  s=bs4.BeautifulSoup(r.content,'html.parser');out=[{'text':x.get_text(' ',strip=True),'links':[(a.get_text(' ',strip=True),a['href']) for a in x.select('a[href]') if not a['href'].startswith('javascript')]} for x in s.select('.gs_r.gs_or.gs_scl')];return k,r.status_code,out or s.get_text(' ',strip=True)[:400]
 except Exception as e:return k,str(e)
for x in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get,urls.items()):print(x)
