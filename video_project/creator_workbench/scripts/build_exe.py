"""Build the self-contained local server/launcher; never package runtime state."""
from pathlib import Path
import argparse,hashlib,json,os,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Build a launcher with current application artwork. External source updates still need only refresh.')
parser.add_argument('--dist-dir',type=Path,default=ROOT/'output',help='Output directory relative to the workbench or an absolute path. Use work/release-v2.2 for staging.')
args=parser.parse_args()
dist=(args.dist_dir if args.dist_dir.is_absolute() else ROOT/args.dist_dir).resolve()
dist.mkdir(parents=True,exist_ok=True)
icon=ROOT/'web/assets/editor-icon.ico'
if not icon.is_file():raise FileNotFoundError('Run scripts/generate_editor_brand.py first.')

def sha(path):
 with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
env=os.environ.copy();env['PYTHONPATH']=str(ROOT/'work/builddeps')
cmd=[sys.executable,'-m','PyInstaller','--noconfirm','--onefile','--windowed','--noupx','--name','RainbowVideoWorkbench',
 '--hidden-import','sqlite3',
 '--icon',str(icon),
 '--distpath',str(dist),'--workpath',str(ROOT/'work/pyinstaller'),'--specpath',str(ROOT/'work'),
 '--paths',str(ROOT),'--add-data',str(ROOT/'web')+os.pathsep+'web','--add-data',str(ROOT/'skills')+os.pathsep+'skills',
 '--add-data',str(ROOT/'docs')+os.pathsep+'docs',str(ROOT/'launcher.py')]
subprocess.run(cmd,cwd=ROOT,env=env,check=True)
exe=dist/'RainbowVideoWorkbench.exe'
snapshot={}
for folder in ('app','web','skills','docs'):
 for path in sorted((ROOT/folder).rglob('*')):
  if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc':snapshot[path.relative_to(ROOT).as_posix()]=sha(path)
version=re.search(r"^VERSION\s*=\s*['\"]([^'\"]+)",(ROOT/'app/server.py').read_text(encoding='utf8'),re.MULTILINE).group(1)
report={'name':exe.name,'version':version,'bytes':exe.stat().st_size,'sha256':sha(exe),
 'icon':{'path':icon.relative_to(ROOT).as_posix(),'sha256':sha(icon),'sizes':[16,24,32,48,64,128,256]},'sourceSnapshot':snapshot,
 'runtime':'Stable Python launcher; external app/web/skills/docs preferred, bundled fallback available','packaged':['launcher.py','runtime_loader.py','fallback app Python modules','fallback web','fallback skills','fallback docs'],
 'refreshUpdates':['video_project/creator_workbench/app','video_project/creator_workbench/web','video_project/creator_workbench/skills','video projects and media'],
 'excluded':['work/runtime.json','API credentials','runs','private voice','video assets','model weights'],'signed':False}
(dist/'build-manifest.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='sourceSnapshot'},indent=2))
