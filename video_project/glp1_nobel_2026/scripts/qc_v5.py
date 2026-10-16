"""V5-only CPU ASR and word-aligned captions; imports do not load models or write.

Unprompted recognition is retained in immutable content-addressed records.
The optional domain pass is separate supporting evidence, never a replacement
for the first pass or a claim that subjective listening has been completed.
"""
import argparse
import ctypes
from datetime import datetime, timezone
import difflib
from functools import lru_cache
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import time
import unicodedata

from audio_v5_common import AUDIO, DEFAULT_STORY, RESEARCH, ROOT, TTS, read, save, sha, spoken, validate_story, within

SCHEMA = 'v5-asr-1'
MAX_UNITS = 22
DEFAULT_TIMELINE = AUDIO / 'timeline.json'
MEDICAL_TERMS = tuple(('胰高血糖素样肽一 胰高血糖素样肽-1 胰高血糖素样肽1 胰岛素抵抗 胰岛素 '
    '胰高血糖素 肠促胰素 司美格鲁肽 替尔泊肽 利拉鲁肽 二甲双胍 '
    '血管紧张素受体拮抗剂 血管紧张素转化酶抑制剂 血管紧张素 血管紧张素二 '
    '钙通道阻滞剂 钙通道阻滞药 噻嗪类利尿剂 利尿剂 他汀类药物 他汀 '
    '抗血小板药 抗凝药 血小板 凝血因子 凝血酶 纤维蛋白 '
    '低密度脂蛋白 极低密度脂蛋白 高密度脂蛋白 甘油三酯 胆固醇 脂肪酸 '
    '脂肪组织 脂肪细胞 肝细胞 肌细胞 平滑肌细胞 平滑肌 内皮细胞 '
    '贝塔细胞 β细胞 L细胞 胰岛β细胞 葡萄糖转运蛋白 葡萄糖转运体 '
    '葡萄糖 糖尿病 高血糖 低血糖 高血压 高血脂 血压 血糖 血脂 '
    '交感神经 睡眠呼吸暂停 动脉粥样硬化 冠状动脉 缺血性脑卒中 脑卒中 '
    '心肌梗死 心力衰竭 非致死性 心血管 慢性肾病 肾小球 肾小管 肾单位 '
    '随机分组 随机对照试验 安慰剂 相对风险 绝对风险 统计学 '
    '超重 肥胖 饥饿和饱腹 饮食运动指导 力量训练 亲和力 结合位点 '
    '细胞膜 受体激动剂 受体拮抗剂 纳米 微米 毫米').split())
DOMAIN_PROMPT = '生理医学与药物术语：' + '，'.join(MEDICAL_TERMS) + '，GLP-1，GIP，GLUT4，LDL，HDL，RAAS，ARB，ACEI。'
# Only semantic connectors are fallbacks. Never split at an arbitrary character.
CONNECTORS = ('但是', '而且', '并且', '因此', '所以', '同时', '不过', '接着', '随后',
              '最后', '例如', '比如', '以及', '或者', '从而', '才能', '就能', '可以',
              '需要', '通过', '如果', '因为', '对于', '而不是', '也就是', '不仅', '还会')
