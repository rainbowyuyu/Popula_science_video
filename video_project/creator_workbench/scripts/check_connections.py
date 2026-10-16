"""Explicit, bounded live API checks. Never auto-run at application startup."""
import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.providers import ProviderManager
root=Path(__file__).resolve().parents[1];provider=ProviderManager();reports=[]
for ident in ('openai','claude'):
 start=time.monotonic()
 try:
  r=provider.complete(ident,[{'role':'user','content':'Reply exactly WORKBENCH_OK. No explanation, no tools.'}],max_tokens=256,temperature=.1,timeout=70)
  reports.append({'provider':ident,'ok':r['text'].strip()=='WORKBENCH_OK','model':r['model'],'stopReason':r['stop_reason'],'usage':r['usage'],'elapsedSeconds':round(time.monotonic()-start,2)})
 except Exception as e:reports.append({'provider':ident,'ok':False,'error':str(e),'elapsedSeconds':round(time.monotonic()-start,2)})
 print(json.dumps(reports[-1],ensure_ascii=True),flush=True)
(root/'work/connection-checks.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
