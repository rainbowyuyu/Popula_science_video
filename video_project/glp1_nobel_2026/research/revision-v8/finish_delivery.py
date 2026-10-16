"""Collect the reviewed release and publication materials without changing render inputs."""
from pathlib import Path
import datetime
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[2]
DELIVERY = ROOT / 'delivery'
manifest_path = DELIVERY / 'latest-v8.json'
manifest = json.loads(manifest_path.read_text('utf8'))
qa = json.loads(Path(manifest['qa']).read_text('utf8'))
assert qa['releaseApproved'] and qa['audioVerified'] and qa['sourceStable']

def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

assert sha(Path(manifest['video'])) == manifest['videoSHA256']
notes = (ROOT / 'research/revision-v8/revision-notes.md').read_text('utf8')
notes += '''
## 实际交付与检查结果

已交付V8完整成片：14分51.267秒、1920×1080、30fps，26,738帧，20个章节；成片约183MiB。四比例封面与字幕由对应冻结版本打包，285个渲染输入文件的哈希与本次渲染一致。

完成全片解码检查，未检测到黑场。三个检查者共复看471个实际编码抽样帧，覆盖89段解说、GLUT4膜融合、GLP-1剪切与工程化、动脉进入、两处测量起身及片尾。对13段低运动提示另按5fps比对603帧，并目视检查每段起、中、末画面；它们符合讲解停留与局部动态，采样中无完全相同的相邻帧。

成片AAC与母版的179个时间窗口均为零时移匹配，最低相关系数0.9998417；实际综合响度−15.05LUFS，真峰值−1.68dBTP。该检查核实音频内容和位置，不等同人工试听，也不把有损AAC称为逐采样无损。

抽检仍记录一处轻微表现：约14分20.8秒半起身时裤腰有短暂折线感，站定后消失；未见敏感几何外露。各检查不构成对所有未抽样瞬间的零穿模保证。片中人体与微观结构的示意边界见前文。

成片SHA256：`e0bf5ce3ff401f7c7d1023d2a0916f08e0396854d7a5b671c161abc600887c80`。
详细记录：`research/revision-v8/release-qa.json`、人物与运镜检查报告、最终AAC验证报告。旧V7成片及其复现资料保留。
'''
(DELIVERY / '修订说明-V8.md').write_text(notes, 'utf8')

video = Path(manifest['video'])
subtitle = Path(manifest['subtitles'])
def link(label, p):
    return f'[{label}](<{p.as_posix()}>)'

readme = '\n'.join([
    '# 如何科学减肥？从身体调节说起', '',
    'V8完整成片，14分51秒，1080p / 30fps。栏目条保持青绿色底白字：“5分钟科普 · 血压 血糖 血脂”。“5分钟科普”为系列名，本集为扩展长片。', '',
    link('播放完整视频', video), '',
    '本轮修复发音与分句边界、手腕和握叉动作、胰腺与动脉局部定位，补回GLP-1剪切及药物结构设计，重做GLUT4上膜与摄糖示意。配乐保留指定的Lemon Tree钢琴录音，重新处理乐句拼接、旁白下的音量和片尾。', '',
    '## 发布材料', '',
    '- ' + link('四平台发布文案', DELIVERY / '发布文案-V8.md'),
    '- ' + link('带时间码解说稿', DELIVERY / '解说稿-V8.md'),
    '- ' + link('SRT字幕', subtitle),
    '- ' + link('修订说明与检查范围', DELIVERY / '修订说明-V8.md'), '',
    '## 四种比例封面', '',
    *['- ' + link(Path(x['path']).stem.split('_')[-1].replace('x', ':'), Path(x['path'])) for x in manifest['covers']], '',
    '视频已经内嵌20个章节；独立ffmetadata文件供再次剪辑使用。封面与文案另打包为“如何科学减肥_封面与文案_V8.zip”。', '',
    '完整解码与音频对齐检查通过；画面采用覆盖全篇的关键帧和密集转场抽检，具体范围见修订说明。', '',
])
(DELIVERY / '本次交付-V8.md').write_text(readme, 'utf8')
extras = [DELIVERY / n for n in ['发布文案-V8.md', '解说稿-V8.md', '修订说明-V8.md', '本次交付-V8.md']]
extras += [subtitle, DELIVERY / '如何科学减肥_从身体调节说起_V8.ffmetadata']
extras += [Path(c['path']) for c in manifest['covers']]
archive = DELIVERY / '如何科学减肥_封面与文案_V8.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in extras:
        assert p.is_file()
        z.write(p, p.relative_to(DELIVERY).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(extras)
manifest['supportingFiles'] = [{'path': str(p), 'sha256': sha(p)} for p in extras if p != subtitle]
manifest['publicationArchive'] = {'path': str(archive), 'sha256': sha(archive), 'files': len(extras)}
manifest['completedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf8')
(ROOT / 'research/revision-v8/work-status.md').write_text('''# V8 completed delivery

Full corrected render completed and was released after full decode, 471 actual encoded-frame inspections across three reviewers, low-motion follow-up, and final AAC waveform alignment.

- Delivery authority: `delivery/latest-v8.json`.
- Release evidence: `research/revision-v8/release-qa.json`.
- Video: `delivery/如何科学减肥_从身体调节说起_V8_1080p.mp4`.
- 1920×1080,30fps,26738 frames,14:51.267.
- Video SHA256: `e0bf5ce3ff401f7c7d1023d2a0916f08e0396854d7a5b671c161abc600887c80`.
- Four JPG covers, SRT,20 chapters,platform copy and revision notes delivered.
- Frozen current source remains `tmp/v8-full-corrected/frozen`;285 source hashes verified.
- V7 fallback and its snapshot remain available.

No full-frame aesthetic or subjective audio-listening certification is claimed. Any cache cleanup receipt is stored in `research/revision-v8/cleanup-result.json`.
''', 'utf8')
print(json.dumps({'videoBytes':video.stat().st_size,'archiveBytes':archive.stat().st_size,'archiveFiles':len(extras),'completed':True},ensure_ascii=True))
