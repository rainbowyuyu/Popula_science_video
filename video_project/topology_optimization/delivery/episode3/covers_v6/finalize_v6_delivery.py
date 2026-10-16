from PIL import Image
from pathlib import Path
import numpy as np, os, json, hashlib, cv2, shutil

BASE=r'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\delivery\episode3\covers_v6'
RATIOS={'16x9':(1920,1080),'4x3':(1920,1440),'3x4':(1440,1920),'9x16':(1080,1920)}
ICC_PATH=None

def sha(path):
    h=hashlib.sha256(); h.update(open(path,'rb').read()); return h.hexdigest()

def overlay_text(old_final, old_scene, new_scene):
    a=np.array(Image.open(old_final).convert('RGB'))
    s=np.array(Image.open(old_scene).convert('RGB'))
    n=np.array(Image.open(new_scene).convert('RGB'))
    d=np.max(np.abs(a.astype(int)-s.astype(int)),axis=2)
    out=n.copy(); out[d>3]=a[d>3]
    return Image.fromarray(out,'RGB')

def remove_3x4_finial(path):
    a=np.array(Image.open(path).convert('RGB')); H,W=a.shape[:2]
    # The cap is intentionally omitted in 3:4 to keep the hook question mark legible.
    poly=np.array([[678,430],[715,430],[797,478],[797,548],[770,560],[700,552],[675,520]],np.int32)
    mask=np.zeros((H,W),np.uint8); cv2.fillPoly(mask,[poly],255)
    out=a.copy()
    # Smooth warm-gray background sampled from the unobstructed right side, row by row.
    for y in range(420,565):
        xs=np.where(mask[y]>0)[0]
        if len(xs): out[y,xs]=a[y,840]
    region=mask>0
    dark=(a[:,:,0]<80)&(a[:,:,1]<100)&(a[:,:,2]<110)
    bright=(a[:,:,0]>210)&(a[:,:,1]>210)&(a[:,:,2]>205)
    out[region&(dark|bright)]=a[region&(dark|bright)]
    return Image.fromarray(out,'RGB')

def save_outputs(ratio, img, old_png):
    w,h=RATIOS[ratio]
    assert img.size==(w,h), (ratio,img.size)
    # Embed the existing sRGB profile when available.
    old=Image.open(old_png)
    icc=old.info.get('icc_profile')
    if not icc:
        ref=Path(BASE).parent/'covers_v5'/'榫卯_爆炸亭封面_16x9.jpg'
        if ref.exists(): icc=Image.open(ref).info.get('icc_profile')
    png_name=f'榫卯_爆炸亭封面_{ratio}_排版源.png'
    jpg_name=f'榫卯_爆炸亭封面_{ratio}.jpg'
    alias_png=f'cover_{ratio}_layout.png'; alias_jpg=f'cover_{ratio}.jpg'
    img.save(os.path.join(BASE,png_name), format='PNG', icc_profile=icc)
    img.save(os.path.join(BASE,alias_png), format='PNG', icc_profile=icc)
    rgb=img.convert('RGB')
    rgb.save(os.path.join(BASE,jpg_name), format='JPEG', quality=95, subsampling=0, icc_profile=icc)
    shutil.copy2(os.path.join(BASE,jpg_name), os.path.join(BASE,alias_jpg))
    for px in (160,320):
        thumb=rgb.copy(); thumb.thumbnail((px,px),Image.Resampling.LANCZOS)
        thumb.save(os.path.join(BASE,f'榫卯_爆炸亭封面_{ratio}_thumb{px}.jpg'),format='JPEG',quality=92,subsampling=0,icc_profile=icc)

# 16:9 remains the existing validated render; 4:3/9:16 use safe-margin rerenders.
for ratio in ['16x9','4x3','3x4','9x16']:
    old_png=os.path.join(BASE,f'榫卯_爆炸亭封面_{ratio}_排版源.png')
    old_scene=os.path.join(BASE,f'scene_{ratio}.png')
    if ratio=='16x9':
        img=Image.open(old_png).convert('RGB')
    elif ratio=='3x4':
        img=remove_3x4_finial(old_png)
    else:
        img=overlay_text(old_png,old_scene,os.path.join(BASE,f'scene_{ratio}_safe.png'))
    save_outputs(ratio,img,old_png)

