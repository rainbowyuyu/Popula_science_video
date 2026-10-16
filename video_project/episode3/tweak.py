from pathlib import Path
p=Path('assembly_episode3.py');s=p.read_text(encoding='utf8');s=s.replace("default_value=.35","default_value=.8").replace("[((-4,7,5),1100,5,(1,.73,.48)),((5,4,1),700,4,(.55,.72,1)),((0,8,-4),500,3,(1,.88,.7))]","[((-4,10,12),3200,7,(1,.73,.48)),((8,7,8),2600,6,(.55,.72,1)),((0,14,-4),1800,5,(1,.88,.7))]");p.write_text(s)

