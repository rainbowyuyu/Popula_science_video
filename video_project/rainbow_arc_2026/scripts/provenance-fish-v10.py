from pathlib import Path
import hashlib, json, re, urllib.request
root=Path(__file__).resolve().parents[1]
folder=root/'public/assets_v10/characters/rainbow_fish'
assets=['public/assets_v10/characters/rainbow_fish.glb',
 'public/assets_v10/characters/rainbow_fish/rainbow-fish-source-v10.blend',
 'scripts/build-fish-v10.py','src/FishObserverV10.ts','src/FishMotionV10.ts']
ledger=[]
for relative in assets:
    p=root/relative;ledger.append({'file':relative,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
references=[]
for url in ['https://en.wikipedia.org/wiki/Fish_fin','https://en.wikipedia.org/wiki/Koi']:
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (rainbow-science reference audit)'})
        with urllib.request.urlopen(req,timeout=20) as response: html=response.read().decode('utf-8','replace')
        title=re.search(r'<title>(.*?)</title>',html,re.S)
        paragraphs=[]
        for item in re.findall(r'<p[^>]*>(.*?)</p>',html,re.S):
            text=re.sub('<[^>]+>',' ',item);text=re.sub(r'\s+',' ',text).strip()
            if len(text)>120:paragraphs.append(text)
            if len(paragraphs)>=3:break
        references.append({'url':url,'status':'read','accessedOn':'2026-10-12','title':title.group(1) if title else '',
            'excerpt':paragraphs,'usage':'General fin arrangement and koi silhouette only; no copied media/geometry',
            'fetchedPageSHA256':hashlib.sha256(html.encode()).hexdigest()})
    except Exception as exc: references.append({'url':url,'status':'unavailable','error':str(exc),
        'usage':'Not used as a source of copied mesh, texture, or image'})
record={'asset':'Original rainbow-fish mascot V10','externalMeshOrTextures':[],
 'authoring':'Original parametric continuous mesh, painted vertex colors, explicit nineteen-bone weighted armature',
 'rigSource':'Blender 5.1.2 via D:/blender/blender.exe','runtime':'Three.js 0.180 analytic deterministic FishMotionV10',
 'frozenGLBSHA256':'da142f131196b195ee909287ffc5ae8b6c84edc24470fd14476d6d9f91bb1afa',
 'files':ledger,'references':references,'externalOpus':{'run':'work/opus-runs/fish-motion-f544594a0597423f9c77f084168294e3',
 'status':'failed total_timeout; incomplete response not integrated','requestedModel':'claude-opus-5-5',
 'actualAcceptedCode':'None; bounded request preserved for diagnosis; no provider fallback'},
 'license':'Original user project output; no third-party media used; see LICENSE.txt',
 'visualQa':'research/qa/fish-v10.md','rigQa':'research/qa/fish-v10.json'}
(folder/'provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files':len(ledger),'references':[{'url':r['url'],'status':r['status']} for r in references]},ensure_ascii=False))
