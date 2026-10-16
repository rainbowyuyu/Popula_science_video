from pathlib import Path
import json,shutil,hashlib,subprocess,html
from render_covers import render
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1];D=R/'delivery/v3';Q=R/'research/v3';P=R/'public/v3';S=Path('C:/Users/zju/.codex/skills/rainbow-science-short')
# Current experiment, image provenance and physics audit are versioned beside this delivery.
render(json.loads((D/'covers/layout.json').read_text('utf8')),P/'room.png',P/'logo.png',D/'covers')
shutil.copy2(D/'covers/封面_16x9.jpg',D/'封面.jpg')
credit='“Cipher” — Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/\n原曲做了选段、乐句交叠、均衡、响度调整和旁白闪避，未改变速度或音高。'
(D/'发布文案.md').write_text('''<div style="display:flex;align-items:center;gap:17px"><img src="../../public/v3/logo.png" width="64" alt="" /><strong style="font-size:37px">rainbow鱼</strong></div>

# 标题
支架空成这样，还敢放书吗？

# 正文
同样多的材料，削成薄条，还是分散到上下？

从家里的书架出发，试一次材料的重新摆放。真实有限元计算、100轮优化和三维演示，看看那些孔洞是怎么来的。

片中约86%指特定模型中相对同用料薄条的位移降幅，不是承重提高86%。生活场景图使用Qwen生成；讲解使用rainbow鱼个人参考音色合成。

# 首评
下次看到支架里的空洞，你会先看形状，还是先问它要承受什么力？

# 配乐署名（发布时保留）
'''+credit+'\n\n# 标签\n#科普 #拓扑优化 #工程设计 #有限元 #三维动画\n',encoding='utf8')
tl=json.loads((P/'timeline.json').read_text('utf8'));mix=json.loads((Q/'mix.json').read_text('utf8'))
body=f'''# 支架空成这样，还敢放书吗？

新版约{tl['seconds']/60:.2f}分钟，1920×1080 / 30fps。故事从加装书架、挑选支架的生活问题开始，用“先削薄，再换材料位置”的尝试推动解释。68句rainbow鱼个人音色、{len(tl['captions'])}条短字幕。最长字幕22字。

## 品牌与视觉

使用用户提供的PNG Logo，右侧并排“rainbow鱼”，左上角常驻；透明处理只去白底，保持轮廓和比例。1080短边基准：左64、上48、图高90、间距20、字号44。删掉小字标语、工具页脚和微型图例。关键字68—112px，字幕48px，必要标签36px以上。该片采用浅色工程工作室、木色书架和金属材质；技能不固定下一部影片的配色。四比例封面位于covers目录，均为独立排版的sRGB JPG。

摄影机采用连续端点和缓入缓出，削薄、孔洞显露、位移参照线和数据回放按叙述发生。网页与成片共用Three.js模型和真实实验结果。实体光滑表面采用密度等值线重建，原始网格回放仍能查看。

红色荷载尖端绑定右上三个受力节点的合力位置及其显示位移，零件转动时应用同一局部变换，箭头仍表示向下作用力。显示点沿网格轮廓内移0.05场景单位，贴合等值线表面。30个变形、旋转、尺度、镜头交接及乱序定位状态通过坐标回归检查，记录见research/v3/load-attachment-check.json。

## 解说与音频

本地Qwen3-TTS-0.6B使用既有rainbow鱼参考音频，全片重新合成；没有使用上一版Cherry音色。原始句源、实际采样参数、随机种子和参考哈希保留。个人参考留在TTS本地工程，不复制到技能或交付目录。

处理使用新模块D:/python_project/tts/broadcast_voice.py：温和低切、3dB固定降噪、低中频整理、轻去齿音及软压缩；测量并补偿滤镜延迟。保留原始采样时长、辅音与字尾，不变速、不变调、不硬门限。合成错误不能靠滤镜修正。

音乐更换为Cipher，电钢琴、合成器和轻打击乐；按乐句交叠延展，密集解释时降低音乐。人声与音乐活跃区间RMS差约{mix['narrationAboveMusicActiveRmsDb']:.1f}dB，WAV母带约{mix['master']['input_i']}LUFS，最终AAC另行复测。

“播音级”是制作目标，没有声称已获声音认证。ASR覆盖全部68句，关键数字已核对；不是完整人工复听。字幕以内文和ASR词时间匹配定位，未匹配字作插值，不能称为逐音素强制对齐。

## 实验条件与边界

400×200×8mm铝板，E=70000MPa，泊松比0.3，左侧固定，右上三个节点平分100N向下载荷。80×40个Q4平面应力单元，体积35%，SIMP三次惩罚、2.5单元灵敏度过滤、OC更新，100轮优化。

- 实心板位移：0.00769013mm。
- 同用料薄条：0.13615023mm。
- 优化密度场：0.01946323mm。
- 对薄条位移降幅：85.70%，不是强度或最大承重提高。

数值残差、反力平衡、双载荷线性以及梁理论对照已留档。变形画面放大200倍；迭代间插值只是展示。实体重建没有另做强度认证；断裂、疲劳、连接和制造必须另外验证。网页是预计算回放，不伪装实时求解。

## 资料与配乐

讲解检索与改写记录在research/v3/讲解检索与改写.md。实际读取Formlabs主题讲解；叙事研究只获取Dahlstrom论文元数据及摘要，不声称读过无法访问的全文。

方法来源：Sigmund 2001（10.1007/s001580050176）；Andreassen等2011（10.1007/s00158-010-0594-7）；Bendsøe与Sigmund1999（10.1007/s001580050069）。来源元数据已核对，代码独立实现。

## 片尾5秒：公式与论文

295.267—300.267秒展示柔度最小化与SIMP材料插值；延续工作室背景、主色和模型轮廓，约0.67秒淡入，随后停留。配乐延续并自然淡出，无新增旁白。画面形式是本片设计，不要求其他影片统一。

完整问题：min_ρ C=Fᵀu，满足K(ρ)u=F、Σρₑvₑ≤0.35V₀、0.001≤ρₑ≤1。元素弹性模量E(ρ)=E_min+ρ³(E₀−E_min)，E_min/E₀=10⁻⁶。F为结点荷载，u为位移，ρ为相对密度，vₑ为元素体积。片尾显示的是精简式，柔度最小化不等于强度认证。

1. Sigmund, O. A 99 line topology optimization code written in Matlab. Structural and Multidisciplinary Optimization 21, 120–127 (2001). https://doi.org/10.1007/s001580050176
2. Andreassen, E., Clausen, A., Schevenels, M., Lazarov, B. S. & Sigmund, O. Efficient topology optimization in MATLAB using 88 lines of code. Structural and Multidisciplinary Optimization 43, 1–16 (2011). https://doi.org/10.1007/s00158-010-0594-7

片尾短标题“99行/88行拓扑优化”为阅读摘要，正式题名见上。论文元数据保存在research/v3对应txt文件，不声称本项目复用了论文源码。

{credit}

Qwen情境图仅用于生活引入，沿用本项目已生成素材，不作为实物试验证据。本轮没有新增云API调用。

## 检查

最终技术状态见qa.json，视觉抽查及限制见review.json；二者绑定成片SHA。完整源工程、个人音色句源与混音分轨保留；新版验证后才清理旧片和可重建缓存。
'''
(D/'制作说明.md').write_text('<div style="display:flex;align-items:center;gap:17px"><img src="../../public/v3/logo.png" width="64" alt="" /><strong style="font-size:37px">rainbow鱼</strong></div>\n\n'+body,encoding='utf8')
doc='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>rainbow鱼 · 制作说明</title><style>body{max-width:1020px;margin:48px auto;padding:0 32px;font:22px/1.8 Microsoft YaHei,sans-serif;color:#193643;background:#f2f3ef}h1{font-size:44px}h2{font-size:30px;margin-top:48px}p{margin:20px 0}img{width:64px;height:auto}</style><div style="display:flex;align-items:center;gap:17px"><img src="../../public/v3/logo.png" alt=""><strong style="font-size:37px">rainbow鱼</strong></div>'
for para in body.split('\n\n'):
 if para.startswith('# '):doc+='<h1>'+html.escape(para[2:])+'</h1>'
 elif para.startswith('## '):doc+='<h2>'+html.escape(para[3:])+'</h2>'
 else:doc+='<p>'+html.escape(para).replace('\n','<br>')+'</p>'
