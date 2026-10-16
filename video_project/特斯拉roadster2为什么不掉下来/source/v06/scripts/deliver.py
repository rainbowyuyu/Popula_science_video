"""Publish the V06 local review page and shift external captions by the picture offset."""
from pathlib import Path
import json,re,shutil
from assemble import ROOT,WORK,OUT,sha

c=json.loads((WORK/'edit-contract.json').read_text(encoding='utf8'))
offset=c['introSec']
old=ROOT/'output/v05'
sub=ROOT/'subtitles/v06';sub.mkdir(parents=True,exist_ok=True)
def stamp(ms):
    ms=round(ms);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
def shift(m):
    h,mm,s,ms=map(int,m.groups());return stamp(h*3600000+mm*60000+s*1000+ms+offset*1000)
srt=(ROOT/'subtitles/v05/Roadster_中文字幕.srt').read_text(encoding='utf8')
srt=re.sub(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})',shift,srt)
(sub/'Roadster_中文字幕.srt').write_text(srt,encoding='utf8')
html=(old/'preview.html').read_text(encoding='utf8')
def chapter(m):
    t=float(m[1])+offset;return f'data-time="{t:.6f}"><span>{int(t)//60}:{int(t)%60:02}</span>'
html=re.sub(r'data-time="([\d.]+)"><span>[^<]*</span>',chapter,html)
html=html.replace('aria-label="视频章节">','aria-label="视频章节"><button type="button" data-time="0"><span>0:00</span>原片翻滚</button><button type="button" data-time="5.6"><span>0:05</span>贴地与倒挂</button><button type="button" data-time="9.633333"><span>0:09</span>实拍转模型</button>')
html=html.replace('5 分 16 秒','5 分 31 秒').replace('../../subtitles/v05/','../../subtitles/v06/')
html=html.replace('沿着空气和力的方向，看懂 Roadster。','先看原片，再沿着空气和力的方向看懂 Roadster。')
html=html.replace('<div class="sources">','<div class="sources"><p>V06：前 9.63 秒为 Tesla 官方演示选段，接 5 秒 Qwen 首尾帧生成转场。片头只放音乐，15.13 秒开始解说。生成转场带有角标；它用于视觉衔接。</p>')
html=html.replace('<a href="完整解说稿.md">解说稿</a>','<a href="完整解说稿.md">解说稿</a><a href="../covers/v01/index.html">四比例封面</a>')
(OUT/'preview.html').write_text(html,encoding='utf8')
shutil.copy2(old/'完整解说稿.md',OUT/'完整解说稿.md')
shutil.copy2(ROOT/'output/covers/v01/Roadster_封面_16x9.jpg',OUT/'poster.jpg')
(OUT/'本版更新.md').write_text('''# Roadster V06 · 原片开场

- 新增 9.633 秒官方选段：完整翻滚 → 贴地上坡 → 倒挂近景。这是不同演示的剪辑，未宣称同一次连续运行。
- 接入 5 秒 Qwen / Wan2.7 首尾帧生成转场，从倒挂实拍绕到三维讲解模型；全程原生 30 fps 顺序播放。
- 指定 BGM 从首帧开始连续播放；官方原声和生成音轨均未使用。讲解进入前平滑避让。
- 原 V05 旁白、画面和字幕内容保留，精确后移 439 帧；外置字幕与章节同步。
- 1920×1080 / 30 fps / 9939 帧 / 5分31.3秒。

生成转场中部为艺术化衔接，车身、轮毂与环境由实拍过渡至教学模型，不作为真实车辆运动证据。官方片段保留原始仪表信息；转场角标明确区分来源。原片来源和选帧见 research/iterations/v06/source-selection.md。

V05 与其已校验恢复包保留。V06 增量包记录新素材、处理入口、生成任务和音频偏移；恢复时配合 V05 的源包。
''',encoding='utf8')
video=OUT/'Roadster_倒挂与飞行翻滚_1080p.mp4'
if video.exists():
    meta={**c,'video':str(video.relative_to(ROOT)),'sha256':sha(video),'musicStartsAt':0,
          'originalAndGeneratedAudioUsed':False,'subtitles':str((sub/'Roadster_中文字幕.srt').relative_to(ROOT)),
          'sourceSelection':'assets/v06/official/selection-manifest.json',
          'generation':'work/v06/qwen/attempts/official-to-teaching-001/attempt.json',
          'qualityReport':'work/v06/qa/report.json','audioReport':'source/v06/work/audio/mix-report.json'}
    (OUT/'delivery.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8')
print('V06 preview, subtitles, chapters and delivery notes written.')
