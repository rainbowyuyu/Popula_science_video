"""Isolated execution of frozen teaching models. Never writes production inputs."""
from pathlib import Path
import argparse, datetime, hashlib, importlib, json, runpy, shutil, sys, traceback

HERE=Path(__file__).resolve().parent
PROJECT=HERE.parents[2]
FROZEN=HERE/'frozen-project'
RESULTS=Path('C:/Users/zju/.codex/visualizations/2026/10/08/01a11ae1-4ffb-79e2-b2fc-3add8874f339/shanghai-physics-v8')

def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def save(p,x):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf8')
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def production():
    paths=sorted((PROJECT/'public/physics').glob('*.json'))
    paths+=sorted((PROJECT/'public/models').glob('*.json'))
    return {str(p.relative_to(PROJECT)):dict(sha256=sha(p),bytes=p.stat().st_size) for p in paths}
def prepare():
    if (HERE/'input-manifest.json').exists():raise RuntimeError('Inputs already frozen; do not replace')
    inputs=[*sorted((PROJECT/'scripts/physics').glob('*.py')),
       *sorted((PROJECT/'research/physics-v7/pile').glob('*.py')),
       PROJECT/'public/models/shanghai-tower-manifest.json',
       PROJECT/'research/model-source-parameters.json',PROJECT/'research/structural/zhu2012-http.pdf']
    records=[]
    for p in inputs:
        rel=p.relative_to(PROJECT);dest=FROZEN/rel
        dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
        records.append(dict(source=str(p),frozen=str(dest.relative_to(HERE)),sha256=sha(dest),bytes=dest.stat().st_size))
    backend=Path('D:/python_project/os2zwind/bin/opensees.pyd')
    wrapper=Path('D:/python_project/os2zwind/zwind/__init__.py')
    save(HERE/'input-manifest.json',dict(createdUTC=utc(),inputs=records,productionBefore=production(),
       backend={str(p):sha(p) for p in [backend,wrapper]},
       scope='Frozen educational equivalent model, not official/as-built Shanghai Tower FE model. Separate pile and prescribed tower gust; no CFD coupling or learned inversion.'))
    print('FROZEN',len(records),'files',flush=True)
def check_inputs():
    d=json.loads((HERE/'input-manifest.json').read_text('utf8'))
    assert all(sha(HERE/x['frozen'])==x['sha256'] for x in d['inputs'])
    assert all(sha(p)==h for p,h in d['backend'].items())
    return d
def execute(phase):
    manifest=check_inputs()
    sys.path.insert(0,str(FROZEN/'scripts/physics'))
    tower=importlib.import_module('run_zwind')
    tower.OUT=RESULTS/'tower';tower.RAW=tower.OUT/'raw'
    if phase=='tower':
        sys.argv=['run_zwind.py','--duration','60'];tower.main()
    elif phase=='environment':
        env=importlib.import_module('run_environment');env.OUT=tower.OUT;env.RAW=tower.RAW/'environment'
        sys.argv=['run_environment.py'];env.main()
        qa=importlib.import_module('qa_environment');qa.OUT=tower.OUT;qa.main()
    elif phase in ['pile','pilefine']:
        sys.path.insert(0,str(FROZEN/'research/physics-v7/pile'))
        pile=importlib.import_module('solve_pile');pile.OUT=RESULTS/'pile';pile.OUT.mkdir(parents=True,exist_ok=True)
        if phase=='pile':pile.main()
        else:runpy.run_path(str(FROZEN/'research/physics-v7/pile/verify_fine_clock.py'),run_name='__main__')
    after=production()
    assert after==manifest['productionBefore'],'Production inputs changed externally; review before accepting run'
    save(HERE/'logs'/f'{phase}-status.json',dict(phase=phase,finishedUTC=utc(),passed=True,
        productionInputsUnchanged=True,frozenInputsUnchanged=True,python=sys.version))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['prepare','tower','environment','pile','pilefine']);args=parser.parse_args()
    (HERE/'logs').mkdir(parents=True,exist_ok=True)
    if args.phase=='prepare':prepare()
    else:
        print('START',args.phase,utc(),flush=True)
        try:execute(args.phase)
        except BaseException:
            save(HERE/'logs'/f'{args.phase}-status.json',dict(phase=args.phase,finishedUTC=utc(),passed=False,error=traceback.format_exc()))
            raise
