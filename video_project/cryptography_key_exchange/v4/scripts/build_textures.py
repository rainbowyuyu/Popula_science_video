"""PBR originals + a CC0 photographically captured wood material for Crypto V3."""
from pathlib import Path
import hashlib, json, urllib.request, numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/textures'
OUT.mkdir(parents=True, exist_ok=True)
SEED = 20261014
rng = np.random.default_rng(SEED)
records=[]
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'rainbow-video-research/1.0'}),timeout=90).read()
files=json.loads(fetch('https://api.polyhaven.com/files/white_oak_veneer'))
info=json.loads(fetch('https://api.polyhaven.com/info/white_oak_veneer'))
for key, local, fmt in [('Diffuse','oak_color.jpg','jpg'),('Rough','oak_rough.jpg','jpg'),('nor_gl','oak_normal.jpg','jpg')]:
    rec=files[key]['2k'][fmt]
    existing=OUT/local
    data=existing.read_bytes() if existing.exists() and hashlib.md5(existing.read_bytes()).hexdigest()==rec['md5'] else fetch(rec['url'])
    assert hashlib.md5(data).hexdigest()==rec['md5']
    (OUT/local).write_bytes(data)
    records.append(dict(id=local,url=rec['url'],author=info['authors'],license='CC0-1.0',licenseURL='https://polyhaven.com/license',sha256=hashlib.sha256(data).hexdigest(),use='Table material',source='Poly Haven white_oak_veneer 2k'))

N=1024
y,x=np.mgrid[0:N,0:N]/N
grain=rng.normal(0,1,(N,N))
def img(name,a):
    Image.fromarray(np.uint8(np.clip(a,0,255))).save(OUT/name)
    records.append(dict(id=name,author='rainbow鱼 / original procedural texture',license='Original project asset',seed=SEED,sha256=hashlib.sha256((OUT/name).read_bytes()).hexdigest()))

# Microtextures have subtle real-scale amplitude, not large decorative noise.
img('ceramic_rough.png',np.clip(90+grain*3,0,255))
img('ceramic_normal.png',np.stack([128+grain*1.1,128+np.roll(grain,1,0)*1.1,np.ones((N,N))*254],axis=2))
brushed=np.repeat(rng.normal(0,1,(N,1)),N,axis=1)
img('metal_rough.png',108+brushed*3+grain*.7)
img('metal_normal.png',np.stack([128+grain*.3,128+brushed*.4,np.ones((N,N))*254],axis=2))
img('plastic_rough.png',150+grain*4)

# Coffee with milk swirled into a heart: a physical-scale top surface, no text.
rr=np.sqrt((x-.5)**2+(y-.5)**2)
base=np.zeros((N,N,3),float)
noise=grain*1.2+np.sin(x*55+y*20)*1.4
base[:,:,0]=100+noise+rr*15
base[:,:,1]=54+noise*.6+rr*9
base[:,:,2]=27+noise*.4+rr*4
crema=np.exp(-((rr-.455)/.012)**2)
base+=crema[:,:,None]*np.array([42,30,16])
X=(x-.5)*3.8;Y=(y-.51)*3.8
heart=((X*X+Y*Y-0.17)**3-X*X*Y**3)<0
heart &= rr<.42
cream=np.stack([np.ones_like(x)*228+noise,np.ones_like(x)*210+noise,np.ones_like(x)*174+noise],2)
base[heart]=cream[heart]
for k in range(4):
    arc=np.exp(-((np.sqrt((x-.5)**2+(y-.58-k*.018)**2)-(.10+k*.045))/.005)**2)
    base+=arc[:,:,None]*np.array([8,7,4])*(1-heart[:,:,None])
img('coffee_color.jpg',base)
img('coffee_rough.png',np.ones((N,N))*65+grain*1.5)

# A neutral demo chat surface. The film replaces this Screen texture dynamically.
im=Image.new('RGB',(900,1800),'#eef4f2');d=ImageDraw.Draw(im)
d.rounded_rectangle((40,245,860,430),radius=60,fill='#ffffff')
d.rounded_rectangle((170,510,860,800),radius=60,fill='#a5d7c7')
d.rounded_rectangle((40,875,650,1050),radius=60,fill='#ffffff')
d.rounded_rectangle((40,1570,860,1710),radius=65,fill='#ffffff')
d.ellipse((720,1590,820,1690),fill='#277d72')
im.save(OUT/'screen_placeholder.png')
records.append(dict(id='screen_placeholder.png',author='rainbow鱼 / original vector raster',license='Original project asset',purpose='No readable text; film replaces with CanvasTexture',sha256=hashlib.sha256((OUT/'screen_placeholder.png').read_bytes()).hexdigest()))
(ROOT/'docs/models-textures.json').write_text(json.dumps(dict(version=3,date='2026-10-14',records=records),ensure_ascii=False,indent=2),encoding='utf8')
print('Texture set created',len(records))
