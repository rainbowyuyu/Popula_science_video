"""Four V08 cover compositions: photographed rainbow + V08 Cycles water + Snell rays.
Original source is preserved. Exact title/logo are composed after imagery.
"""
from pathlib import Path
import json,math,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageEnhance,ImageCms

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery/covers_v08';OUT.mkdir(parents=True,exist_ok=True)
PHOTO=ROOT/'public/sources/commons-complete-double-rainbow-lupuslupus26.jpg'
GLASS=ROOT/'public/assets_v08/covers/cover_glass_sheen_v08.png'
LOGO=ROOT/'public/brand/logo.png'
FONT=Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
INK=(24,52,61);SERIES='每天5分钟·彩虹';TITLE='彩虹为什么是弧形？'
ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
LAYOUTS={
 '16x9':{'size':[1920,1080],'title_xy':[88,360],'title_size':150,'leading':181,'title_lines':['彩虹为什么','是弧形？'],'pill':[88,230,48],'photo':[2320,160,86],'drop':[1450,740,755]},
 '4x3':{'size':[1920,1440],'title_xy':[104,360],'title_size':160,'leading':197,'title_lines':['彩虹为什么','是弧形？'],'pill':[104,232,60],'photo':[2520,-48,316],'drop':[1420,1050,950]},
 '3x4':{'size':[1440,1920],'title_xy':[96,358],'title_size':162,'leading':204,'title_lines':['彩虹为什么','是弧形？'],'pill':[96,236,61],'photo':[2460,-548,685],'drop':[865,1450,1040]},
 '9x16':{'size':[1080,1920],'title_xy':[72,334],'title_size':139,'leading':172,'title_lines':['彩虹为什么','是弧形？'],'pill':[72,218,48],'photo':[2370,-648,628],'drop':[620,1410,870]},
}

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def font(size,weight=700):
 f=ImageFont.truetype(str(FONT),round(size))
 f.set_variation_by_axes([weight])
 return f
def ink(draw,xy,text,f,colour):
 b=draw.textbbox((0,0),text,font=f)
 draw.text((xy[0]-b[0],xy[1]-b[1]),text,font=f,fill=colour)
 return [round(xy[0]),round(xy[1]),round(xy[0]+b[2]-b[0]),round(xy[1]+b[3]-b[1])]

def base(cfg):
 w,h=cfg['size'];width,x,y=cfg['photo'];photo=Image.open(PHOTO).convert('RGB')
 photo=ImageEnhance.Color(photo).enhance(1.10)
 photo=ImageEnhance.Contrast(photo).enhance(1.015)
 photo=photo.resize((width,round(width*photo.height/photo.width)),Image.Resampling.LANCZOS)
 # Background is slightly defocused; the near water sphere stays crisp.
 photo=photo.filter(ImageFilter.GaussianBlur(max(.45,w/2350)))
 edge=photo.crop((0,0,photo.width,150)).resize((w,h),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(60))
 edge=Image.blend(edge,Image.new('RGB',(w,h),(242,247,244)),.52)
 bg=edge.convert('RGBA')
 photo=photo.convert('RGBA');mask=Image.new('L',photo.size,255);md=ImageDraw.Draw(mask)
 for row in range(min(180,photo.height)):
  t=row/180;md.line((0,row,photo.width,row),fill=round(255*t*t*(3-2*t)))
 for row in range(max(0,photo.height-180),photo.height):
  t=(photo.height-1-row)/180;md.line((0,row,photo.width,row),fill=round(255*t*t*(3-2*t)))
 # Blend the inserted photographic sky without a visible plate edge.
 photo.putalpha(mask);bg.alpha_composite(photo,(x,y))
 yy,xx=np.mgrid[0:h,0:w]
 # Atmosphere rather than a text panel: graduated pearl light leaves the arc
 # and forest clear while protecting large type in a shared scene.
 top=np.clip((h*.48-yy)/(h*.29),0,1)
 left=np.clip((w*.60-xx)/(w*.27),0,1) if w>h else np.zeros((h,w))
 a=np.maximum(top*.86,left*.95)
 veil=np.zeros((h,w,4),np.uint8);veil[:,:,:3]=(244,249,247);veil[:,:,3]=(a*255).astype('uint8')
 bg.alpha_composite(Image.fromarray(veil))
 # Lift the far meadow into mist so the sphere floats in rain, not on a card.
 ground=np.clip((yy-h*.68)/(h*.30),0,1)*.34
 veil[:,:,3]=(ground*255).astype('uint8');veil[:,:,:3]=(228,239,235)
 bg.alpha_composite(Image.fromarray(veil))
 return bg

