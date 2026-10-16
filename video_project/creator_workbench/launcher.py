"""Source entry and bundled Windows EXE entry. No API credentials are packaged."""
from __future__ import annotations
import argparse,json,os,sys,webbrowser,threading,traceback
from pathlib import Path
from urllib.request import urlopen
from runtime_loader import ReloadController,resource_root

def main():
 p=argparse.ArgumentParser();p.add_argument('--video-root',type=Path);p.add_argument('--port',type=int,default=0);p.add_argument('--no-browser',action='store_true');p.add_argument('--no-reuse',action='store_true');args=p.parse_args()
 bundled=Path(getattr(sys,'_MEIPASS',Path(__file__).parent)).resolve()
 location=Path(sys.executable).parent if getattr(sys,'frozen',False) else Path(__file__).parent
 candidates=[location,*location.parents]
 video=args.video_root or (Path(os.environ['RAINBOW_VIDEO_ROOT']).expanduser() if os.environ.get('RAINBOW_VIDEO_ROOT') else next((x for x in candidates if x.name=='video_project'),location.parent/'video_project'))
 if not video.is_dir():raise RuntimeError('未找到video_project；请用 --video-root 指定工程根目录')
 resource,mode=resource_root(video,bundled)
 state=video/'creator_workbench'/'work';state.mkdir(parents=True,exist_ok=True);runtime=state/'runtime.json'
 if not args.no_reuse and runtime.exists():
  try:
   saved=json.loads(runtime.read_text(encoding='utf8'));port=int(saved['port']);url=f'http://127.0.0.1:{port}'
   if json.loads(urlopen(url+'/health',timeout=2).read())['app']=='rainbow-creator-workbench':
    if not args.no_browser:webbrowser.open(url+'/?launch='+saved['token'])
    if sys.stdout:print('Workbench already running:',url,flush=True)
    return
  except Exception:pass
 controller=ReloadController(video,state,resource,mode);app=controller.app;server=controller.bind(args.port);port=server.server_port;url=f'http://127.0.0.1:{port}'
 runtime.write_text(json.dumps({'pid':os.getpid(),'port':port,'token':app.token,'videoRoot':str(video.resolve()),'resourceRoot':str(resource),'sourceMode':mode,'version':'1.1.0'},ensure_ascii=False),encoding='utf8')
 if sys.stdout:print('WORKBENCH_READY '+url,flush=True)
 if not args.no_browser:threading.Timer(.6,lambda:webbrowser.open(url+'/?launch='+app.token)).start()
 try:server.serve_forever(poll_interval=.5)
 except KeyboardInterrupt:pass
 finally:
  server.server_close()
  try:
   saved=json.loads(runtime.read_text(encoding='utf8'))
   if saved.get('pid')==os.getpid():runtime.unlink()
  except (OSError,ValueError):pass

if __name__=='__main__':
 try:main()
 except Exception as error:
  if sys.stderr:traceback.print_exc()
  if getattr(sys,'frozen',False):
   import ctypes
   ctypes.windll.user32.MessageBoxW(0,str(error),'rainbow鱼 · 工作台启动失败',0x10)
  raise SystemExit(1)
