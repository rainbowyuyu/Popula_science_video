"""Validate and package finished JPG covers and platform copy."""
from pathlib import Path
import json, hashlib, zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'delivery/covers'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

specs=json.loads((ROOT/'scripts/covers/layouts.json').read_text(encoding='utf-8'))
qa=json.loads((OUT/'layout-qa.json').read_text(encoding='utf-8'))
assert all(not c['issues'] for c in qa['covers'])
files=[];checks=[]
for s in specs:
    p=OUT/f"密码学_封面_{s['id']}.jpg"
    with Image.open(p) as im:
        assert im.format=='JPEG' and list(im.size)==s['size'] and im.mode=='RGB'
        assert im.info.get('icc_profile')
        im.verify()
    files.append(p)
    checks.append({'file':p.name,'size':s['size'],'format':'JPEG','color':'RGB / sRGB','sha256':sha(p)})

assets=[]
groups=[
    ('public/brand/logo.png','用户提供的 rainbow鱼 品牌素材；本次按品牌使用请求复用，保留原文件。'),
    ('public/models/phone.glb','同一视频工程现有手机模型；未新增外部下载，原始来源责任沿用视频工程。'),
    ('public/textures/birthday-cake.png','同一视频工程现有生日蛋糕贴图；未新增外部下载，原始来源责任沿用视频工程。'),
    ('delivery/covers/artwork/landscape-hero.png','本任务 Blender Cycles 原创组合渲染；含上述已有手机和贴图。'),
    ('delivery/covers/artwork/portrait-hero.png','本任务 Blender Cycles 原创组合渲染；含上述已有手机和贴图。'),
    ('work/cover-art/landscape.blend','本任务程序化锁与纸张模型、灯光、镜头；贴图已内嵌。'),
    ('work/cover-art/portrait.blend','本任务程序化锁与纸张模型、灯光、镜头；贴图已内嵌。'),
    ('artwork/covers/fonts/sans.ttf','Noto Sans SC 子集，SIL Open Font License，见同目录 OFL.txt。'),
    ('artwork/covers/fonts/serif.ttf','Noto Serif SC 子集，SIL Open Font License，见同目录 OFL.txt。'),
    ('scripts/covers/build_cover_art.py','本任务建模与渲染源代码。'),
    ('scripts/covers/compose_covers.py','本任务后期排版源代码。'),
    ('scripts/covers/layouts.json','本任务四种比例独立排版参数。'),
]
for relative,source in groups:
    p=ROOT/relative
    assets.append({'file':relative,'sourceAndLicense':source,'sha256':sha(p),'bytes':p.stat().st_size})
(ROOT/'artwork/covers/asset-manifest.json').write_text(json.dumps({'topic':'密码学','generatedTools':['Blender Cycles','Pillow'], 'externalGeneratedImageApiUsed':False,'webReferencesUsedAs':'layout research only; no downloaded reference artwork','assets':assets},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'delivery-checks.json').write_text(json.dumps({'covers':checks,'layoutCollisionCheck':'pass','visualReview':'research/covers/draft-layout-review.md','geometryReview':['work/cover-art/landscape-geometry-qa.json','work/cover-art/portrait-geometry-qa.json']},ensure_ascii=False,indent=2),encoding='utf-8')

readme='''# 密码学｜封面与发布文案

主标题：**密码学**  
封面提问：**没约过密码，怎么保密？**  
栏目：**每天5分钟科普**  
品牌：左上角原版图片 Logo ＋ rainbow鱼

| 文件 | 尺寸 | 比例 |
|---|---|---|
| 密码学_封面_16x9.jpg | 1920×1080 | 16:9 |
| 密码学_封面_4x3.jpg | 1920×1440 | 4:3 |
| 密码学_封面_3x4.jpg | 1440×1920 | 3:4 |
| 密码学_封面_9x16.jpg | 1080×1920 | 9:16 |

四张均为 RGB/sRGB、高质量 JPG，分别排版。主题由片中的手机、生日蛋糕订单、密文纸张及象征加密的锁共同呈现。锁是概念图形，不代表协议中的实体硬件。

`密码学_各平台发布文案.md` 包含抖音、小红书、B站和微信视频号的标题、正文、话题与首评；B站另含按实际影片时间线整理的章节。

## 制作与验证

用本片已有模型和贴图在 Blender Cycles 中重建封面场景，Pillow 合成文字。参考 Adobe 海报指南与 Muzli 的层级设计实例，未复制外部海报图像。使用 Noto Serif SC 与 Noto Sans SC 两种字体，字体许可为 SIL OFL。

已检查四种尺寸、sRGB、实际文字边界、文字与不透明模型重叠；已人工查看全图、320 px 和160 px缩略图。模型空间交叉检查通过。详情留在项目的 `research/covers/`、`artwork/covers/asset-manifest.json` 及 `delivery/covers/layout-qa.json`。

## 后续编辑

在视频工程 `v4` 根目录运行：

```powershell
python scripts/covers/compose_covers.py
python scripts/covers/finalize_package.py
```

位置与字号：`scripts/covers/layouts.json`。  
模型场景：`work/cover-art/landscape.blend`、`portrait.blend`（贴图已内嵌）。  
高清透明主视觉：`delivery/covers/artwork/`。
'''
(OUT/'封面使用说明.md').write_text(readme,encoding='utf-8')
files += [OUT/'密码学_各平台发布文案.md',OUT/'封面使用说明.md',OUT/'密码学_四比例预览.jpg']
zip_path=OUT/'密码学_封面与发布文案.zip'
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for p in files: archive.write(p,p.name)
with zipfile.ZipFile(zip_path) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist())==len(files)
print(json.dumps({'verified':checks,'package':str(zip_path),'packageBytes':zip_path.stat().st_size},ensure_ascii=False))
