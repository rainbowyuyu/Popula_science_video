"""Package the complete V18 only after encoded-media and visual-review gates."""
from pathlib import Path
import json, hashlib
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];DEL=ROOT/'delivery'
stem='如何科学减肥_从身体调节说起_V18'
video=DEL/(stem+'_1080p.mp4')
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def read(p):return json.loads(Path(p).read_text('utf8'))
def rel(p):return Path(p).relative_to(ROOT).as_posix()
validation=read(video.with_suffix('.validation.json'))
qa=read(ROOT/'tmp/v18-qa/technical.json');review=read(ROOT/'tmp/v18-qa/review.json')
digest=sha(video)
assert validation['automaticChecksPass'] and validation['frameCorrespondence']['allFramesMatched']
assert validation['audioComparison']['zeroLagVerified'] and qa['technicalPass']
assert review['releaseApproved'] and all(x['videoSHA256']==digest for x in [validation,qa,review])
lock=read(ROOT/validation['sourceLock'])
for name,h in lock['hashes'].items():assert sha(ROOT/name)==h,name
tl=read(ROOT/'src/timeline.json')
def stamp(f):
 ms=round(f*1000/tl['fps']);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{s:02},{ms:03}'
display_captions=[dict(c) for c in tl['captions'] if c['end']-c['start']>3]
for fragment in tl['captions']:
 if fragment['end']-fragment['start']<=3:
  target=next((c for c in display_captions if c['start']==fragment['end']),None)
  if target is not None:target['start']=fragment['start']
srt=DEL/(stem+'.srt')
srt.write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(display_captions))+'\n','utf8')
chapters=validation['chapters']
from fractions import Fraction
meta=';FFMETADATA1\ntitle=如何科学减肥？从身体调节说起\n'
for c in chapters:
 meta+=f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(Fraction(c['start'])*1000)}\nEND={round(Fraction(c['end'])*1000)}\ntitle={c['title']}\n"
metadata=DEL/(stem+'.ffmetadata');metadata.write_text(meta,'utf8')
covers=[]
for p in sorted((DEL/'封面-V18').glob('*.jpg')):
 with Image.open(p) as im:size=list(im.size)
 covers.append({'path':rel(p),'sha256':sha(p),'size':size})
