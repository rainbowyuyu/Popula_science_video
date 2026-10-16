import requests,bs4,pathlib,concurrent.futures,json
p=pathlib.Path('research/structural')
urls={
'wikipedia':'https://en.wikipedia.org/wiki/Shanghai_Tower',
'ctbuh-tower':'https://www.skyscrapercenter.com/building/shanghai-tower/56',
'zhao-mirror':'https://core.ac.uk/search?q=%22Structural%20Design%20of%20Shanghai%20Tower%22',
'google-scholar':'https://scholar.google.com/scholar?q=%22Structural+Design+of+Shanghai+Tower+for+Wind+Loads%22',
'bing-exact':'https://www.bing.com/search?q=%22Structural%20Design%20of%20Shanghai%20Tower%20for%20Wind%20Loads%22',
'poly-monitoring':'https://ira.lib.polyu.edu.hk/handle/10397/6740',
'journal-cn':'http://www.jzjgxb.com/CN/Y2011/V32/I7/7'
}
def get(a):
 k,u=a
 try:
  r=requests.get(u,timeout=25,headers={'User-Agent':'Mozilla/5.0'}); (p/(k+'.html')).write_bytes(r.content);s=bs4.BeautifulSoup(r.content,'html.parser');out=s.get_text(' ',strip=True);links=[(a.get_text(' ',strip=True)[:100],a['href']) for a in s.select('a[href]') if any(x in a['href'].lower() for x in ['pdf','ctbuh','structur','wind'])];return k,r.status_code,len(r.content),out[-18000:],links
 except Exception as e:return k,str(e)
for x in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get,urls.items()):print(x)
