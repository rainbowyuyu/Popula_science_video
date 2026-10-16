"""Remove verified, reproducible cache files belonging only to this episode."""
from pathlib import Path
import argparse,hashlib,json,os,shutil,stat,subprocess,winreg
ROOT=Path(__file__).resolve().parents[1]
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()
def verified_path(p):
    p=p.absolute()
    if not p.resolve().is_relative_to(ROOT.resolve()) or p.resolve()==ROOT.resolve():raise RuntimeError('Path escapes this film project')
    for x in [p,*p.parents]:
        if x==ROOT.parent:break
        if x.exists() and getattr(x.lstat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT:raise RuntimeError('Reparse point: '+str(x))
    if p.is_dir():
        for x in p.rglob('*'):
            if x.name=='.git' or getattr(x.lstat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT:raise RuntimeError('Nested repository or link: '+str(x))
    return p
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    qa=json.loads((ROOT/'research/metro/final-media-qa.json').read_text('utf-8-sig'))
    if not qa.get('automatedChecksPassed'):raise RuntimeError('Final media checks must pass first')
    film=ROOT/'output/metro/metro_safety_1080p.mp4';archive=ROOT/'delivery/metro/source-snapshot.zip'
    if digest(film)!=qa['videoSha256'] or not archive.is_file():raise RuntimeError('Verified movie or source snapshot missing')
    manifest=json.loads((ROOT/'delivery/metro/manifest.json').read_text('utf-8'))
    delivered=ROOT/'delivery/metro/地铁进站为什么要站在安全线后_1080p.mp4'
    if manifest['filmSha256']!=digest(film) or not delivered.is_file() or digest(delivered)!=manifest['filmSha256']:raise RuntimeError('Delivery mismatch')
    candidates=[ROOT/p for p in ['tmp/metro','tmp/metro-audit','tmp/metro-audit-details','tmp/metro-audit-final','tmp/metro-export','public/metro/premaster.wav','output/metro/qa-final/transition-excerpts']]
    candidates += list((ROOT/'output/metro').glob('frame-*.jpg'))+list((ROOT/'output/metro').glob('gpu-*.jpg'))+list((ROOT/'output/metro').glob('gpu-benchmark*.mp4'))
    candidates += [ROOT/'output/metro/segment-6339-7087.mp4']
    candidates=[verified_path(p) for p in candidates if p.exists()]
    items=[]
    for p in candidates:
        size=sum(x.stat().st_size for x in p.rglob('*') if x.is_file()) if p.is_dir() else p.stat().st_size
        items.append({'path':str(p),'bytes':size,'reason':'Episode-specific reproducible intermediate; final evidence and inputs retained'})
    plan={'verifiedVideoSHA256':qa['videoSha256'],'items':items,'plannedBytes':sum(i['bytes'] for i in items),'applied':False}
    report=ROOT/'research/metro/cleanup-report.json';report.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    if not args.apply:print(json.dumps({'filesOrDirectories':len(items),'bytes':plan['plannedBytes']}));return
    # A task-local runtime may have been used to select the discrete GPU.
    runtime=ROOT/'tmp/metro/gpu-runtime.json'
    gpu_exe=None
    if runtime.exists():gpu_exe=json.loads(runtime.read_text('utf-8-sig'))['exe']
    proc_cmd="Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress"
    proc=subprocess.run(['powershell','-NoProfile','-Command',proc_cmd],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True)
    for p in json.loads(proc.stdout or '[]'):
        exe=p.get('ExecutablePath') or ''
        if exe and str(ROOT/'tmp/metro').lower().replace('/','\\') in exe.lower().replace('/','\\'):raise RuntimeError('Task browser still running; no caches removed')
    if gpu_exe:
        # Python and PowerShell can use different registry views. Inspect both
        # and enumerate the exact normalized task executable name; a failed
        # lookup alone is not proof that the preference has been removed.
        expected=os.path.normcase(os.path.normpath(gpu_exe))
        for view in {winreg.KEY_WOW64_64KEY,winreg.KEY_WOW64_32KEY}:
            try:
                key=winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\DirectX\UserGpuPreferences',0,winreg.KEY_QUERY_VALUE|winreg.KEY_SET_VALUE|view)
            except FileNotFoundError:continue
            with key:
                matches=[]
                for idx in range(winreg.QueryInfoKey(key)[1]):
                    name,value,_=winreg.EnumValue(key,idx)
                    if os.path.normcase(os.path.normpath(name))==expected:
                        if value!='GpuPreference=2;':raise RuntimeError('Task GPU preference changed externally; preserving it')
                        matches.append(name)
                for name in matches:winreg.DeleteValue(key,name)
                for idx in range(winreg.QueryInfoKey(key)[1]):
                    name,_,_=winreg.EnumValue(key,idx)
                    if os.path.normcase(os.path.normpath(name))==expected:raise RuntimeError('Task GPU preference still exists')
    deleted=[]
    for p in candidates:
        if p.is_dir():shutil.rmtree(p)
        else:p.unlink()
        deleted.append(str(p))
    plan.update(applied=True,deleted=deleted,freedBytes=plan['plannedBytes'],taskGPUPreferenceRemoved=bool(gpu_exe),videoSHA256After=digest(film))
    if plan['videoSHA256After']!=qa['videoSha256']:raise RuntimeError('Movie changed during cleanup')
    for rel in ['src/metro/World.ts','src/metro/Film.tsx','public/metro/master.wav','public/metro/physics/flow.json','public/metro/timeline.json','scripts/render_metro.mjs']:
        if not (ROOT/rel).is_file():raise RuntimeError('Protected dependency missing: '+rel)
    report.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    shutil.copy2(report,ROOT/'delivery/metro/research/metro/cleanup-report.json')
    print(json.dumps({'applied':True,'freedBytes':plan['freedBytes'],'movieUnchanged':True}))
if __name__=='__main__':main()