LATIN_TERM = re.compile(r'[A-Za-z0-9α-ωΑ-Ω][A-Za-z0-9α-ωΑ-Ω_+./%−–—-]*(?:[ \t]+[A-Za-z0-9α-ωΑ-Ω][A-Za-z0-9α-ωΑ-Ω_+./%−–—-]*)*')


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def digest_value(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def simplified(text):
    if os.name != 'nt':
        return text
    buffer = ctypes.create_unicode_buffer(len(text)*2+10)
    ok = ctypes.windll.kernel32.LCMapStringW(0x0804, 0x02000000, text, len(text), buffer, len(buffer))
    return buffer.value if ok else text


def chars(text):
    """Normalize typography only, following qc.py's reviewed pure function."""
    text = unicodedata.normalize('NFKC', simplified(text).lower())
    digits = '零一二三四五六七八九'

    def number(value, year=False):
        if '.' in value:
            a, b = value.split('.', 1)
            return number(a)+'点'+''.join(digits[int(c)] for c in b)
        if year:
            return ''.join(digits[int(c)] for c in value)
        n = int(value)
        if n < 10:
            return digits[n]
        if n < 100:
            return ('' if n//10 == 1 else digits[n//10])+'十'+(digits[n%10] if n%10 else '')
        if n < 10000:
            unit = 1000 if n >= 1000 else 100
            q, r = divmod(n, unit)
            return digits[q]+('千' if unit == 1000 else '百')+('零' if r and r < unit//10 else '')+(number(str(r)) if r else '')
        return ''.join(digits[int(c)] for c in value)

    text = re.sub(r'(\d+(?:\.\d+)?)\s*%', lambda m: '百分之'+number(m[1]), text)
    text = re.sub(r'\d+(?:\.\d+)?', lambda m: number(m.group(), text[m.end():m.end()+1] == '年' and len(m.group()) == 4), text)
    text = text.replace('β', '贝塔').replace('两', '二')
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]', '', text)


def map_times(text, words, duration):
    """Pure qc.py alignment, with ASR timestamp bounds checked before mapping."""
    heard, times = [], []
    for word in words:
        content = chars(word['text'])
        start = max(0., min(duration, float(word['start'])))
        end = max(start, min(duration, float(word['end'])))
        if not math.isfinite(start+end):
            raise ValueError('Nonfinite ASR timestamps')
        for j, char in enumerate(content):
            heard.append(char)
            times.append((start+(end-start)*j/max(1, len(content)), start+(end-start)*(j+1)/max(1, len(content))))
    target, mapping = chars(text), {}
    matcher = difflib.SequenceMatcher(None, heard, list(target), autojunk=False)
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == 'equal':
            for j in range(b1-b0):
                mapping[b0+j] = times[a0+j]
        elif tag == 'replace' and a1 > a0 and b1 > b0:
            left, right = times[a0][0], times[a1-1][1]
            for j in range(b1-b0):
                mapping[b0+j] = (left+(right-left)*j/(b1-b0), left+(right-left)*(j+1)/(b1-b0))
    anchors = sorted(mapping)
    for j in range(len(target)):
        if j in mapping:
            continue
        before, after = [k for k in anchors if k < j], [k for k in anchors if k > j]
        li, ri = before[-1] if before else -1, after[0] if after else len(target)
        left = mapping[li][1] if li >= 0 else min(duration, max(0., float(words[0]['start']) if words else .04))
        right = mapping[ri][0] if ri < len(target) else max(left, duration-.58)
        count, span = ri-li-1, max(0., right-left)
        mapping[j] = (left+span*(j-li-1)/max(1, count), left+span*(j-li)/max(1, count))
    return target, mapping, matcher.ratio()


def srt_time(frame, fps):
    ms = round(frame*1000/fps)
    hours, ms = divmod(ms, 3600000)
    minutes, ms = divmod(ms, 60000)
    seconds, ms = divmod(ms, 1000)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}'


def caption_width(text):
    return sum(.55 if ord(char) < 128 else 1 for char in text)


def protected_spans(text, extra_terms=()):
    spans = [(m.start(), m.end()) for m in LATIN_TERM.finditer(text)]
    # Numbers with a year/percentage suffix must normalize identically after splitting.
    spans.extend((m.start(), m.end()) for m in re.finditer(r'\d+(?:\.\d+)?\s*(?:%|年|万|千|百|亿)?', text))
    for term in (*MEDICAL_TERMS, *extra_terms):
        if not isinstance(term, str) or not term:
            raise ValueError('protectedTerms must contain nonempty strings')
        spans.extend((m.start(), m.end()) for m in re.finditer(re.escape(term), text, re.IGNORECASE))
    return spans


def caption_parts(text, max_units=MAX_UNITS, explicit=None, extra_terms=()):
    """Return exact original substrings and review warnings; never hard-wrap words."""
    if not isinstance(text, str) or not chars(text):
        raise ValueError('Caption requires spoken/display characters')
    if max_units <= 0:
        raise ValueError('Caption width must be positive')
    spans = protected_spans(text, extra_terms)
    safe = lambda position: not any(a < position < b for a, b in spans)
    if explicit is not None:
        if not isinstance(explicit, list) or not explicit or any(not isinstance(p, str) or not chars(p) for p in explicit):
            raise ValueError('captionParts must be a nonempty list of caption strings')
        if ''.join(explicit) != text:
            raise ValueError('captionParts do not concatenate exactly to the original caption')
        boundary = 0
        for part in explicit[:-1]:
            boundary += len(part)
            if not safe(boundary):
                raise ValueError('captionParts split a protected medical/Latin term')
        output = explicit[:]
    else:
        ends = [m.end() for m in re.finditer(r'[，。！？；：,!?;:\n]+[”’」』）)]*', text) if safe(m.end())]
        ends = sorted(set([0, *ends, len(text)]))
        phrases = [text[a:b] for a, b in zip(ends, ends[1:]) if a < b]
        output = []
        position = 0
        for phrase in phrases:
            if not chars(phrase):
                if output:
                    output[-1] += phrase
                else:
                    output.append(phrase)
                position += len(phrase)
                continue
            if caption_width(phrase) <= max_units:
                parts = [phrase]
            else:
                boundaries = {0, len(phrase)}
                for match in re.finditer('|'.join(map(re.escape, sorted(CONNECTORS, key=len, reverse=True))), phrase):
                    cut = match.start()
                    if safe(position+cut) and len(chars(phrase[:cut])) >= 4 and len(chars(phrase[cut:])) >= 4:
                        boundaries.add(cut)
                bounds = sorted(boundaries)

                @lru_cache(None)
                def best(index):
                    if index == len(bounds)-1:
                        return (0., 0), ()
                    choices = []
                    for end_index in range(index+1, len(bounds)):
                        segment = phrase[bounds[index]:bounds[end_index]]
                        cost, rest = best(end_index)
                        over = max(0., caption_width(segment)-max_units)
                        choices.append(((cost[0]+over*over, cost[1]+1), (segment, *rest)))
                    return min(choices, key=lambda choice: choice[0])

                parts = list(best(0)[1])
            if output and not chars(output[-1]):
                parts[0] = output.pop()+parts[0]
            output.extend(parts)
            position += len(phrase)
    if ''.join(output) != text or ''.join(chars(p) for p in output) != chars(text):
        raise ValueError('Caption splitting changed wording or normalized numeric tokens')
    warnings = [dict(part=i+1, text=part, units=round(caption_width(part), 2),
                     reason='overlong_without_safe_boundary' if explicit is None else 'overlong_explicit_part')
                for i, part in enumerate(output) if caption_width(part) > max_units]
    return output, warnings


def recognition_scores(expected, heard, words, take):
    target, observed = chars(expected), chars(heard)
    matcher = difflib.SequenceMatcher(None, target, observed, autojunk=False)
    edits = [dict(op=tag, expected=target[a0:a1], heard=observed[b0:b1], end=a1)
             for tag, a0, a1, b0, b1 in matcher.get_opcodes() if tag != 'equal']
    cps = len(target)/max(.01, take['rawDuration'])
    flags = []
    if matcher.ratio() < .80:
        flags.append('low_asr_match')
    if any(e['op'] == 'delete' and e['end'] >= len(target)-1 and len(e['expected']) >= 2 for e in edits):
        flags.append('possible_missing_tail')
    if take.get('rawEndpointFlag'):
        flags.append('raw_endpoint')
    if cps > 8.5 or cps < 1.7:
        flags.append('unusual_speech_rate')
    if not words or not observed:
        flags.append('no_speech_recognized')
    return dict(ratio=matcher.ratio(), flags=flags, edits=edits, charactersPerSecond=cps)


def asr_identity(domain=False):
    model_path = TTS / 'models/whisper-small'
    files = {p.relative_to(model_path).as_posix(): sha(p) for p in sorted(model_path.rglob('*')) if p.is_file()}
    if not files:
        raise ValueError(f'Missing local Whisper model: {model_path}')
    versions = {}
    for package in ['faster-whisper', 'ctranslate2', 'tokenizers']:
        versions[package] = importlib.metadata.version(package)
    options = dict(language='zh', beam_size=7 if domain else 5, word_timestamps=True,
                   vad_filter=not domain, condition_on_previous_text=False,
                   initial_prompt=DOMAIN_PROMPT if domain else None, hallucination_silence_threshold=1.0)
    identity = dict(modelPath=str(model_path), modelFilesSHA256=files, packageVersions=versions,
                    device='cpu', computeType='int8', cpuThreads=3, transcribeOptions=options,
                    normalizationVersion=2, schema=SCHEMA)
    return identity, digest_value(identity)


def safe_bytes(path, data):
    path = Path(path).resolve()
    if not any(path.is_relative_to(base.resolve()) for base in (AUDIO, RESEARCH)):
        raise ValueError(f'Refusing output outside V5: {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix+f'.{time.time_ns()}.tmp')
    temporary.write_bytes(data)
    temporary.replace(path)


def publish_index(index_path, result):
    """Preserve the exact previous index before updating a convenient current alias."""
    index_path = within(index_path, AUDIO)
    if index_path.exists():
        previous = read(index_path)
        if previous == result:
            return
        original = index_path.read_bytes()
        archive = within(index_path.parent/'archive'/index_path.stem/(hashlib.sha256(original).hexdigest()+'.json'), AUDIO)
        if not archive.exists():
            safe_bytes(archive, original)
    save(index_path, result)


def checked_take(row):
    path = within(AUDIO/'takes'/f"{row['id']}.json", AUDIO)
    if not path.exists():
        return None, 'missing_take'
    take = read(path)
    if take.get('id') != row['id'] or take.get('ttsText') != spoken(row):
        return None, 'stale_take_text'
    source = within(ROOT/take['processed'], AUDIO)
    if not source.is_file() or sha(source) != take.get('sha256'):
        return None, 'missing_or_changing_waveform'
    if not all(isinstance(take.get(k), (int, float)) and math.isfinite(take[k]) and take[k] > 0 for k in ['duration', 'rawDuration']):
        raise ValueError(f"Invalid take duration: {row['id']}")
    return (take, path, source), None


def run_asr(story_path, story, story_sha, rows, domain=False, watch=False, timeout=7200.):
    identity, identity_sha = asr_identity(domain)
    mode = 'domain' if domain else 'first'
    base = AUDIO/('asr-domain' if domain else 'asr')
    model = None
    started = time.monotonic()
    while True:
        if sha(story_path) != story_sha:
            raise ValueError('Frozen story changed during ASR')
        results, missing = [], []
        for row in rows:
            checked, reason = checked_take(row)
            if checked is None:
                missing.append(dict(id=row['id'], reason=reason))
                continue
            take, take_path, source = checked
            take_sha = sha(take_path)
            key = digest_value(dict(schema=SCHEMA, id=row['id'], mode=mode, storySHA256=story_sha,
                expected=spoken(row), sourceSHA256=take['sha256'], engineIdentitySHA256=identity_sha))
            record_path = within(base/'records'/row['id']/(key+'.json'), AUDIO)
            if record_path.exists():
                result = read(record_path)
                if any(result.get(k) != v for k, v in dict(cacheKey=key, passKind=mode, storySHA256=story_sha,
                        sourceSHA256=take['sha256'], expected=spoken(row)).items()):
                    raise ValueError(f"ASR record identity mismatch: {row['id']}")
            else:
                if model is None:
                    from faster_whisper import WhisperModel
                    model = WhisperModel(str(TTS/'models/whisper-small'), device='cpu', compute_type='int8', cpu_threads=3)
                segments, _ = model.transcribe(str(source), **identity['transcribeOptions'])
                words = [dict(text=w.word, start=w.start, end=w.end, probability=w.probability)
                         for segment in segments for w in (segment.words or [])]
                if sha(source) != take['sha256'] or sha(take_path) != take_sha or sha(story_path) != story_sha:
                    raise ValueError(f"Source/story changed during recognition: {row['id']}")
                heard = simplified(''.join(w['text'] for w in words))
                result = dict(schema=SCHEMA, id=row['id'], passKind=mode, cacheKey=key, createdAtUTC=utc_now(),
                    storySHA256=story_sha, takeStorySHA256=take.get('storySHA256'), takeMetadataSHA256=take_sha,
                    takeFile=take_path.relative_to(ROOT).as_posix(), sourceFile=source.relative_to(ROOT).as_posix(),
                    sourceSHA256=take['sha256'], rawSHA256=take.get('rawSHA256'), expected=spoken(row), heard=heard,
                    words=words, duration=take['duration'], engineIdentitySHA256=identity_sha, engine=identity,
                    recordFile=record_path.relative_to(ROOT).as_posix(), subjectiveListeningChecked=False,
                    **recognition_scores(spoken(row), heard, words, take))
                if domain:
                    first_path = AUDIO/'asr'/f"{row['id']}.json"
                    if first_path.exists():
                        first = read(first_path)
                        if first.get('storySHA256') == story_sha and first.get('sourceSHA256') == take['sha256']:
                            result['firstPass'] = {k: first.get(k) for k in ['recordFile', 'cacheKey', 'ratio', 'heard']}
                    result['limitation'] = 'Prompted medical vocabulary is supporting evidence; it does not replace the unprompted first pass.'
                # A record is written once. Source/engine/story changes get a different key.
                save(record_path, result)
                print('ASR_'+mode.upper(), row['id'], round(result['ratio'], 3), result['flags'], flush=True)
            alias = dict(result, recordSHA256=sha(record_path))
            publish_index(base/f"{row['id']}.json", alias)
            results.append(alias)
        report = dict(storySHA256=story_sha, passKind=mode, completed=len(results), total=len(rows),
            totalStoryClips=len(story['shots']), selectedIds=[r['id'] for r in rows], missing=missing,
            flagged=[{k: r[k] for k in ['id', 'flags', 'ratio', 'expected', 'heard']} for r in results if r['flags']],
            records=[{k: r[k] for k in ['id', 'sourceSHA256', 'cacheKey', 'recordFile', 'recordSHA256']} for r in results],
            engineIdentitySHA256=identity_sha, complete=len(results) == len(rows), subjectiveListeningChecked=False,
            limitation='CPU recognition screens content. Neither matching nor a vocabulary prompt certifies pronunciation or subjective listening.')
        save(RESEARCH/('domain-qa.json' if domain else 'voice-qa.json'), report)
        if len(results) == len(rows) or not watch:
            return report
        if time.monotonic()-started >= timeout:
            raise TimeoutError(f'ASR still awaits {len(missing)} takes after {timeout:g} seconds')
        time.sleep(10)


def build_captions(timeline, asr_by_id, story_by_id, story_sha, only=None, max_units=MAX_UNITS):
    """Pure caption builder: returns entries/warnings without mutating any input."""
    fps = timeline['fps']
    if not isinstance(fps, (int, float)) or not math.isfinite(fps) or fps <= 0:
        raise ValueError('Invalid timeline fps')
    if timeline.get('storySHA256') != story_sha:
        raise ValueError('Timeline does not match the frozen story')
    clips = timeline['clips']
    selected = set(only) if only is not None else {c['id'] for c in clips}
    if selected - {c['id'] for c in clips}:
        raise ValueError('Selected captions are absent from timeline')
    output, warnings = [], []
    for row in clips:
        if row['id'] not in selected:
            continue
        original = story_by_id[row['id']]
        text = original.get('caption', original['text'])
        if row.get('text') != original['text'] or row.get('caption', row['text']) != text:
            raise ValueError(f"Stale timeline text: {row['id']}")
        asr = asr_by_id[row['id']]
        if (asr.get('sourceSHA256') != row['audioSHA256'] or asr.get('storySHA256') != story_sha
                or asr.get('passKind') != 'first' or asr.get('expected') != spoken(original)):
            raise ValueError(f"Stale or prompted caption ASR: {row['id']}")
        if not asr.get('words'):
            raise ValueError(f"No first-pass word timestamps: {row['id']}")
        duration = row['voiceDurationSeconds']
        if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
            raise ValueError(f"Invalid clip audio duration: {row['id']}")
        parts, notices = caption_parts(text, max_units, original.get('captionParts'), original.get('protectedTerms', ()))
        warnings.extend(dict(clipId=row['id'], **notice) for notice in notices)
        target, mapping, ratio = map_times(text, asr['words'], duration)
        if ratio < .8:
            warnings.append(dict(clipId=row['id'], reason='low_display_alignment', ratio=ratio))
        start_frame, end_frame = row['start'], row['end']
        if not isinstance(start_frame, int) or not isinstance(end_frame, int) or end_frame-start_frame < len(parts):
            raise ValueError(f"Insufficient caption frame slots: {row['id']}")
        offset, previous_end = 0, start_frame
        for j, part in enumerate(parts):
            length = len(chars(part))
            first, last = offset, offset+length-1
            offset += length
            remaining = len(parts)-j
            start = min(max(previous_end, round(start_frame+mapping[first][0]*fps)), end_frame-remaining)
            end = min(max(start+1, round(start_frame+mapping[last][1]*fps)+3), end_frame-(remaining-1))
            # Prevent the hold at the end of this caption from consuming the next onset.
            if j+1 < len(parts):
                next_start = round(start_frame+mapping[offset][0]*fps)
                end = min(end, max(start+1, next_start))
            output.append(dict(id=f"{row['id']}-c{j+1}", clipId=row['id'], text=part, start=start, end=end,
                timingSource='V5 unprompted CPU Whisper word alignment with original display text',
                alignmentRatio=round(ratio, 4), asrCacheKey=asr.get('cacheKey'), sourceSHA256=row['audioSHA256']))
            previous_end = end
        if offset != len(target):
            raise ValueError('Caption character alignment mismatch')
    if only is not None:
        for entry in timeline.get('captions', []):
            cid = entry.get('clipId', entry['id'].split('-c')[0])
            if cid not in selected:
                output.append(dict(entry))
    output.sort(key=lambda entry: (entry['start'], entry['end'], entry['id']))
    by_id = {c['id']: c for c in clips}
    for entry in output:
        cid = entry.get('clipId', entry['id'].split('-c')[0])
        clip = by_id[cid]
        if not clip['start'] <= entry['start'] < entry['end'] <= clip['end']:
            raise ValueError('Caption outside its clip: '+entry['id'])
    if any(b['start'] < a['end'] for a, b in zip(output, output[1:])):
        raise ValueError('Overlapping caption frames')
    return output, warnings


def write_captions(timeline_path, story_path, story, story_sha, only=None, max_units=MAX_UNITS):
    timeline_path = within(timeline_path, AUDIO)
    timeline = read(timeline_path)
    before_sha = sha(timeline_path)
    story_by_id = {r['id']: r for r in story['shots']}
    clip_ids = {c['id'] for c in timeline['clips']}
    if clip_ids != set(story_by_id):
        raise ValueError('Timeline clips do not match complete story')
    selected = set(only) if only is not None else clip_ids
    asr = {}
    for sid in selected:
        index = read(within(AUDIO/'asr'/f'{sid}.json', AUDIO))
        record = within(ROOT/index['recordFile'], AUDIO/'asr')
        if sha(record) != index.get('recordSHA256'):
            raise ValueError('ASR immutable record changed: '+sid)
        original = read(record)
        if any(index.get(k) != v for k, v in original.items()):
            raise ValueError('ASR alias differs from immutable record: '+sid)
        asr[sid] = original
    entries, warnings = build_captions(timeline, asr, story_by_id, story_sha, only, max_units)
    updated = dict(timeline, captions=entries)
    srt = '\n\n'.join(f"{i+1}\n{srt_time(c['start'],timeline['fps'])} --> {srt_time(c['end'],timeline['fps'])}\n{c['text']}" for i, c in enumerate(entries))+'\n'
    if sha(story_path) != story_sha or sha(timeline_path) != before_sha:
        raise ValueError('Story/timeline changed while building captions')
    save(timeline_path, updated)
    timeline_sha = sha(timeline_path)
    for filename in ['GLP1.srt', 'GLP1-subtitles.srt']:
        safe_bytes(AUDIO/filename, srt.encode('utf-8-sig'))
    report = dict(storySHA256=story_sha, count=len(entries), overlaps=0, selectedIds=sorted(selected),
        maxClauseUnits=max_units, warnings=warnings, overlongCount=sum(w['reason'].startswith('overlong') for w in warnings),
        requiresCaptionReview=bool(warnings), timelineSHA256=timeline_sha, previousTimelineSHA256=before_sha,
        timelineFile=timeline_path.relative_to(ROOT).as_posix(), subjectiveListeningChecked=False,
        captionPolicy='Exact original text; explicit captionParts or punctuation/semantic boundaries; no hard character wrapping.')
    save(RESEARCH/'caption-report.json', report)
    # Caption-only mutation does not change any placements or waveform samples.
    for path in [AUDIO/'placements.json', RESEARCH/'audio-report.json']:
        if path.exists():
            metadata = read(path)
            if 'timelineSHA256' in metadata:
                metadata['timelineSHA256'] = timeline_sha
            if 'hashes' in metadata and 'timeline.json' in metadata['hashes']:
                metadata['hashes']['timeline.json'] = timeline_sha
            save(path, metadata)
    print('V5_CAPTIONS', len(entries), 'REVIEW_WARNINGS', len(warnings), flush=True)
    return report


def main():
    global DOMAIN_PROMPT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--story', type=Path, default=DEFAULT_STORY)
    parser.add_argument('--expected-story-sha', required=True)
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--watch-timeout', type=float, default=7200.)
    parser.add_argument('--domain', action='store_true', help='Independent prompted terminology review; first pass remains untouched')
    parser.add_argument('--domain-prompt', help='Short terminology-only prompt for --domain; included in the ASR cache identity')
    parser.add_argument('--only', default='', help='Comma-separated story IDs')
    parser.add_argument('--captions-only', action='store_true')
    parser.add_argument('--timeline', type=Path, default=DEFAULT_TIMELINE)
    parser.add_argument('--max-caption-units', type=float, default=MAX_UNITS)
    args = parser.parse_args()
    if args.domain_prompt is not None:
        if not args.domain or not args.domain_prompt.strip():
            parser.error('--domain-prompt requires --domain and nonempty terminology')
        DOMAIN_PROMPT = args.domain_prompt
    if args.captions_only and (args.domain or args.watch):
        parser.error('--captions-only cannot be combined with --domain or --watch')
    if not math.isfinite(args.watch_timeout) or args.watch_timeout <= 0 or not math.isfinite(args.max_caption_units) or args.max_caption_units <= 0:
        parser.error('Timeout and caption width must be finite and positive')
    story, story_sha = validate_story(args.story, args.expected_story_sha)
    selected = None
    if args.only:
        selected = set(args.only.split(','))
        unknown = selected-{r['id'] for r in story['shots']}
        if unknown:
            parser.error(f'Unknown shot IDs: {sorted(unknown)}')
    if args.captions_only:
        write_captions(args.timeline, args.story, story, story_sha, selected, args.max_caption_units)
        return
    rows = [r for r in story['shots'] if selected is None or r['id'] in selected]
    result = run_asr(args.story, story, story_sha, rows, args.domain, args.watch, args.watch_timeout)
    print('V5_ASR_COMPLETE', result['completed'], '/', result['total'], flush=True)
    if not result['complete']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