def refract(d,n,n1,n2):
 d=np.asarray(d,float);n=np.asarray(n,float);c=-np.dot(d,n)
 if c<0:n=-n;c=-c
 eta=n1/n2
 return eta*d+(eta*c-math.sqrt(max(0,1-eta*eta*(1-c*c))))*n
def path(ior,b=.8620714385305106):
 entry=np.array([-math.sqrt(1-b*b),b]);inside=refract([1,0],entry,1.0003,ior)
 reflected=entry-2*np.dot(entry,inside)*inside
 back=inside-2*np.dot(inside,reflected)*reflected
 exit=reflected-2*np.dot(reflected,back)*back
 outgoing=refract(back,exit,ior,1.0003)
 assert abs(np.linalg.norm(reflected)-1)<1e-10 and abs(np.linalg.norm(exit)-1)<1e-10
 return [entry,reflected,exit,exit+outgoing*1.24]

def drop(bg,spec,photoplate):
 cx,cy,size=spec;w,h=bg.size;r=size*.446
 arr=np.asarray(bg.convert('RGB'),dtype=np.float32).copy()
 x0=max(0,round(cx-r-3));x1=min(w,round(cx+r+4));y0=max(0,round(cy-r-3));y1=min(h,round(cy+r+4))
 yy,xx=np.mgrid[y0:y1,x0:x1];nx=(xx-cx)/r;ny=(yy-cy)/r;rad2=nx*nx+ny*ny
 inside=rad2<.999;z=np.sqrt(np.clip(1-rad2,0,1))
 # Two water-air interfaces, orthographic cover camera, backdrop 7 radii away.
 P=np.stack((nx,ny,z),axis=2);I=np.zeros_like(P);I[:,:,2]=-1
 eta=1/1.333;f=eta*(-z)+np.sqrt(np.clip(1-eta*eta*(1-z*z),0,1));t=eta*I-f[:,:,None]*P
 Q=P+(-2*np.sum(P*t,axis=2))[:,:,None]*t;N=-Q;dp=np.sum(N*t,axis=2);k=1-1.333**2*(1-dp*dp)
 ray=1.333*t-(1.333*dp+np.sqrt(np.clip(k,0,1)))[:,:,None]*N
 travel=(-7-Q[:,:,2])/np.minimum(ray[:,:,2],-.05)
 rawx=cx+(Q[:,:,0]+travel*ray[:,:,0])*r;rawy=cy+(Q[:,:,1]+travel*ray[:,:,1])*r
 # An unbounded analytical mist/rainbow plate keeps the sphere a single
 # glass object. Never clamp the photo into a rectangular window inside it.
 pw,px,py=photoplate;ph=pw*2482/5016
 rcx,rcy,rr=px+pw*.50,py+ph*.935,pw*.326
 mist=np.clip((rawy-py)/(ph*.90),0,1)
 lens=np.array([232,238,233])[None,None,:]*(1-mist[:,:,None])+np.array([218,231,224])[None,None,:]*mist[:,:,None]
 ru=(rr-np.sqrt((rawx-rcx)**2+(rawy-rcy)**2))/(rr*.062)
 palette=np.array([[245,114,99],[249,174,104],[242,218,134],[151,204,161],[135,191,209],[144,159,214],[173,148,210]],float)
 qcolour=np.clip(ru,0,1)*6;ii=np.minimum(np.floor(qcolour).astype(int),5);ff=(qcolour-ii)[:,:,None]
 spectrum=palette[ii]*(1-ff)+palette[ii+1]*ff
 # Keep the atmospheric bow outside the water sphere. A concentric miniature
 # rainbow inside the drop would imply the wrong explanation to a viewer.
 ra=(np.sin(np.clip(ru,0,1)*math.pi)**.46*.025)[:,:,None]
 lens=lens*(1-ra)+spectrum*ra
 # Film's cool glass treatment; readable dark grazing edge and broad sheen.
 rim=np.clip((np.sqrt(rad2)-.70)/.30,0,1)**2
 lens=lens*(1-.32*rim[:,:,None])+np.array([100,163,172])[None,None,:]*(.32*rim[:,:,None])
 tint=.11+.12*(1-z)
 lens=lens*(1-tint[:,:,None])+np.array([212,236,237])[None,None,:]*tint[:,:,None]
 a=np.clip((1-np.sqrt(rad2))*32,0,1)*inside*.81
 patch=arr[y0:y1,x0:x1]*(1-a[:,:,None])+lens*a[:,:,None]
 arr[y0:y1,x0:x1]=patch
 result=Image.fromarray(np.clip(arr,0,255).astype('uint8')).convert('RGBA')
 # The new 1280px Cycles plate has alpha extent 301..979. Crop with a real
 # transparent margin so its spherical boundary matches the analytic lens.
 sheen=Image.open(GLASS).convert('RGBA').crop((260,260,1020,1020)).filter(ImageFilter.GaussianBlur(.52)).resize((size,size),Image.Resampling.LANCZOS)
 # Keep real Cycles specularity; let its body alpha become more transparent.
 rgba=np.array(sheen);rgba[:,:,3]=(rgba[:,:,3].astype(float)*.42).astype('uint8')
 result.alpha_composite(Image.fromarray(rgba),(round(cx-size/2),round(cy-size/2)))
 q=2;beams=Image.new('RGBA',(w*q,h*q));bd=ImageDraw.Draw(beams)
 palette=['#ef4b3f','#f39a3e','#e8c34b','#54a67c','#55b4bf','#4b82c5','#886bb4']
 iors=[1.331,1.333,1.334,1.335,1.338,1.340,1.343]
 def pts(ps):return [(round((cx+p[0]*r)*q),round((cy-p[1]*r)*q)) for p in ps]
 routes=[path(n) for n in iors]
 # Downstream bands are real paths, not artistically widened angle gaps.
 for ps,c in zip(routes,palette):bd.line(pts(ps),fill=c,width=max(3,round(r/115*q)),joint='curve')
 entry=routes[0][0];bd.line(pts([entry-np.array([1.0,0]),entry]),fill=(255,247,226,255),width=max(4,round(r/92*q)))
 # Tiny interface glints provide the same causal cues as the V07 mechanism.
 for p in routes[0][:3]:
  px,py=pts([p])[0];rr=max(4,round(r*.014*q));bd.ellipse((px-rr,py-rr,px+rr,py+rr),fill=(255,253,234,255))
 bloom=beams.filter(ImageFilter.GaussianBlur(4*q));bloom.putalpha(bloom.getchannel('A').point(lambda a:round(a*.29)))
 result.alpha_composite(bloom.resize((w,h),Image.Resampling.LANCZOS));result.alpha_composite(beams.resize((w,h),Image.Resampling.LANCZOS))
 return result,[round(cx-r),round(cy-r),round(cx+r),round(cy+r)]

