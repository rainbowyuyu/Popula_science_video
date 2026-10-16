import requests,bs4,pathlib,concurrent.futures
p=pathlib.Path('research/structural')
urls={
'scholar-zhao-versions':'https://scholar.google.com/scholar?cluster=6667440136814147125&hl=en&as_sdt=0,5',
'scholar-structural':'https://scholar.google.com/scholar?q=%22Shanghai+Tower%22+%22Structural%22+ctbuh',
'scholar-tmd':'https://scholar.google.com/scholar?q=%22Shanghai+Tower%22+%22frequency%22',
'scholar-seismic':'https://scholar.google.com/scholar?q=%22Performance-Based+Seismic+Design+Principles%22',
'poly-search':'https://ira.lib.polyu.edu.hk/simple-search?query=Shanghai+Tower'
}
def get(a):
 k,u=a
 try:
  r=requests.get(u,timeout=25,headers={'User-Agent':'Mozilla/5.0'});(p/(k+'.html')).write_bytes(r.content);s=bs4.BeautifulSoup(r.content,'html.parser');out=[]
  for x in s.select('.gs_r.gs_or.gs_scl'):
   out.append({'text':x.get_text(' ',strip=True),'links':[(a.get_text(' ',strip=True),a['href']) for a in x.select('a[href]')]})
  return k,r.status_code,out or s.get_text(' ',strip=True)[:17000]
 except Exception as e:return k,str(e)
for x in concurrent.futures.ThreadPoolExecutor(max_workers=3).map(get,urls.items()):print(x)
