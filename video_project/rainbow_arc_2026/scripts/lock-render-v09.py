"""Explicitly freeze actual V09 render dependencies; dry-run is the default."""
import argparse,json,datetime
from pathlib import Path
from v09_inventory import ROOT,VERSION,COMPOSITION,runtime_files,qwen_slugs,immutable_record
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--write',action='store_true',help='Root confirms sources frozen; create one new V09 source lock')
p.add_argument('--replace',action='store_true',help='Explicitly replace a pre-render V09 source lock; never use while rendering');a=p.parse_args()
records={relative:immutable_record(relative) for relative in runtime_files()}
out=ROOT/'research/qa/render-source-lock-v09.json'
report={'schema':'rainbow.v09.render-source-lock/1','version':VERSION,'composition':COMPOSITION,'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':records,'actualQwenSlugs':qwen_slugs(),'runtimeOnly':True,'nodeModulesExcluded':True,'hardLinksReadOnly':True,'gltfExternalDependenciesChecked':True}
if a.write:
    if out.exists() and not a.replace:raise RuntimeError('V09 lock already exists; explicit --replace required before a new render')
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps({'write':a.write,'version':VERSION,'files':len(records),'bytes':sum(x['bytes'] for x in records.values()),'actualQwenSlugs':qwen_slugs(),'lock':str(out) if a.write else None},ensure_ascii=False,indent=2))
