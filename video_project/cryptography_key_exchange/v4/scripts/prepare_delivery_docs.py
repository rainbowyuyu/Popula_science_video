"""Publish the frozen story text and timed subtitles without editorial rewriting."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SCENE_NAMES = {
    'opening': '一张生日蛋糕订单',
    'encrypt': '让中途的数据读不懂',
    'exchange': '没约过密码，怎么得到共同秘密',
    'auth': '确认另一头真的是蛋糕店',
    'delivery': '数据被改过，就拒收',
    'ending': '把惊喜送到妈妈身边',
}


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def timecode(seconds):
    millis = round(seconds * 1000)
    return f'{millis // 60000:02d}:{millis // 1000 % 60:02d}.{millis % 1000:03d}'


def main():
    story = read('src/story.json')
    narration = read('src/narration.json')
    by_id = {cue['id']: cue for cue in narration['cues']}
    assert len(by_id) == len(story['cues'])
    output = ROOT / 'delivery'
    output.mkdir(exist_ok=True)
    lines = [
        f'# {story["title"]}', '', story['subtitle'], '',
        f'V4 · 成片 {narration["durationSec"]:.3f} 秒 · {narration["fps"]} fps · {len(story["cues"])} 句', '',
        '下文逐字取自 src/story.json 的 text 字段；时间来自最终录音时间线。显示文字保持“密钥”，发音专用同音输入不写进公开稿。', '',
    ]
    previous_scene = None
    for cue in story['cues']:
        timed = by_id[cue['id']]
        assert timed['text'] == cue['text'], f'Story/narration mismatch: {cue["id"]}'
        if cue['scene'] != previous_scene:
            lines.extend([f'## {SCENE_NAMES[cue["scene"]]}', ''])
            previous_scene = cue['scene']
        lines.extend([
            f'**{cue["id"]} · {timecode(timed["startSec"])}–{timecode(timed["endSec"])}**', '',
            cue['text'], '',
        ])
    script = output / '解说稿_没约过密码消息怎么保密.md'
    script.write_text('\n'.join(lines), encoding='utf-8')
    subtitle = output / '字幕_没约过密码消息怎么保密.srt'
    source_subtitle = ROOT / 'work/audio/subtitles.srt'
    shutil.copyfile(source_subtitle, subtitle)
    assert digest(subtitle) == digest(source_subtitle)
    report = {
        'version': 'V4', 'cueCount': len(story['cues']),
        'sourceStorySha256': digest(ROOT / 'src/story.json'),
        'sourceNarrationSha256': digest(ROOT / 'src/narration.json'),
        'script': script.relative_to(ROOT).as_posix(), 'scriptSha256': digest(script),
        'scriptVerbatimFromStoryText': True,
        'subtitle': subtitle.relative_to(ROOT).as_posix(), 'subtitleSha256': digest(subtitle),
        'subtitleExactCopy': True,
        'scope': 'Delivery text verification only; final MP4 quality is recorded separately.',
    }
    (output / '文本交付核对.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    import sys
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
