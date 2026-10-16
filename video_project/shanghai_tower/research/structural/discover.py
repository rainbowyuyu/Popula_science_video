import requests, concurrent.futures, json, pathlib
root=pathlib.Path('research/structural')
urls={
'openalex-zhao':'https://api.openalex.org/works/https://doi.org/10.1016/j.proeng.2011.07.221',
'crossref-search':'https://api.crossref.org/works?query.bibliographic=Shanghai%20Tower%20structural%20design&rows=12',
'google-design':'https://www.google.com/search?q=%22Shanghai+Tower%22+%22structural%22+pdf',
'bing-design':'https://www.bing.com/search?q=%22Shanghai+Tower%22+%22core%22+%2230%22+pdf',
'semantic-zhao':'https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.proeng.2011.07.221?fields=title,openAccessPdf,url,authors',
'elsevier-zhao':'https://api.elsevier.com/content/article/doi/10.1016/j.proeng.2011.07.221?httpAccept=text/xml'}
def get(item):
 k,u=item
 try:
  r=requests.get(u,timeout=30,headers={'User-Agent':'Mozilla/5.0'}); ext='json' if 'json' in r.headers.get('content-type','') else 'html'; (root/(k+'.'+ext)).write_bytes(r.content); return k,r.status_code,r.headers.get('content-type'),len(r.content),r.url
 except Exception as e:return k,str(e)
for r in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get,urls.items()):print(r)