(D/'制作说明.html').write_text(doc+'</html>',encoding='utf8')
# Listening previews are actual stems, with no assertion of human listening.
for name,src in [('rainbow鱼_人声试听',P/'narration.wav'),('开场含配乐试听',P/'master.wav')]:
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-t','24','-c:a','libmp3lame','-q:a','2',str(D/(name+'.mp3'))],check=True)
history_path=S/'references/music-history.json'
history=json.loads(history_path.read_text('utf8')) if history_path.exists() else {'policy':'Different videos use different music; same-film phrase repetition permitted. Search by title, artist, ISRC and file SHA, not filename.','records':[]}
prior=R.parent/'ai_evolution_ch02_creation/research/v16/music/sources.json'
if prior.exists():
 data=json.loads(prior.read_text('utf8'));data=data if isinstance(data,list) else data.get('tracks',[])
 for row in data:
  if not any(h.get('sha256')==row.get('sha256') for h in history['records']):history['records'].append({'video':'AI evolution chapter 2','title':row.get('title'),'artist':'Kevin MacLeod','sha256':row.get('sha256'),'status':'previously used'})
music=json.loads((Q/'music-source.json').read_text('utf8'))
assert not any(h.get('sha256')==music['sha256'] and h.get('video')!='topology_optimization' for h in history['records']),'Track already used by another video'
if not any(h.get('sha256')==music['sha256'] and h.get('video')=='topology_optimization' for h in history['records']):history['records'].append({'video':'topology_optimization','title':music['title'],'artist':music['artist'],'isrc':music['isrc'],'sha256':music['sha256'],'status':'selected and mixed','source':music['source']})
history_path.write_text(json.dumps(history,ensure_ascii=False,indent=2),encoding='utf8')
print('Branded cover, delivery documents, listening previews and music registry ready')
