"""Read-only post-write validator; no OpenSees execution."""
import argparse,json
from pathlib import Path
from map_cfd_layers import read,validate_mapped,PROJECT

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source-graph',type=Path,default=PROJECT/'public/physics/structural-graph.json')
p.add_argument('--mapped-graph',type=Path,required=True)
p.add_argument('--qa',type=Path,required=True)
a=p.parse_args()
print(json.dumps(validate_mapped(read(a.source_graph),read(a.mapped_graph),read(a.qa)),indent=2))
