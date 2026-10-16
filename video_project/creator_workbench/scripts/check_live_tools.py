"""One bounded actual file-tool round trip per configured API, isolated from video projects."""
import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.providers import ProviderManager
from app.harness import RunManager
ROOT=Path(__file__).resolve().parents[1]
class FixtureLibrary:
 def __init__(self,folder):self.folder=folder
 def project(self,ident):return {'id':'fixture','name':'工作台工具验收','path':str(self.folder)}
 def snapshot(self,**kwargs):return {'skills':[],'tools':[],'projects':[self.project('fixture')]}
 def media(self,ident):return []
reports=[]
for provider in ('openai','claude'):
 folder=ROOT/'work/live-tools'/provider;folder.mkdir(parents=True,exist_ok=True)
 (folder/'input.txt').write_text('RAINBOW_HARNESS_INPUT_42',encoding='utf8')
 manager=RunManager(FixtureLibrary(folder),ProviderManager(),ROOT/'work/live-tools-state'/provider,ROOT/'work/live-tools-resources')
 response=manager.start({'projectId':'fixture','provider':provider,'mode':'creative','prompt':'这是本机工作台工具验收。只读取 input.txt，再通过 write_file 把读取的原文一字不差写到 output/result.txt。不要调用run_process，不要搜索其他位置，不要自行添加文字。最后只回复 WORKBENCH_TOOL_OK。'})
 ident=response['id'];deadline=time.monotonic()+150
 while time.monotonic()<deadline:
  run=manager.get(ident)
  if run['status'] not in {'queued','running','cancelling'}:break
  time.sleep(.3)
 else:manager.stop(ident);run=manager.get(ident)
 output=folder/'output/result.txt'
 record={'provider':provider,'status':run['status'],'passed':run['status']=='completed' and output.exists() and output.read_text(encoding='utf8')=='RAINBOW_HARNESS_INPUT_42',
 'tools':[e.get('tool') for e in run['events'] if e['type']=='tool'],'returnedModels':[u['model'] for u in run['usage']],'changedFiles':len(run['changedFiles']),'runId':ident,'response':run.get('response','')}
 reports.append(record);print(json.dumps(record,ensure_ascii=True),flush=True)
(ROOT/'work/live-tools-report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
