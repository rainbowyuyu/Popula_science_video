"""Run one isolated SU2 trial, preserving command, executable hash and exit state."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,subprocess,sys,time
HERE=Path(__file__).resolve().parent

def main():
    p=argparse.ArgumentParser();p.add_argument('--case',type=Path,required=True);p.add_argument('--threads',type=int,default=2);a=p.parse_args()
    case=a.case.resolve()
    if not case.is_relative_to(HERE) or not 1<=a.threads<=4:raise ValueError('Isolated case and 1..4 threads required')
    exe=HERE.parent/'su2-v8.5.0/runtime/bin/SU2_CFD.exe'
    command=[str(exe),'-t',str(a.threads),'rans.cfg']
    meta={'schema':'rainbow.su2-candidate-run/1','case':str(case),'command':command,'threads':a.threads,'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executableSHA256':hashlib.sha256(exe.read_bytes()).hexdigest(),'acceptedForCoupling':False,'status':'starting'}
    env=dict(os.environ);env.update(OMP_NUM_THREADS=str(a.threads),OMP_DYNAMIC='FALSE',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1')
    with (case/'run.log').open('wb') as log:
        process=subprocess.Popen(command,cwd=case,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        meta.update(pid=process.pid,status='running');(case/'run-state.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta),flush=True)
        code=process.wait()
    meta.update(status='executable-completed' if code==0 else 'executable-failed',exitCode=code,finishedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat())
    (case/'run-state.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta),flush=True)
    if code:raise SystemExit(code if code<256 else 1)

if __name__=='__main__':main()
