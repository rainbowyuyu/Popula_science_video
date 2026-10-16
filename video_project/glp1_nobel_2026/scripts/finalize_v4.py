"""Write V4 delivery documentation only after matching final-video QA exists."""
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def write(p,text):(ROOT/p).write_text(text.strip()+'\n',encoding='utf-8')

def main():
    tl=read('src/timeline.json');qa=read('research/qa/final-v4/automatic-report.json')
    review=read('research/qa/final-v4/visual-review.json')
    assert qa['automaticChecksPass'] and review['sampledVisualReviewCompleted']
    assert qa['videoSHA256']==review['videoSHA256']==sha('delivery/GLP1_1080p.mp4')
    assert qa['timelineSHA256']==sha('src/timeline.json')
    seconds=tl['duration']/tl['fps'];duration=f'{int(seconds//60)}分{seconds%60:04.1f}秒'
    sources=read('research/revision-v4/evidence.json')
    source_list='\n'.join(f"- **{s['id']}** — [{s['title']}]({s['url']})；核验记录：`{s.get('verification','see evidence.json')}`。" for s in sources['sources'])
    chapters=[(1,'一顿饭与三高'),(7,'能量过剩与胰岛素抵抗'),(10,'肠道信号与 GLP-1 研究'),(24,'肝脏与脂蛋白运输'),(30,'心脏、血管与血压'),(35,'肾脏、水盐和全身调节'),(43,'从 LDL 滞留到斑块、血栓'),(50,'把原理变成日常管理'),(60,'家庭测量与个体化方案'),(66,'食欲调节与研究工具'),(71,'回到生活')]
    chapter_text='\n'.join(f"- {int(tl['clips'][i-1]['start']/30)//60:02d}:{int(tl['clips'][i-1]['start']/30)%60:02d} {title}" for i,title in chapters)
    attribution='人体：BodyParts3D © The Database Center for Life Science，CC BY 4.0；Human Atlas © ashemag，MIT。分子：RCSB PDB 5VAI。音乐：《微光信使》，本片原创编配；VSCO 2 CE 单音采样，CC0。'
    description=f'''# 科学减重，读懂三高｜制作与来源

rainbow鱼 · 每天5分钟科普特别篇。V4：1920×1080、30 fps、{tl['duration']}帧、{duration}；72句旁白、{len(tl['captions'])}条字幕，结尾另有9秒来源陈列。

## 内容与观看顺序

影片跟着一顿饭进入同一个身体：营养吸收、胰岛素抵抗与肠道信号，引出肝脏的脂质运输；再通过血液连接心脏、小动脉、肾脏和水盐调节，回到斑块形成及日常管理。已移除原版药物疗效与获益百分比图表。药物仅用于解释调节机制和个体化管理，不提供个人处方或疗效承诺。

{chapter_text}

## 尺度、模型与动画边界

人体器官沿用同一套 BodyParts3D/Human Atlas 米制坐标，未为了近景单独放大器官。近景由摄影机移动实现，先保留母层结构，再逐渐透明以显露原位置的子结构。固定像素长度的比例尺，按摄影机焦点平面的视野换算米、厘米、毫米、微米或纳米。比例尺是焦点平面上的长度；透视画面不同深度不能直接共用它量尺寸。

胰岛直径150微米、β细胞直径15微米、红细胞约7.5微米、静息血小板约2.5微米、VLDL约50纳米、LDL约22纳米，均为代表性教学尺寸，实际生物结构存在变化。血小板在血浆推进段用于尺度参照，该段不演示凝血；定位环是画面注释，不是生物结构。细胞、肾单位、脂蛋白及血管剖切局部是按参考尺度构建的教学几何，并非该参考人体的显微扫描。5VAI为实验结构坐标的可视化；动态接收、运输、分泌过程是机制示意，不是分子动力学轨迹。

血管流动路线以已有血管表面和解剖标志建立。迷走神经采用有明确标识的参考路径，不冒称来自完整神经网格；交感调节画面与迷走神经区分。家庭测量采用同一参考人体外表的坐姿变形与支撑模型，是姿势教学示意，不是医学扫描姿态重建。

压力变化读取本地已保存的零维 Windkessel 模型求解数据，数据与来源位于 `public/cardio/physics.json`、`research/revision-v4/solve_pressure_source.py`。它解释压力随心动周期与阻力变化的关系，不代表该人体的局部 CFD 或患者血压预测。小动脉收缩、水盐回收、LDL滞留与斑块进展采用教学动画，箭头表示方向，颜色区分结构，不能当作临床测量值。

## 文字与声音

所有新排版文字、字幕、数值与标注统一使用 Noto Sans SC（工程名 Rainbow Sans），真实论文原页保留原排版。左上透明原图 Logo 与 rainbow鱼固定并排。画面优先大字和少量标注。

沿用用户授权的 rainbow鱼 个人参考音色，按句合成与实测音长安排时间线，没有整体加速。ASR用于漏词、重读、读音疑点和字幕时间辅助；音频质量报告不等于全长主观听审。

《微光信使》为本片原创旋律与编配，V4按新时长重新安排同一作品。单音来自 VSCO 2 Community Edition：Sam Gossner / Versilian Studios、Simon Dalzell / Ivy Audio；编辑 Elan Hickler / Soundemote。版本 `440300901dfe9275fd84e0b7763af1f8443ae62e`，CC0；逐文件来源与哈希在 `research/music/samples/manifest.json`。

## 真实论文页与核验

片尾：Mojsov等（1987）GLP-1活性片段研究；Maaliki等（2022）盐敏感性高血压机制；Knudsen、Lau（2019）从天然信号到药物设计。均为原论文页面的格式转换；标题、作者年份另排在页面下方。页面版权归原权利人，人体/音频素材许可不延伸到论文。来源与页面路径见 `public/papers/manifest.json`；本版片尾三页的文件哈希见 `research/revision-v4/paper-page-hashes.json`。

新加入的三高、生活管理与急救建议已实际读取 WHO、NIH/NIDDK、NIH/NHLBI 和国家医保局相关正文；GLP-1原始研究承接本工程V3核验，旧工程的脂蛋白与盐敏感论文在V4重读相关页。HTTP拒绝和替代来源记入 `research/revision-v4/research-log.json`，未读取正文的搜索摘要不作为全文证据。72句的逐句映射在 `research/revision-v4/evidence.json`。

{source_list}

## 素材署名

{attribution}

BodyParts3D数据许可：https://creativecommons.org/licenses/by/4.0/ 。数据论文：https://doi.org/10.1093/nar/gkn613 。Human Atlas：https://github.com/ashemag/human-atlas ，版本 `1c38bf35c254a891200d3cedecfd57abebe83d8d`。分组、配色和教学动画为本片编辑；原始部件ID、导出坐标、许可保留在 `public/models/manifest.json` 与相关许可证文件中。Noto Sans SC依SIL Open Font License使用。

## 最终检查与复现

最终视频 SHA-256：`{qa['videoSHA256']}`。

完整MP4自动解码成功；分辨率、帧数、音画时长、黑场和最终AAC响度已检查。抽取{qa['framesExtracted']}帧，覆盖72句、所有句间交接及关键跨尺度过程；已查看的联系表与修正记录详见 `research/qa/final-v4/visual-review.json`。这是自动全片检查加画面抽样检查，没有声称人工逐秒观看或全长主观听审。

最终AAC：{qa['measured']['aacIntegratedLUFS']} LUFS；真峰值 {qa['measured']['aacTruePeakDBTP']} dBTP。

工程入口 `src/index.tsx` → `V4Film.tsx` → `V4World.ts`；镜头 `V4CameraPath.ts`；心血管/肾脏模块 `CardioDetail.ts`、`CardioVascularDetail.ts`；字幕和时间线 `src/timeline.json`。

检查：`npm run check`。渲染：`node scripts/render.mjs --concurrency=3`。最终验证：`python scripts/qa_final.py --revision v4`。已有音频/时间线已锁定；不要无目的重跑 `story_v4.py`，以免用草稿估算时长覆盖实测时间线。
'''
    write('delivery/制作与来源.md',description)
    write('delivery/发布文案.md',f'''# 科学减重，读懂三高｜各平台发布文案

系列：每天5分钟科普 · 特别篇
本集实际时长：{duration}。这次将内容展开，不宣称五分钟内讲完。

## 抖音

标题：腰围大了，三高为什么也找上门？

血糖、血压、血脂一起偏高，先从哪里改？跟着一顿家常饭进入身体，看肠道怎样传消息、肝脏怎样运脂肪、血管怎样产生压力、肾脏怎样调水盐。也聊聊吃饭、活动、测量和复诊这些每天做得到的事。给自己，也给关心的家人。

#三高 #科学减重 #高血压 #血脂 #健康科普 #rainbow鱼

## 小红书

标题：减重与三高，放进同一个身体看懂

体检单上的几项数字，经常一起变化。它们背后有哪些联系？这次用同一个三维人体，从餐桌一路走进肠道、肝脏、血管和肾脏。

会看到：血糖怎样调节；脂肪怎样被运输和清除；血压为什么升高；斑块与血栓有什么不同。最后把原理带回日常：少一点甜饮和盐，营养与肌肉都要顾，规范测量，带记录复诊。老年人和有合并疾病的人，目标要按身体情况来定。

#每天学点新知识 #科学减重 #三高管理 #关爱父母 #人体科普

## B站

标题：科学减重，读懂三高：从一顿饭走进身体｜连续3D人体科普

简介：血糖、血压、血脂怎样相互牵动？从一顿饭出发，连着看懂胰岛素抵抗、GLP-1研究、脂蛋白运输、小动脉阻力、肾脏水盐调节，以及斑块和血栓。用同一人体与连续跨尺度镜头讲机制，把能做的管理方法留在生活里。片中含代表性教学结构与机制示意，完整来源附制作说明。

{chapter_text}

## 微信视频号

标题：科学减重，读懂血糖、血压和血脂

同一份体检单上的三项指标，背后是一起工作的肠道、肝脏、心脏、血管与肾脏。用通俗解说和三维人体走一遍，再聊聊日常饮食、活动、规范测量与个体化管理。愿这份知识，能帮助我们更好地照顾自己和家人。

#健康科普 #科学减重 #三高管理

## 可共用的补充说明

本片用于健康知识普及，画面中的微观结构与动态过程含教学示意，不替代个人诊疗。老年人、慢性肾病患者及正在用药者，应结合自身情况制定饮食、活动和用药计划。疑似卒中或心梗等急症，请立即拨打120。

{attribution}

来源包括 WHO、NIDDK、NHLBI、国家医保局，以及GLP-1、脂蛋白和盐敏感性高血压相关研究。完整来源与素材许可见《制作与来源》。
''')
    write('README.md',f'''# 科学减重，读懂三高

rainbow鱼 · 每天5分钟科普特别篇。V4：1920×1080 / 30 fps / {duration} / 72句旁白。

已删除原版药物疗效和获益统计，围绕一顿饭连接血糖、血压、血脂及日常管理。宏观模型沿用同一米制人体坐标；微观教学结构固定在母层位置，摄影机逐层靠近，前景逐渐透明。比例尺随焦点平面持续更新。

- `delivery/GLP1_1080p.mp4`：完整新版视频，技术文件名沿用工程名。
- `delivery/解说稿.md`、`delivery/GLP1.srt`：实际口播与字幕。
- `delivery/发布文案.md`：抖音、小红书、B站、微信视频号文案。
- `delivery/制作与来源.md`：来源、教学示意边界、素材许可与复现说明。
- `delivery/covers/`：四种比例独立排版JPG。

最终自动检查：`research/qa/final-v4/automatic-report.json`。
画面抽样检查：`research/qa/final-v4/visual-review.json`。
医学来源与逐句映射：`research/revision-v4/evidence.json`。

完整解码及抽样检查已完成；未声称全长人工观看或主观听审。

复现：`npm run check`，`node scripts/render.mjs --concurrency=3`，`python scripts/qa_final.py --revision v4`。

所有正式镜头由帧号决定。已有最终配音和真实音长时间线，不要重跑草稿脚本 `story_v4.py` 覆盖它们。源码、原始声音、来源数据及许可证保留。
''')
    print(json.dumps({'revision':'V4','seconds':seconds,'docsWritten':3},ensure_ascii=True))

if __name__=='__main__':main()
