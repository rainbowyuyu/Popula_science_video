import requests,concurrent.futures,pathlib,bs4
p=pathlib.Path('research/structural')
u={
'sciencedirect-pdf':'https://www.sciencedirect.com/science/article/pii/S1877705811012987/pdf',
'elsevier-pdf':'https://api.elsevier.com/content/article/pii/S1877705811012987?httpAccept=application/pdf',
'elsevier-full':'https://api.elsevier.com/content/article/pii/S1877705811012987?view=FULL&httpAccept=text/xml',
'ddg-zhao':'https://html.duckduckgo.com/html/?q=%22Structural+Design+of+Shanghai+Tower+for+Wind+Loads%22',
'ddg-ctbuh':'https://html.duckduckgo.com/html/?q=Shanghai+Tower+structural+design+ctbuh+pdf',
'cyberleninka-zhao':'https://cyberleninka.org/article/n/282681',
'search-brave':'https://search.brave.com/search?q=%22Shanghai+Tower%22+%22outrigger%22',
}
def get(a):
 k,u=a
 try:
  r=requests.get(u,timeout=35,headers={'User-Agent':'Mozilla/5.0'});e='pdf' if r.content[:4]==b'%PDF' else 'html';(p/(k+'.'+e)).write_bytes(r.content);out=bs4.BeautifulSoup(r.content,'html.parser').get_text(' ',strip=True) if e!='pdf' else 'PDF';return k,r.status_code,len(r.content),r.url,out[:18000]
 except Exception as x:return k,str(x)
for r in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get,u.items()):print(r)
