from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from hashlib import sha256
from datetime import datetime, timezone
from PIL import Image
import json, posixpath, re

SOURCE = Path('C:/Users/zju/Desktop/Closed-loop_AI_1009.docx')
OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'images').mkdir(exist_ok=True)
NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'm':'http://schemas.openxmlformats.org/officeDocument/2006/math',
      'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'v':'urn:schemas-microsoft-com:vml'}
def digest(data): return sha256(data).hexdigest()
def text(el):
    nodes=el.xpath('.//w:t | .//m:t', namespaces=NS)
    return ''.join(n.text or '' for n in nodes if not any(a.tag in {'{'+NS['w']+'}del','{'+NS['w']+'}moveFrom'} for a in n.iterancestors()))
with ZipFile(SOURCE) as z:
    doc = etree.fromstring(z.read('word/document.xml'))
    relroot = etree.fromstring(z.read('word/_rels/document.xml.rels'))
    rels = {el.get('Id'): el.get('Target') for el in relroot}
    records, paras, tables, image_refs, revisions = [], [], [], [], []
    pnum = tnum = 0
    def imgrefs(el, loc):
        nodes = el.xpath('.//*[@r:embed] | .//v:imagedata[@r:id]', namespaces=NS)
        ids=[]
        for node in nodes:
            rid=node.get('{'+NS['r']+'}embed') or node.get('{'+NS['r']+'}id')
            deleted=any(a.tag in {'{'+NS['w']+'}del','{'+NS['w']+'}moveFrom'} for a in node.iterancestors())
            target = rels.get(rid)
            resolved = posixpath.normpath(posixpath.join('word', target)) if target else None
            image_refs.append({'locator':loc, 'relationshipId':rid, 'zipPath':resolved,'deletedByTrackedChange':deleted})
            if not deleted:ids.append(rid)
        for rev in el.xpath('.//w:ins | .//w:del | .//w:moveFrom | .//w:moveTo',namespaces=NS):
            revisions.append({'locator':loc,'type':etree.QName(rev).localname,'id':rev.get('{'+NS['w']+'}id'),'author':rev.get('{'+NS['w']+'}author'),'date':rev.get('{'+NS['w']+'}date'),'text':''.join(rev.xpath('.//w:t/text() | .//w:delText/text() | .//m:t/text()',namespaces=NS)),'imageRels':rev.xpath('.//@r:embed | .//v:imagedata/@r:id',namespaces=NS)})
        return ids
    for order, el in enumerate(doc.find('w:body', NS), 1):
        if el.tag == '{'+NS['w']+'}p':
            pnum += 1
            loc = f'P{pnum:04d}'
            style = el.xpath('./w:pPr/w:pStyle/@w:val', namespaces=NS)
            record = {'order':order, 'type':'paragraph', 'locator':loc, 'style':style[0] if style else None,
                      'text':text(el), 'images':imgrefs(el,loc)}
            records.append(record); paras.append(record)
        elif el.tag == '{'+NS['w']+'}tbl':
            tnum += 1
            loc = f'T{tnum:02d}'
            rows = []
            for ri,row in enumerate(el.findall('w:tr',NS),1):
                cells=[]
                for ci,cell in enumerate(row.findall('w:tc',NS),1):
                    cell_loc=f'{loc}R{ri:02d}C{ci:02d}'
                    cell_paras=[]
                    for pi,p in enumerate(cell.findall('w:p',NS),1):
                        pl=f'{cell_loc}P{pi:02d}'
                        cell_paras.append({'locator':pl,'text':text(p),'images':imgrefs(p,pl)})
                    cells.append({'locator':cell_loc,'text':'\n'.join(p['text'] for p in cell_paras),'paragraphs':cell_paras})
                rows.append({'row':ri,'cells':cells})
            record={'order':order,'type':'table','locator':loc,'rows':rows}
            records.append(record);tables.append(record)
    images=[]
    for name in z.namelist():
        if name.startswith('word/media/') and not name.endswith('/'):
            data=z.read(name);dest=OUT/'images'/Path(name).name;dest.write_bytes(data)
            im={'zipPath':name,'file':dest.relative_to(OUT).as_posix(),'sha256':digest(data),'bytes':len(data),'references':[x for x in image_refs if x['zipPath']==name]}
            try:
                with Image.open(dest) as source_image: im.update(width=source_image.width,height=source_image.height,format=source_image.format)
            except Exception as exc: im['imageMetadataError']=str(exc)
            images.append(im)
    meta={name:z.read(name).decode('utf-8',errors='replace') for name in ['docProps/core.xml','docProps/app.xml'] if name in z.namelist()}
    comments=[]
    if 'word/comments.xml' in z.namelist():
        root=etree.fromstring(z.read('word/comments.xml'))
        comments=[{'id':el.get('{'+NS['w']+'}id'),'author':el.get('{'+NS['w']+'}author'),'text':text(el)} for el in root]
    tracked={'insertions':len(doc.xpath('//w:ins',namespaces=NS)),'deletions':len(doc.xpath('//w:del',namespaces=NS))}
    manifest={'schema':'v20-document-extraction-v2','source':str(SOURCE),'sourceSHA256':digest(SOURCE.read_bytes()),'sourceBytes':SOURCE.stat().st_size,'createdAt':datetime.now(timezone.utc).isoformat(),'method':'Read-only ZIP/OOXML extraction; body order and table cell locators preserved. Accepted-view text excludes w:del and w:moveFrom ancestors, includes insertions. Formula text is linearized OMML, not a full mathematical rendering. All media preserved and refs marked active/deleted including SVG. Instructions and comments treated as document content, never executed. Original unchanged.','paragraphCount':pnum,'tableCount':tnum,'imageCount':len(images),'trackedChanges':tracked,'comments':comments,'images':images,'metadataXML':meta}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'ordered-content.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'tracked-revisions.json').write_text(json.dumps(revisions,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=[]
    for rec in records:
        if rec['type']=='paragraph': lines.append(f"[{rec['locator']}] {rec['text']}" + (f" [images:{','.join(rec['images'])}]" if rec['images'] else ''))
        else:
            lines.append(f"\n[{rec['locator']}] TABLE")
            for row in rec['rows']:
                for c in row['cells']: lines.append(f"[{c['locator']}] {c['text']}")
            lines.append(f"[/{rec['locator']}]\n")
    (OUT/'ordered-content.txt').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({k:manifest[k] for k in ['sourceSHA256','paragraphCount','tableCount','imageCount','trackedChanges']},ensure_ascii=False))
