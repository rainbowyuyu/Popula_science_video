"""Deterministic uncoated-stock scan overlay for the original coda paper page."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/textures'
rng=np.random.default_rng(20261015)
n=768
# Low-contrast fibres stay subordinate to the scanned printed page.
fine=rng.normal(0,.42,(n,n))
coarse=Image.fromarray(np.uint8(np.clip(128+rng.normal(0,10,(96,96)),0,255)))
coarse=coarse.resize((n,n),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(2))
grain=fine+(np.asarray(coarse,dtype=float)-128)*.10
rgb=np.array([250,249,245])+grain[:,:,None]
p=OUT/'paper-uncoated.png';Image.fromarray(np.uint8(np.clip(rgb,0,255)),'RGB').save(p)
(ROOT/'docs/paper-finish-asset.json').write_text(json.dumps({'file':'public/textures/paper-uncoated.png','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source':'Original deterministic procedural fibre overlay','seed':20261015,'license':'Original project asset','purpose':'Subtle coda paper surface; original paper scan remains unaltered'},indent=2),encoding='utf8')
print(p)
