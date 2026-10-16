"""V5-only paths and provenance. Importing never loads a model or writes files."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'audio/revision-v5'
RESEARCH = ROOT / 'research/revision-v5'
TTS = Path('D:/python_project/tts')
DEFAULT_STORY = ROOT / 'docs/story-v5.json'
SR = 48000
FPS = 30
SAMPLES_PER_FRAME = SR // FPS
CUES = {'warm', 'mechanism', 'action', 'evidence', 'reflect', 'resolve'}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def within(path, base):
    path = Path(path).resolve()
    if not path.is_relative_to(Path(base).resolve()):
        raise ValueError(f'Output escapes V5 directory: {path}')
    return path


def save(path, value):
    path = Path(path).resolve()
    if not any(path.is_relative_to(base.resolve()) for base in (AUDIO, RESEARCH)):
        raise ValueError(f'Refusing output outside V5 directories: {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


# A small pronunciation pass for the rainbow鱼 narrator.  Captions keep the
# medically precise wording from the story, while the spoken take uses clear
# synonyms where the character “长” can be read in two ways by a voice model.
# This keeps the sentence natural for older listeners and avoids injecting
# pinyin or parenthetical stage directions into the recording.
PRONUNCIATION_OVERRIDES = {
    'h009': '一直能量过剩、活动少，再加上遗传等因素，有些人的肌肉和肝脏，对胰岛素的反应会越来越弱。',
    'h027': '后来，一些药物通过改变分子结构，把作用时间拉得更久，同时保留激活受体的能力。司美格鲁肽就是这类药的一种。',
    'h033': '糖接走了，食物里的脂肪也在运输。如果一段时间里，吃进来的能量多于用掉的，脂肪会逐渐存起来，有些还会积到肝脏里。',
    'h038': '当L D L在血中持续偏多，就更容易进入并滞留在动脉壁里。问题从管壁内部开始，日积月累，才形成斑块。',
    'h039': '免疫细胞吞下这些脂质，装得越来越多，形成泡沫细胞。局部炎症和组织变化，也让这块斑块慢慢堆积起来。',
    'h055': '失血、缺水时，这套办法有用；可它持续偏活跃，血管一直收紧、水钠留得多，血压就更难降下来。',
    'h057': '交感神经一兴奋，心脏会加把劲，一些血管也会收紧。总是睡不好、反复缺氧等问题，也会增加调节负担。',
    'h069': '斑块在管壁里慢慢堆积；血栓，则是血液在不该凝固的地方结成一团。有时，危险就发生在两者接上的那一刻。',
    'h071': '同时，纤维蛋白像细丝一样织成网，把血细胞和血小板固定住。血块越聚越大，就可能突然堵住血流。',
    'h074': '这时需要考虑的抗凝药，作用在凝血过程中的不同环节，减少血栓形成或继续扩大的机会，和抗血小板药用途有区别。',
}


def spoken(row):
    return PRONUNCIATION_OVERRIDES.get(row.get('id'), row.get('ttsText', row['text']))


def validate_story(path, expected_sha=None):
    path = Path(path).resolve()
    digest = sha(path)
    if expected_sha and digest != expected_sha.lower():
        raise ValueError(f'Story hash changed: expected {expected_sha}, received {digest}')
    story = read(path)
    rows = story.get('shots', [])
    if not rows:
        raise ValueError('Story requires nonempty shots array')
    ids = []
    for row in rows:
        sid = row.get('id', '')
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{1,63}', sid):
            raise ValueError(f'Unsafe or missing shot id: {sid!r}')
        ids.append(sid)
        for field in ['text', 'section']:
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError(f'{sid}: nonempty {field} required')
        if not isinstance(spoken(row), str) or not spoken(row).strip():
            raise ValueError(f'{sid}: empty ttsText')
        if 'caption' in row and (not isinstance(row['caption'], str) or not row['caption'].strip()):
            raise ValueError(f'{sid}: invalid display caption')
        if row.get('musicCue', 'mechanism') not in CUES:
            raise ValueError(f'{sid}: unknown musicCue')
        pause = row.get('pauseAfterSeconds', .20)
        if not isinstance(pause, (int, float)) or not 0 <= pause <= 3:
            raise ValueError(f'{sid}: pauseAfterSeconds must be between 0 and 3')
    if len({sid.casefold() for sid in ids}) != len(ids):
        raise ValueError('Duplicate shot ids')
    return story, digest
