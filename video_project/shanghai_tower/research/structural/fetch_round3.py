import requests,concurrent.futures,pathlib,bs4,json,urllib.parse
p=pathlib.Path('research/structural')
urls={
'google-basic':'https://www.google.com/search?gbv=1&hl=en&q=Shanghai+Tower+structural+design+CTBUH+pdf',
'google-udm':'https://www.google.com/search?udm=14&hl=en&q=Shanghai+Tower+structural+design+core+30+megacolumn',
'bing-us':'https://www.bing.com/search?q=Shanghai%20Tower%20structural%20design%20CTBUH%20pdf&setlang=en-US&cc=US',
'ctbuh-search':'https://www.ctbuh.org/search?search=Shanghai%20Tower',
'openalex-structural':'https://api.openalex.org/works?search=Shanghai%20tower%20structural%20design&per-page=15',
'openalex-seismic':'https://api.openalex.org/works/https://doi.org/10.1260/1369-4332.17.4.513',
'ctbuh-papers':'https://global.ctbuh.org/resources/papers/'
}
def get(a):
 k,u=a
 try:
  r=requests.get(u,timeout=25,headers={'User-Agent':'Mozilla/5.0'});e='json' if 'json' in r.headers.get('content-type','') else 'html';(p/(k+'.'+e)).write_bytes(r.content);s=bs4.BeautifulSoup(r.content,'html.parser');out=s.get_text(' ',strip=True) if e=='html' else ''
  if e=='json':
   j=r.json();items=j.get('results',[j]);out=json.dumps([{'title':x.get('title'),'doi':x.get('doi'),'locations':x.get('locations')} for x in items],ensure_ascii=False)
  return k,r.status_code,len(r.content),out[:28000],[(x.get_text(' ',strip=True)[:90],x.get('href')) for x in s.select('a[href]') if ('pdf' in x.get('href','').lower() or 'ctbuh' in x.get('href','').lower())][:25]
 except Exception as e:return k,str(e)
for x in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get,urls.items()):print(x)
