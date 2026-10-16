"""Package the validated V20 body-regulation revision and its four covers."""
from pathlib import Path
import json
import hashlib
import shutil
from datetime import datetime, timezone
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DEL=ROOT/'delivery'
RESEARCH=ROOT/'research/revision-v20'
TITLE='一顿饭后，身体在忙什么？'
VIDEO=DEL/'一顿饭后_身体在忙什么_V20_1080p.mp4'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def record(path): return {'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path),'bytes':path.stat().st_size}
validation=json.loads(VIDEO.with_suffix('.validation.json').read_text(encoding='utf8'))
assert validation['automaticChecksPass'] and validation['fullDecodeSuccess']
assert validation['frameCorrespondence']['allFramesMatched']
assert validation['frameCorrespondence']['baseFramesMatched']==26238
assert validation['videoSHA256']==sha(VIDEO)
audio=json.loads((RESEARCH/'audio/audio-report.json').read_text(encoding='utf8'))
assert audio['allSamplesAfter9_9SecondsIdentical']
review=json.loads((RESEARCH/'visual-qa/review.json').read_text(encoding='utf8'))
assert review['openingAndJoinSampleReviewPassed']
assert review['phase']=='completed'
assert review['finalVideoSHA256']==validation['videoSHA256']
covers=[]
for ratio,size in [('16x9',(1920,1080)),('3x4',(1440,1920)),('4x3',(1920,1440)),('9x16',(1080,1920))]:
    p=DEL/f'封面-V20/一顿饭后_身体在忙什么_{ratio}.jpg'
    with Image.open(p) as im:
        assert im.size==size and im.mode=='RGB' and im.info.get('icc_profile')
    covers.append({**record(p),'ratio':ratio,'size':list(size)})

metadata=ROOT/'tmp/v20-compose-r2/chapters.ffmetadata'
shutil.copy2(metadata,DEL/'一顿饭后_身体在忙什么_V20.ffmetadata')
shutil.copy2(RESEARCH/'审核排查说明.md',DEL/'审核排查说明-V20.md')
timeline=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf8'))
text=['# '+TITLE+' · V20 解说稿','', '本集约14分51秒；保持连续人体镜头和原章节顺序。','']
for clip in timeline['clips']:
    text.extend([f'**{clip["id"]} · {clip["start"]/30:.2f}s**',clip['text'],''])
(DEL/'解说稿-V20.md').write_text('\n'.join(text),encoding='utf8')

notes='''# 一顿饭后，身体在忙什么？ · V20

用户确认本次平台提示针对 V19。已核对本地 V19 的 89 条旁白、字幕、封面和文件标题，未找到能确证的热点借势内容；平台没有给出命中时间码或字段，因此不能把旧版诺奖引子认定为这次原因，也不能保证改后获得推荐。

## 本次修改

- 片头、文件标题和四比例封面改为“一顿饭后，身体在忙什么？”，副主题“看懂血糖、血压与血脂调节”，对应整片实际内容。
- 重新合成开场：“一顿饭吃下去，血糖会升高。身体怎么把它稳住？这和血压、血脂，又有什么关系？”沿用 rainbow鱼 参考音色，7.60 秒自然时长，无加速、无截断字尾。
- 新旁白从原 0.4 秒位置开始，第二句仍在 9.9 秒进入。使用独立原配乐轨重建首段，在纯音乐间隙平滑接回；9.9 秒之后母带逐样本相同。
- 原人体模型、身体动作、镜头路线、GLP-1 剪切及后续全部机制演示保留。片头问题向上移出后，章节标题从同一个区域下方滑入，说明文字跟随展开。仅重渲染前 500 帧（16.667 秒）容纳标题与首句字幕，后续 26,238 帧沿用 V19，无再次视频编码。
- 四比例封面分别排版，保留浅色背景、青绿色白字栏目条、左上角 Logo 和 rainbow鱼。封面模型是不同尺度的机制示意，非实际等大。
- 发布文案改为日常生理问题与机制介绍，另提供可选的复核说明草稿；没有代为发布。

## 验证与范围

成片为 1920×1080、30fps、26,738帧、14分51.267秒，20个章节。完成 TypeScript 检查、全片解码、每帧与基底／替换片段的像素哈希对应、音频全长及同步检查、最终AAC响度与真峰值检查。开场字幕、标题交接与视频拼接边界进行了编码后抽帧复核；四种封面及缩略图已查看。

这不等同于本轮从头到尾人工观看和人工听审；报告保留实际检查范围。新增首句通过独立ASR核对与信号检查。完整来源、模型示意边界及现有配乐资料沿用此前交付说明。

## 复现

入口为 src/index.tsx → V5Film.tsx，时间线 src/timeline.json，有声预览使用 public/master-v20.wav。片头渲染：node scripts/render_v20_opening.mjs --out tmp/v20-opening-patches-r2；色彩信息补全：python scripts/normalize_v18_patches.py --plan tmp/v20-opening-patches-r2/plan.json --out-plan tmp/v20-opening-patches-r2/plan-bt709.json；拼接与验证：python scripts/compose_v20.py --compose --plan tmp/v20-opening-patches-r2/plan-bt709.json --work-dir tmp/v20-compose-r2。源文件锁位于 tmp/v20-opening-patches-r2/source-lock.json，对应源码快照在 frozen/。V19 成片与旧母带保留以便回退；已有已验证输出时脚本会拒绝覆盖。

本次封面和文案交付不表示平台审核通过。若平台仍给出同一提示，可以使用同目录复核说明-V20.txt，请其指明具体片段或发布字段。
'''
(DEL/'本次交付-V20.md').write_text(notes,encoding='utf8')
files=[DEL/name for name in ['发布文案-V20.md','本次交付-V20.md','审核排查说明-V20.md','复核说明-V20.txt','解说稿-V20.md','一顿饭后_身体在忙什么_V20.srt','一顿饭后_身体在忙什么_V20.ffmetadata','四比例封面-V20.zip']]
manifest={
    'version':'V20','title':TITLE,'subtitle':'看懂血糖、血压与血脂调节',
    'completedUTC':datetime.now(timezone.utc).isoformat(),'video':record(VIDEO),
    'durationSeconds':26738/30,'frames':26738,'fps':30,
    'technicalValidationPassed':True,'platformReview':'not submitted by assistant; outcome unknown',
    'videoValidation':record(VIDEO.with_suffix('.validation.json')),
    'visualReview':record(RESEARCH/'visual-qa/review.json'),
    'audioReview':record(RESEARCH/'audio/audio-report.json'),
    'master':record(ROOT/'public/master-v20.wav'),
    'sourceLock':record(ROOT/'tmp/v20-opening-patches-r2/source-lock.json'),
    'timeline':record(ROOT/'src/timeline.json'),'covers':covers,'files':[record(p) for p in files],
    'manualFullFilmPlayback':False,'subjectiveFullAudioListening':False,
    'baselineV19Preserved':True,
}
(DEL/'latest-v20.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'title':TITLE,'video':manifest['video'],'covers':len(covers),'ready':True},ensure_ascii=False))
