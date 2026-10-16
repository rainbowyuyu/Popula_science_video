from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from bs4 import BeautifulSoup
from PIL import Image
import requests,json,hashlib,fitz
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'research/verified_raw';OUT=ROOT/'public/papers'
html=BeautifulSoup((RAW/'drucker1987_page.txt').read_text(encoding='utf-8'),'html.parser')
targets={f'drucker1987_page_{i:02d}':(x['src'],OUT/f'drucker1987_page_{i:02d}.png') for i,x in enumerate(html.select('figure.fig-scanned img'),1)}
ucl=BeautifulSoup((RAW/'withdrawal_ucl.txt').read_text(encoding='utf-8'),'html.parser')
targets['withdrawal2022_pdf']=(ucl.select_one('a.ep_document_link')['href'],OUT/'withdrawal2022.pdf')
def fetch(item):
 name,(url,path)=item;at=datetime.now(timezone.utc).isoformat();r=requests.get(url,timeout=40);r.raise_for_status();path.write_bytes(r.content)
 return {'id':name,'url':url,'finalUrl':r.url,'status':r.status_code,'retrievedAtUTC':at,'sha256':hashlib.sha256(r.content).hexdigest(),'bytes':len(r.content),'savedPath':str(path.relative_to(ROOT))}
with ThreadPoolExecutor(max_workers=6) as pool:records=list(pool.map(fetch,targets.items()))
assembled=fitz.open()
for i in range(1,6):
 image_doc=fitz.open(OUT/f'drucker1987_page_{i:02d}.png')
 page_doc=fitz.open('pdf',image_doc.convert_to_pdf())
 assembled.insert_pdf(page_doc)
assembled.save(OUT/'drucker1987_from_PMC_scans.pdf')
# This PDF faithfully assembles PMC's original page scans, not a recreated paper layout.
fitz.Pixmap(str(OUT/'drucker1987_page_01.png')).save(OUT/'drucker1987_page1.jpg',jpg_quality=95)
for name,out in [('mojsov1987','mojsov1987_page1'),('withdrawal2022','withdrawal2022_page1'),('discovery2019_frontiers','discovery2019_page1')]:
 doc=fitz.open(OUT/(name+'.pdf'));page=doc[0];pix=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False);pix.save(OUT/(out+'.jpg'),jpg_quality=95)
 print(name,'pages',len(doc),'page1_text',page.get_text()[:160].replace('\n',' '))
 print(out,pix.width,pix.height)
(ROOT/'research/paper-final-log.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
manifest={'renderedAtUTC':datetime.now(timezone.utc).isoformat(),'credit':'真实论文原页；仅格式转换，未重排或改写内容。','recommendedEndCredits':['papers/mojsov1987_page1.jpg','papers/drucker1987_page1.jpg','papers/withdrawal2022_page1.jpg'],'papers':[
 {'id':'mojsov1987','pdf':'papers/mojsov1987.pdf','page1':'papers/mojsov1987_page1.jpg','page':1,'paperPage':'616','origin':'Publisher-hosted original PDF','url':'https://www.jci.org/articles/view/112855/files/pdf'},
 {'id':'drucker1987','pdf':'papers/drucker1987_from_PMC_scans.pdf','page1':'papers/drucker1987_page1.jpg','page':1,'paperPage':'3434','origin':'PMC original scanned pages assembled without content changes; original publisher PDF endpoint was unavailable','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC304885/'},
 {'id':'withdrawal','pdf':'papers/withdrawal2022.pdf','page1':'papers/withdrawal2022_page1.jpg','page':1,'paperPage':'1553','origin':'Published article PDF in UCL institutional repository','url':targets['withdrawal2022_pdf'][0]},
 {'id':'half_life_review','pdf':'papers/discovery2019_frontiers.pdf','page1':'papers/discovery2019_page1.jpg','page':1,'origin':'Publisher-hosted open-access PDF','url':'https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2019.00155/pdf'}]}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(records,ensure_ascii=False,indent=2))
