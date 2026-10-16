"""Follow published author links and dataset indexes; raw evidence is retained."""
from concurrent.futures import ThreadPoolExecutor
import json,urllib.parse
from discover_sources import OUT,retrieve

sources=[
 ('author-ssi-paper','http://www.luxinzheng.net/publication6/Soil_Structure_Interaction_Super_Tall_JRMGE_2014.htm'),
 ('author-collapse-2016','http://www.luxinzheng.net/publication7/2016-TSB-Collapse_Analysis_in_Supertall_Building.htm'),
 ('author-simplified-2016','http://www.luxinzheng.net/publication7/2016-BEE-Tall_Building_NMFS_Model.htm'),
 ('zenodo-shanghai-exact','https://zenodo.org/api/records?'+urllib.parse.urlencode({'q':'"Shanghai Tower" AND OpenSees','size':50})),
 ('zenodo-irfs-metadata','https://zenodo.org/api/records/3928997'),
 ('github-shanghai-model','https://api.github.com/search/repositories?'+urllib.parse.urlencode({'q':'"Shanghai Tower" model','per_page':50})),
 ('github-xinzheng','https://api.github.com/search/users?'+urllib.parse.urlencode({'q':'Xinzheng Lu','per_page':30})),
 ('crossref-shanghai-collapse','https://api.crossref.org/works?'+urllib.parse.urlencode({'query.title':'Collapse simulation of a super high-rise building subjected to extremely strong earthquakes','rows':3})),
 ('crossref-ctbuh-shanghai','https://api.crossref.org/works?'+urllib.parse.urlencode({'query':'Shanghai Tower structural design CTBUH Su','rows':15})),
 ('duckduckgo-shanghai','https://html.duckduckgo.com/html/?'+urllib.parse.urlencode({'q':'"Shanghai Tower" "OpenSees" download'})),
]
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(retrieve,sources))
    (OUT/'followup-retrieval.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps([{k:v for k,v in x.items() if k in ['name','status','error','bytes']} for x in results],ensure_ascii=False,indent=2))
