from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

R=Path(__file__).resolve().parents[1]
p=R/'public/generated'
im=Image.open(p/'bridge-last.png').convert('RGB')
a=np.asarray(im).astype(np.float32)
mask=((a[:,:,2]-a[:,:,0])>20)&((a[:,:,1]-a[:,:,0])>20)&(a[:,:,0]<125)
gray=np.asarray(im.convert('L').filter(ImageFilter.FIND_EDGES)).astype(np.float32)
m=Image.fromarray((mask*255).astype('uint8'))
outer=np.asarray(m.filter(ImageFilter.MaxFilter(5))).astype(float)/255
inner=np.asarray(m.filter(ImageFilter.MinFilter(3))).astype(float)/255
edges=np.maximum(outer-inner,np.clip(gray/100,0,1)*mask*.40)
paper=np.zeros_like(a)+np.array([244,247,249])
blue=np.array([23,87,142])
paper=paper*(1-edges[:,:,None]*.86)+blue*(edges[:,:,None]*.86)
# Subtle coordinate grid stays below the silhouette, without invented dimensions.
for x in range(0,im.width,64):paper[:,x,:]=paper[:,x,:]*.94+blue*.06
for y in range(0,im.height,64):paper[y,:,:]=paper[y,:,:]*.94+blue*.06
Image.fromarray(np.clip(paper,0,255).astype('uint8')).save(p/'bridge-first.png')
print(p/'bridge-first.png')