def intersects(a,b,pad=0):return not(a[2]+pad<=b[0] or b[2]+pad<=a[0] or a[3]+pad<=b[1] or b[3]+pad<=a[1])
def compose(name,cfg):
 w,h=cfg['size'];scale=min(w,h)/1080
 image,hero_box=drop(base(cfg),cfg['drop'],cfg['photo']);image.convert('RGB').save(OUT/f'background_{name}.png')
 draw=ImageDraw.Draw(image);logo=Image.open(LOGO).convert('RGBA');lh=round(90*scale);lw=round(lh*logo.width/logo.height)
 lx,ly=round(64*scale),round(48*scale);image.alpha_composite(logo.resize((lw,lh),Image.Resampling.LANCZOS),(lx,ly))
 bf=font(44*scale,600);bb=draw.textbbox((0,0),'rainbow鱼',font=bf);bh=bb[3]-bb[1]
 brand=ink(draw,(lx+lw+20*scale,ly+(lh-bh)/2),'rainbow鱼',bf,INK)
 px,py,psz=cfg['pill'];pf=font(psz,650);b=draw.textbbox((0,0),SERIES,font=pf);pw=b[2]-b[0]+48*scale;ph=b[3]-b[1]+30*scale
 pill=[px,py,round(px+pw),round(py+ph)];draw.rounded_rectangle(pill,radius=round(13*scale),fill=(41,110,113))
 ink(draw,(px+24*scale,py+15*scale),SERIES,pf,(255,255,255))
 tx,ty=cfg['title_xy'];tf=font(cfg['title_size'],820)
 boxes=[ink(draw,(tx,ty+j*cfg['leading']),line,tf,INK) for j,line in enumerate(cfg['title_lines'])]
 assert all(b[0]>=0 and b[1]>=0 and b[2]<w and b[3]<h for b in [brand,pill,*boxes]),(name,boxes)
 assert not any(intersects(b,hero_box,10*scale) for b in boxes),(name,'title obscures sphere')
 assert not any(intersects(pill,b,10*scale) for b in boxes),(name,'pill overlaps title')
 result=image.convert('RGB');result.save(OUT/f'cover_{name}.jpg',quality=96,subsampling=0,icc_profile=ICC)
 for maxdim in [320,160]:
  thumb=result.copy();thumb.thumbnail((maxdim,maxdim),Image.Resampling.LANCZOS);thumb.save(OUT/f'thumb_{name}_{maxdim}.jpg',quality=95,icc_profile=ICC)
 return {'ratio':name,'pixels':[w,h],'titleBoxes':boxes,'pillBox':pill,'brandNameBox':brand,'logoBox':[lx,ly,lx+lw,ly+lh],'heroBox':hero_box,'titleHeroClearance':True,'sha256':sha(OUT/f'cover_{name}.jpg')}

