"""Render each chapter, preserving narration timing; reruns skip complete clips."""
from pathlib import Path
import json, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
timeline=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf-8'))
for c in timeline['chapters']:
    name=f'Chapter{c["id"]:02d}'; dst=ROOT/'public'/c['clip']
    if dst.exists():
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(dst)],text=True))
        if abs(duration-c['frames']/timeline['fps'])<.12:
            print('SKIP',name,flush=True); continue
    log=ROOT/f'output/{name}.log'
    with log.open('w',encoding='utf-8') as f:
        result=subprocess.run([sys.executable,'-m','manim','render',str(ROOT/'manim/scenes.py'),name,'-r','1600,800','--fps','30','--media_dir',str(ROOT/'media'),'--disable_caching','--verbosity','WARNING'],cwd=ROOT,stdout=f,stderr=subprocess.STDOUT)
    if result.returncode:
        print(log.read_text(encoding='utf-8')[-8000:],flush=True); raise SystemExit(result.returncode)
    files=list((ROOT/'media/videos/scenes').glob(f'*/{name}.mp4'))
    if not files:raise RuntimeError(f'No rendered clip for {name}')
    shutil.copy2(files[0],dst)
    print('DONE',name,dst.stat().st_size,flush=True)
