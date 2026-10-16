from pathlib import Path
p=Path('src/v16/PartsInventoryV16.ts');s=Path('src/PartsInventory.ts').read_text(encoding='utf-8-sig').replace("from './","from '../")
s=s.replace("const spread=role==='core' ? .24 :","const spread=role==='core' ? .32 :").replace("? .42 :","? .95 :").replace("? .62 :","? 1.15 :").replace("? .52 :","? 1.02 :").replace("? .34 : .20;","? 1.85 : .28;")
s=s.replace('A restrained radial fan','A role-ordered cinematic radial fan')
p.write_text(s,encoding='utf-8')
p=Path('src/v16/WorldV16.ts');s=p.read_text(encoding='utf-8').replace("from '../PartsInventory'","from './PartsInventoryV16'");p.write_text(s,encoding='utf-8')
