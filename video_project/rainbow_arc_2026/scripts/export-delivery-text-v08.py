"""Export the accepted V08 timeline as SRT and a voice/source explanation.

This changes only delivery documents; it never edits timeline or audio.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
tl = json.loads((ROOT / 'src/timeline.json').read_text('utf8'))
seconds = tl['duration'] / tl['fps']
captions = tl['captions']
out = ROOT / 'delivery'
out.mkdir(exist_ok=True)


def timestamp(value):
    ms = round(value * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


rows = []
for i, c in enumerate(captions, 1):
    assert 0 <= c['start'] < c['end'] <= seconds
    if i > 1:
        assert c['start'] >= captions[i - 2]['end'] - .001
    rows.append(f"{i}\n{timestamp(c['start'])} --> {timestamp(c['end'])}\n{c['text']}\n")
(out / '彩虹为什么是弧形_V08.srt').write_text('\n'.join(rows), encoding='utf-8-sig')

master = ROOT / 'public/audio/master-v07.wav'
h = hashlib.sha256()
with master.open('rb') as stream:
    for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
        h.update(block)
notes = f'''# 彩虹 V08 口播与声音说明

本版沿用已接受的39段rainbow鱼旁白与自然句长，没有重新TTS，也没有通过拉伸语速来适配画面。旁白源、字尾保护、去噪/动态控制记录、ASR时间映射与分轨进入本地恢复工程。

实际母带：`public/audio/master-v07.wav`，48kHz，{seconds:.6f}秒。SHA256：`{h.hexdigest()}`。源声轨为`narration.wav`、`score.wav`、`sfx.wav`与`sfx-motion-v07.wav`；恢复包按实际当前路径保留母带。配乐《雨后追光》为本集原创F大调／D小调、6/8拍，钢琴、竖琴与温暖弦乐，单音来自CC0的VSCO 2 CE。本轮保留现有音乐，不声称重新编曲或新录配音。

SRT直接来自锁定timeline的{len(captions)}条实际字幕，使用UTF-8 BOM和毫秒时间。字幕与完整口播不同：按语义短幅拆分，实际画面统一字体、字号与底部安全区。下面仅提供句源和时间，供发布/字幕复核，不改动实际音频。

最终成片响度、真峰值、长静音与同步结果应读取`research/qa/delivery-qa-v08.json`；没有该报告时不宣称最终声音验收。数字检查不等于完整人耳试听。

## 已接受口播
'''
for c in tl['clips']:
    notes += f"\n**{c['id']}｜{c['start']:.2f}–{c['end']:.2f}秒｜{c['heading']}**\n\n{c['text']}\n"
(out / '彩虹为什么是弧形_V08_口播与声音说明.md').write_text(notes, encoding='utf8')
print(json.dumps({'version': 'V08', 'captions': len(captions), 'voiceClips': len(tl['clips']),
                  'seconds': seconds, 'masterSHA256': h.hexdigest(), 'runtimeMutations': 0}, ensure_ascii=False))
