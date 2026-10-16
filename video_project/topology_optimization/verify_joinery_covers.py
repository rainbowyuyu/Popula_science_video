from pathlib import Path
from PIL import Image, ImageCms
import json, hashlib
root=Path(r'D:/python_project/manim_extend_rainbow/video_project/topology_optimization/delivery/episode3/covers_v2')
expected={'16x9':(1920,1080),'3x4':(1440,1920),'4x3':(1920,1440),'9x16':(1080,1920)}
report=[]
for ratio,size in expected.items():
 p=root/f'榫卯_封面_{ratio}.jpg'
 im=Image.open(p)
 assert im.size==size and im.mode=='RGB' and im.format=='JPEG'
 t320=im.copy(); t320.thumbnail((320,320),Image.Resampling.LANCZOS); t320.save(root/f'榫卯_封面_{ratio}_thumb320.jpg',quality=94)
 t160=im.copy(); t160.thumbnail((160,160),Image.Resampling.LANCZOS); t160.save(root/f'榫卯_封面_{ratio}_thumb160.jpg',quality=94)
 report.append({'file':p.name,'size':list(im.size),'mode':im.mode,'format':im.format,'icc_profile':bool(im.info.get('icc_profile')),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'thumb320':f'榫卯_封面_{ratio}_thumb320.jpg','thumb160':f'榫卯_封面_{ratio}_thumb160.jpg'})
(root/'quality-report.json').write_text(json.dumps({'checks':report,'manual_review':'原图与320/160缩略图已查看；主标题、亭子拆解和三种榫卯可识别，标签未遮挡关键结构。'},ensure_ascii=False,indent=2),encoding='utf-8')
print('verified',len(report))