assert len(covers)==4
import zipfile
cover_zip=DEL/'四比例封面-V18.zip'
with zipfile.ZipFile(cover_zip,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for c in covers:z.write(ROOT/c['path'],Path(c['path']).name)
manifest={'version':'V18','title':'如何科学减肥？从身体调节说起','series':'5分钟科普 · 血压血糖血脂','releaseApproved':True,'video':{'path':rel(video),'sha256':digest},'durationSeconds':tl['duration']/30,'frames':tl['duration'],'fps':30,'covers':covers,'subtitles':rel(srt),'subtitlesSHA256':sha(srt),'chapters':rel(metadata),'audioMaster':{'path':'public/master.wav','sha256':sha(ROOT/'public/master.wav')},'timelineSHA256':sha(ROOT/'src/timeline.json'),'sourceLock':validation['sourceLock'],'compositionValidation':rel(video.with_suffix('.validation.json')),'technicalQA':'tmp/v18-qa/technical.json','visualReview':'tmp/v18-qa/review.json','manualFullFilmPlayback':False,'subjectiveFullAudioListening':False,'v17RollbackPreserved':True}
manifest['coverArchive']={'path':rel(cover_zip),'sha256':sha(cover_zip)}
(DEL/'latest-v18.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
levels=validation['aacMeasurement']
note=f'''# 本次交付 · V18

**如何科学减肥？从身体调节说起**  
栏目：**5分钟科普 · 血压血糖血脂**（青绿色底白字）

- 完整成片：`{video.name}`，1920×1080、30 fps，14分51.27秒。
- 四比例 JPG：`封面-V18/`，16:9、4:3、3:4、9:16。
- 配套字幕：`{srt.name}`；发布文案：`发布文案-V18.md`。

从餐桌进入同一套人体坐标，沿血糖、GLP-1、脂蛋白、肾脏和血压的调节机制，再回到饮食、活动、睡眠与记录。“5分钟科普”为系列名称，本片保留完整长篇讲解。

本次修正握叉方向与手指握持，覆盖六处受影响的餐桌段落；补强肌肉摄糖方向提示和肾单位定位，减少重复标签；修复器官拉远时的突然消失及心室壁遮挡。GLP-1 / DPP-4 剪切改为按句内口播时间驱动：镜头先到达分子尺度，随后剪去两个氨基酸并停留观察，再让工程分子从画面外接入；旧肽链与酶完全退出镜头后隐藏。局部胰岛和动脉通过同一人体锚点衔接。

急救号码所在整句已重新合成，口播控制稿为“幺二零”、字幕为“120”。LDL 首次解释低密度脂蛋白，配乐沿用用户指定的《Lemon Tree》钢琴录音。句源保留字头字尾缓冲；完整母带校验后编码，最终字幕修订直接复制已有 AAC 音轨，未再次编码或变速。

两处单帧字幕碎片已合并。肠道段保留原有连续三维画面，仅在一帧中替换字幕底板范围，避免独立重渲染改变粒子与器官的透明遮挡顺序；修订后的两端接缝单独复核。

已完成26738帧完整解码和逐帧来源对应、精确时间戳、20章节、全长音频零时移及黑帧检测。最终 AAC 为 {levels['input_i']} LUFS、{levels['input_tp']} dBTP。关键动作与过渡使用连续抽帧复核；这些检查不等同于全片人工实时观看或逐句人工听审，详细范围见 QA 记录。

人体、细胞和机制为有尺度依据的教学模型；粒子和方向标记用于解释，不代表患者级临床仿真或治疗预测。视频 SHA256：`{digest}`。
'''
(DEL/'本次交付-V18.md').write_text(note,'utf8')
revision='''# V18 修订说明

状态：已完成编码与交付验收。完整文件及证据见 `本次交付-V18.md`、`latest-v18.json`。

- 标题与四比例封面统一为“如何科学减肥？从身体调节说起”，栏目使用青绿色底白字“5分钟科普 · 血压血糖血脂”。
- 握叉方向随拾取和抬升平滑变化，食指轻搭、其余手指收拢并增强拇指支撑；覆盖全片六处实际受影响餐桌片段，保持骨长和叉头路径。
- 胰岛与动脉继续使用同一人体坐标的注册锚点；优化透明层交接，消除器官提前消失及近距离心室壁遮挡。
- 增加肌肉摄糖方向标记，优化肾单位定位环，去掉重复受体标签。组织尺度方向点为教学标记，不是分子真实大小。
- GLP-1 / DPP-4 剪切及后续修饰段保留在完整调节故事中；修复重录后的句内时序，以实际对齐字幕驱动镜头到达、酶靠近和两个氨基酸被剪下，结果停留后再演示分子改造。新链从画面外接入，旧链与酶退出画面后才隐藏。清除重录对齐留下的两处单帧字幕碎片，导出的 SRT 同步合并。
- 急救电话“120”整句重新合成并重建字幕时间，字头字尾留缓冲，显示稿和口播控制稿分别保存；低密度脂蛋白先解释中文全称再使用 LDL 缩写。
- 配乐保留指定的《Lemon Tree》钢琴录音，完整母带与成片全长同步，未强行变速。

验收包括源码类型检查、关键动作和过渡连续抽帧、完整解码、26738帧逐帧对应、时间戳、20章节、全长音频同步、响度及真峰值。没有声称全片人工实时观看或逐句人工听审。V17保留为回退。
'''
(DEL/'修订说明-V18.md').write_text(revision,'utf8')
promo=DEL/'发布文案-V18.md'
text=promo.read_text('utf8').replace('内部交付状态：**待最终 QA**。以下为发布文案草稿，待 V18 成片验收后使用。','配套 V18 完整成片，尚未向任何平台发布。')
promo.write_text(text,'utf8')
print(json.dumps({'packaged':True,'videoSHA256':digest,'covers':len(covers)},ensure_ascii=False))
