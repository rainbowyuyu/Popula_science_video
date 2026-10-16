"""Search only real Shanghai Tower author inputs and declared data deposits."""
from concurrent.futures import ThreadPoolExecutor
import json,urllib.parse
from discover_sources import OUT,retrieve
q=urllib.parse.urlencode
sources=[
 ('github-luxinzheng-repos','https://api.github.com/users/luxinzheng/repos?per_page=100'),
 ('openalex-lu2015-locations','https://api.openalex.org/works/https://doi.org/10.1016/j.finel.2015.01.006'),
 ('elsevier-lu2015-full','https://api.elsevier.com/content/article/pii/S0168874X15000074?view=FULL&httpAccept=text/xml'),
 ('sciencedirect-lu2015','https://www.sciencedirect.com/science/article/pii/S0168874X15000074'),
 ('datacite-shanghai-only','https://api.datacite.org/dois?'+q({'query':'titles.title:"Shanghai Tower"','page[size]':100})),
 ('zenodo-shanghai-title','https://zenodo.org/api/records?'+q({'q':'metadata.title:"Shanghai Tower"','size':100})),
 ('harvard-shanghai','https://dataverse.harvard.edu/api/search?'+q({'q':'"Shanghai Tower"','type':'dataset','per_page':100})),
 ('github-shanghai-tower','https://api.github.com/search/repositories?'+q({'q':'shanghai-tower','per_page':100})),
 ('github-shanghai-chinese-only','https://api.github.com/search/repositories?'+q({'q':'上海中心','per_page':100})),
 ('gitee-shanghai','https://gitee.com/api/v5/search/repositories?'+q({'q':'上海中心','per_page':100})),
 ('google-shanghai-model','https://www.google.com/search?'+q({'q':'"Shanghai Tower" "OpenSees" "download"'})),
 ('baidu-shanghai-model','https://www.baidu.com/s?'+q({'wd':'上海中心 OpenSees 53006 模型 下载'})),
 ('author-current-research','http://www.luxinzheng.net/enresearch.htm'),
]
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(retrieve,sources))
    (OUT/'shanghai-only-retrieval.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps([{k:v for k,v in x.items() if k in ['name','status','error','bytes']} for x in results],ensure_ascii=False,indent=2))
