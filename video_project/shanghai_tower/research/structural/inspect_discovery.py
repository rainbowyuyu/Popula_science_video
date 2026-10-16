import json,pathlib,bs4
p=pathlib.Path('research/structural')
a=json.loads((p/'openalex-zhao.json').read_text('utf8'));print('LOCATIONS',json.dumps(a.get('locations'),ensure_ascii=False))
print('SEMANTIC',(p/'semantic-zhao.json').read_text('utf8'));print('ELSEVIER',(p/'elsevier-zhao.html').read_text('utf8'))
for name in ['google-design','bing-design']:
 s=bs4.BeautifulSoup((p/(name+'.html')).read_text('utf8'),'html.parser');print(name,s.get_text(' ',strip=True)[-35000:]);
 for x in s.select('a[href]'):
  u=x['href']
  if any(z in u.lower() for z in ['pdf','ctbuh','global.ctbuh','researchgate','sciencedirect']):print(x.get_text(' ',strip=True)[:180],u[:1400])
print('crossref')
for a in json.loads((p/'crossref-search.json').read_text('utf8'))['message']['items']:print(a.get('title'),a.get('DOI'),a.get('URL'))
