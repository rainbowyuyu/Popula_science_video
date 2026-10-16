import requests,concurrent.futures,pathlib,fitz,json
p=pathlib.Path('research/structural')
urls={
'zhao2011-core':'https://core.ac.uk/download/pdf/82001482.pdf',
'zhao2011-cyber':'https://cyberleninka.org/article/n/418651.pdf',
'zhu2012-design':'https://eeme.ntua.gr/proceedings/8th/Invited_Speakers/PAP_Velivasakis.pdf',
'wu2021-typhoons':'https://ira.lib.polyu.edu.hk/bitstream/10397/102471/1/Dong_Monitoring_Dynamic_Characteristics.pdf',
'jiang2011-seismic':'https://civil808.com/sites/default/files/field/files/node_9797-performance_based_seismic_design.pdf',
'jiang2014-seismic':'https://www.researchgate.net/profile/Huanjun-Jiang/publication/275459922_Performance-Based_Seismic_Design_Principles_and_Structural_Analysis_of_Shanghai_Tower/links/59adef2caca272f8a1618d7b/Performance-Based-Seismic-Design-Principles-and-Structural-Analysis-of-Shanghai-Tower.pdf',
'chen2013-modal':'https://ishmii.org/wp-content/uploads/2015/04/MS05-09.pdf',
'ou2013-fe':'https://ishmii.org/wp-content/uploads/2015/04/MS05-06.pdf',
'zhang2016-bayesian':'https://partsazeco.com/images/pdf/SHMA3.pdf'
}
def get(a):
 k,u=a
 try:
  r=requests.get(u,timeout=35,headers={'User-Agent':'Mozilla/5.0'});isp=r.content[:4]==b'%PDF';(p/(k+('.pdf' if isp else '.html'))).write_bytes(r.content)
  if isp:
   d=fitz.open(stream=r.content,filetype='pdf');t='\n'.join('--- PDF PAGE '+str(i+1)+' ---\n'+x.get_text() for i,x in enumerate(d));(p/(k+'.txt')).write_text(t,'utf8');return k,r.status_code,len(r.content),len(d),t[:1000]
  return k,r.status_code,len(r.content),'not PDF'
 except Exception as e:return k,str(e)
r=list(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get,urls.items()));(p/'download-round5.json').write_text(json.dumps({'urls':urls,'results':r},ensure_ascii=False,indent=2),'utf8')
for x in r:print(x)
