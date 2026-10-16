"""Render the frozen reviewed frame ranges and retain an independent marker for each."""
from pathlib import Path
import hashlib,json,re,subprocess

ROOT=Path(__file__).resolve().parents[1]
PLAN=ROOT/'research/revision-v4/patches/patch-plan.json'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    plan_hash=sha(PLAN);plan=json.loads(PLAN.read_text(encoding='utf8'))
    source_hashes={k:v for patch in plan['patches'] for k,v in patch['sourceHashes'].items()}
    def unchanged():
        assert sha(PLAN)==plan_hash,'Patch plan changed during rendering'
        assert sha(ROOT/'src/timeline.json')==plan['timelineSHA256']
        assert sha(ROOT/'public/master.wav')==plan['masterSHA256']
        for path,value in source_hashes.items():assert sha(ROOT/path)==value,'Source changed: '+path
    unchanged()
    subprocess.run(['node',str(ROOT/'node_modules/typescript/bin/tsc'),'--noEmit'],cwd=ROOT,check=True)
    for index,patch in enumerate(plan['patches'],1):
        unchanged();start,end=patch['start'],patch['end']
        print(f'PATCH {index}/{len(plan["patches"])} | {start}-{end}',flush=True)
        command=['node','scripts/render.mjs','--concurrency=3','--silent',f'--frames={start}-{end}']
        process=subprocess.Popen(command,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf8',errors='replace')
        try:
            for line in process.stdout:
                match=re.fullmatch(r'Render (\d+)%\s*',line)
                if not match or int(match[1])%10==0:print(line.rstrip(),flush=True)
            assert process.wait()==0,'Patch render failed'
        except BaseException:
            if process.poll() is None:process.terminate();process.wait(timeout=20)
            raise
        unchanged()
        marker_file=ROOT/'tmp/segment-render.json';marker=json.loads(marker_file.read_text(encoding='utf8'))
        assert marker['success'] and marker['frames']==[start,end]
        assert marker['timelineSHA256']==plan['timelineSHA256'] and marker['masterSHA256']==plan['masterSHA256']
        assert marker['videoSHA256']==sha(ROOT/patch['video'])
        (ROOT/patch['marker']).write_bytes(marker_file.read_bytes())
        print(f'PATCH {index} COMPLETE | {marker["videoSHA256"]}',flush=True)
    print('ALL REVIEWED PATCHES RENDERED',flush=True)

if __name__=='__main__':main()