# Replace scene files with the safe-margin renders used for final 4:3 and 9:16 delivery.
for ratio in ['4x3','9x16']:
    shutil.copy2(os.path.join(BASE,f'scene_{ratio}_safe.png'), os.path.join(BASE,f'scene_{ratio}.png'))

# Contact sheet with each final cover labelled by ratio.
thumbs=[]
for ratio in ['16x9','4x3','3x4','9x16']:
    im=Image.open(os.path.join(BASE,f'榫卯_爆炸亭封面_{ratio}.jpg')).convert('RGB')
    im.thumbnail((640,420),Image.Resampling.LANCZOS)
    canvas=Image.new('RGB',(640,460),(239,235,224)); canvas.paste(im,((640-im.width)//2,8))
    from PIL import ImageDraw, ImageFont
    d=ImageDraw.Draw(canvas)
    d.text((20,430),ratio,fill=(24,55,58))
    thumbs.append(canvas)
contact=Image.new('RGB',(1280,920),(239,235,224))
for i,im in enumerate(thumbs): contact.paste(im,((i%2)*640,(i//2)*460))
contact.save(os.path.join(BASE,'covers_v6_contact.jpg'),quality=94)

# Update the manifests with the actual final hashes and safe-camera/postprocess notes.
layout_path=os.path.join(BASE,'cover-layout-v6.json')
layout=json.load(open(layout_path,encoding='utf-8'))
for e in layout['renders']:
    ratio=e['ratio']; e['sha256']=sha(os.path.join(BASE,e['jpg']))
json.dump(layout,open(layout_path,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

render_path=os.path.join(BASE,'cover-render-manifest.json')
render=json.load(open(render_path,encoding='utf-8'))
for e in render['renders']:
    ratio=e['ratio']
    if ratio=='4x3':
        e['camera']['ortho_scale']=round(13.0*1.06,3)
        e['camera_adjustment']='safe margin ×1.06; full roof and base edges retained'
    elif ratio=='9x16':
        e['camera']['ortho_scale']=round(12.6*1.16,3)
        e['camera_adjustment']='safe margin ×1.16; full roof and base edges retained'
    elif ratio=='3x4':
        e['postprocess_hidden_parts']=['FINIAL']
        e['postprocess_note']='FINIAL removed from final 3:4 overlay to keep the title question mark clear; all 4 foundations remain visible'
    e['final_jpg']=f'榫卯_爆炸亭封面_{ratio}.jpg'
    e['final_sha256']=sha(os.path.join(BASE,e['final_jpg']))
json.dump(render,open(render_path,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

# Human-readable delivery note.
md='''# v6 封面交付说明

- 源模型：`pavilion-v7.blend`，117 个可分离构件。
- 四种比例：16:9、4:3、3:4、9:16，均保留中心台基与四个石墩，石墩与对应柱脚绑定移动，避免基础错位。
- 屋瓦四面隐藏，按视角分别遮去一块屋面板（16:9/3:4 为 `DECK_FRONT`，4:3/9:16 为 `DECK_RIGHT`），让椽架、斗栱、梁柱和插销更容易辨认。
- 4:3 与 9:16 使用安全边距重新渲染，檐口和台基不再贴边；3:4 仅移除宝顶 `FINIAL`，避免与标题问号叠压，其他结构件保持可见。
- 文字仅保留 rainbow鱼 Logo、系列胶囊“每天5分钟科普 · 榫卯”和主标题“木头怎样咬住木头？”。
- 交付文件：四张 RGB JPEG、四张 PNG 排版源、160/320 px 缩略图、`cover-layout-v6.json`、`cover-render-manifest.json`。
'''
open(os.path.join(BASE,'交付说明.md'),'w',encoding='utf-8').write(md)
print('FINALIZED', {r:sha(os.path.join(BASE,f'榫卯_爆炸亭封面_{r}.jpg')) for r in RATIOS})