def main():
 reports=[compose(name,cfg) for name,cfg in LAYOUTS.items()]
 (OUT/'layout.json').write_text(json.dumps({'title':TITLE,'series':SERIES,'font':str(FONT),'layouts':LAYOUTS},ensure_ascii=False,indent=2)+'\n','utf8')
 (OUT/'layout-audit.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n','utf8')
 record={'date':'2026-10-11','newPaidGenerationCalls':0,'tools':['Python/Pillow','NumPy Snell ray tracing','new V08 Blender Cycles transparent glass render'],
  'coverMeaning':'Photographed atmospheric rainbow joined to an artistically magnified small spherical raindrop with true primary Snell vertices. Not a measurement.',
  'photo':{'path':str(PHOTO.relative_to(ROOT)),'author':'Lupuslupus26','source':'https://commons.wikimedia.org/wiki/File:Complete_Double_Rainbow.JPG','license':'CC BY-SA 4.0','licenseURL':'https://creativecommons.org/licenses/by-sa/4.0/','adaptations':'independent crop, atmospheric grade, slight background blur, water/glass/light-path/title/logo composition; photographic bow remains outside the magnified sphere','sha256':sha(PHOTO)},
  'coversLicense':'CC BY-SA 4.0 for adapted covers; rainbow鱼 trademark/logo ownership remains with its owner',
  'assets':[{'path':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in [GLASS,LOGO,Path(__file__)]],'physics':'AIR1.0003; seven WATERindices1.331..1.343; common entrance impact parameter0.8620714385305106; one internal reflection'}
 (OUT/'source-record.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n','utf8')
 board=Image.new('RGB',(1420,670),(237,243,240));d=ImageDraw.Draw(board)
 for j,name in enumerate(LAYOUTS):
  im=Image.open(OUT/f'cover_{name}.jpg');im.thumbnail((330,610),Image.Resampling.LANCZOS);board.paste(im,(25+j*350,45));d.text((25+j*350,16),name,font=font(20,600),fill=INK)
 board.save(OUT/'four_ratio_contact.jpg',quality=95,icc_profile=ICC)
 board=Image.new('RGB',(720,230),(237,243,240));d=ImageDraw.Draw(board)
 for j,name in enumerate(LAYOUTS):
  im=Image.open(OUT/f'thumb_{name}_160.jpg');board.paste(im,(12+j*180,35));d.text((12+j*180,10),name,font=font(17,600),fill=INK)
 board.save(OUT/'thumbnail160-contact.jpg',quality=95,icc_profile=ICC)
 (OUT/'hashes.json').write_text(json.dumps({p.name:sha(p) for p in sorted(OUT.glob('*.jpg'))},ensure_ascii=False,indent=2)+'\n','utf8')
 print(json.dumps(reports,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
