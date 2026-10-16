"""Deterministic topic ownership for visible creative-history messages.

This module never reads history or changes links. References are deliberately
weaker than the requested deliverable; explicit assistant output paths can
repair a stale topic inherited from an earlier turn.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import re
from typing import Iterable, Mapping


Match = tuple[str, float, str]
MAPPING_VERSION = 'contextual-topics-v3-visible-only'


@dataclass(frozen=True)
class MatchDecision:
    match: Match | None
    explicit: bool = False
    reset: bool = False
    editor: bool = False
    references: tuple[str, ...] = ()


_EXTRA_ALIASES = {
    'zju_marine_ep01': ('浙江大学新能源', '浙大新能源', '浙江大学·海洋新能源',
                         '浙江大学 · 海洋新能源', '海洋新能源', '海洋风电总览',
                         '海洋可再生能源'),
    'ai_evolution_ch01_vision_choice': ('视觉与选择',),
    'ai_evolution_ch02_creation': ('从识别走向创造', '生成与创造'),
    'ai_evolution_ch03_language': ('语言与理解',),
    'ai_evolution_ch04_space_time': ('空间与时间',),
    'ai_evolution_ch05_reasoning_agents': ('推理与智能体',),
    'beso_ai_research_2026': ('beso-ai', 'beso ai'),
}
_REFERENCE = re.compile(r'参考|借鉴|借助|沿用|复用|对照|之前(?:的)?|原来(?:的)?|历史|'
                        r'\breference\b|\bbased on\b|\bsimilar to\b', re.I)
_TARGET = re.compile(r'制作|生成|重做|改做|做(?:一)?(?:期|个)|切换到|介绍|'
                     r'(?:主题|标题)(?:写|叫|是|为)|'
                     r'(?:当前|本次|此次)(?:工程|项目)|工程(?:目录|路径)|'
                     r'输出(?:在|到|[:：])|交付(?:在|到|[:：])|已(?:生成|完成)|完成了|'
                     r'保存(?:到|在)|\bcurrent project\b|\boutput\b', re.I)
_NEW_TOPIC = re.compile(r'(?:做|制作)(?:一|1)(?:期|集)|换(?:一?个)?主题|'
                        r'第[一二三四五六七八九十\d]+集选取|'
                        r'(?:制作|生成|改做).{0,12}第[一二三四五六七八九十\d]+章')
_EDITOR = re.compile(r'\bexe\b|cc\s*switch|工作台|工程栏|'
                     r'上下文.{0,8}(?:滑块|旋钮)|deepseek harness|阶段达到调用上限', re.I)
_CHAPTER = re.compile(r'第\s*([一二三四五六七八九十\d]+)\s*章')
_NUMBERS = dict(zip('一二三四五六七八九十', range(1, 11)))
_UUID = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.I)


def _text(value: str) -> str:
    value = str(value or '')
    if '## My request:' in value:
        value = value.split('## My request:', 1)[1]
    for tag in ('in-app-browser-context', 'environment_context', 'app-context',
                'skills_instructions', 'instructions'):
        value = re.sub(r'<'+tag+r'\b[^>]*>.*?</'+tag+r'>', '', value, flags=re.I | re.S)
    if value.lstrip().startswith('# AGENTS.md instructions'):
        return ''
    value = _UUID.sub(' ', value)
    value = re.sub(r'(?im)^.*codex-clipboard-[^\r\n]*$', '', value)
    return value.casefold().replace('\\', '/')


def _folder(project: Mapping) -> str:
    return str(project.get('folder') or project.get('path', '').replace('\\', '/').rstrip('/').split('/')[-1]).casefold()


def _occurrences(word: str, text: str):
    word = word.casefold().replace('\\', '/')
    if not word:
        return []
    # ASCII labels must be whole identifiers, not UUID fragments/version prefixes.
    prefix = r'(?<![a-z0-9_-])' if word[0].isascii() and word[0].isalnum() else ''
    suffix = r'(?![a-z0-9_-])' if word[-1].isascii() and word[-1].isalnum() else ''
    return list(re.finditer(prefix + re.escape(word) + suffix, text))


@lru_cache(maxsize=64)
def _reference_regions(text: str) -> tuple[tuple[int, int], ...]:
    """Keep a reference heading's meaning across line breaks and child headings."""
    headings = [(m.start(), m.end(), len(m.group(1)), m.group(2))
                for m in re.finditer(r'(?m)^(#{1,6})\s+([^\n]+)', text)]
    headings += [(m.start(), m.end(), 1, m.group(0)) for m in re.finditer(
        r'(?m)^(?:已知会话发现|可复用项目|历史工程|参考项目)[：:]?\s*$', text)]
    headings.sort()
    regions = []
    for index, (start, end, level, label) in enumerate(headings):
        if not re.search(r'复用|参考|历史|已知会话发现|之前.{0,8}(?:工程|项目)', label):
            continue
        stop = next((h[0] for h in headings[index + 1:] if h[2] <= level), len(text))
        regions.append((end, stop))
    return tuple(regions)


def _context(text: str, start: int, end: int) -> tuple[bool, bool]:
    """Return (reference-only, explicit target) for a particular mention."""
    if any(lo <= start < hi for lo, hi in _reference_regions(text)):
        return True, False
    beginning = max(text.rfind(char, 0, start) for char in '\n。；;!?！？”') + 1
    before = text[max(beginning, start - 100):start]
    after = text[end:end + 24]
    refs, targets = list(_REFERENCE.finditer(before)), list(_TARGET.finditer(before))
    ref_at = refs[-1].start() if refs else -1
    target_at = targets[-1].start() if targets else -1
    # Negated/parked projects are context, not the requested new subject.
    parked = bool(re.match(r'\s*(?:这一期)?\s*(?:先放下|先不做|不做了|作为参考|做参考|仅供参考)', after))
    return parked or ref_at > target_at, not parked and target_at >= 0 and target_at > ref_at


def _active_id(active) -> str | None:
    if isinstance(active, str):
        return active
    if active:
        return active[0]
    return None


def _aliases(project: Mapping, catalog: list[Mapping]) -> list[str]:
    folder = _folder(project)
    aliases = list(project.get('aliases', []))
    for base, extra in _EXTRA_ALIASES.items():
        if folder == base or folder.startswith(base + '_v'):
            aliases.extend(extra)
    # The research-assets folder is a source, while BESO is the actual film.
    primary = next((p for p in catalog if _folder(p) == 'beso_ai_research_2026'), None)
    engineer = ('ai engineer', 'ai工程师', 'ai 工程师')
    if primary and project['id'] == primary['id']:
        aliases.extend(engineer)
    elif primary and folder == 'ai_engineer_science':
        aliases = [a for a in aliases if str(a).casefold() not in engineer]
    return list(dict.fromkeys(str(a) for a in aliases if a))


def _chapter_match(text: str, catalog: list[Mapping], active) -> Match | None:
    current = next((p for p in catalog if p['id'] == _active_id(active)), None)
    family = bool(current and _folder(current).startswith('ai_evolution_'))
    family = family or bool(re.search(r'ai\s*进化|人工智能.{0,8}(?:进化|系列)', text))
    if not family:
        return None
    chapters = []
    for item in _CHAPTER.finditer(text):
        reference, target = _context(text, *item.span())
        if reference:
            continue
        token = item.group(1)
        number = int(token) if token.isdigit() else _NUMBERS.get(token)
        if number is not None:
            chapters.append((number, target))
    directed = [n for n, directed in chapters if directed]
    numbers = set(directed or [n for n, _ in chapters])
    if len(numbers) != 1:
        return None
    number = numbers.pop()
    choices = [p for p in catalog if re.match(r'ai_evolution_ch0*'+str(number)+r'_', _folder(p))]
    if len(choices) > 1:
        # Preserve a named version line when moving among chapters.
        suffix = re.search(r'(_v\d+)$', _folder(current)) if current else None
        preferred = [p for p in choices if _folder(p).endswith(suffix.group(1))] if suffix else []
        if len(preferred) == 1:
            choices = preferred
        else:
            choices = [p for p in choices if not re.search(r'_v\d+$', _folder(p))]
    if len(choices) == 1:
        return choices[0]['id'], .93, f'AI进化系列第{number}章（连续上下文）'
    return None


def match_message(text: str, catalog: Iterable[Mapping], role='user', active=None) -> MatchDecision:
    """Resolve one visible message; pass ``decision.match`` as the next active.

    ``explicit`` distinguishes a real clue from low-confidence continuity.
    ``reset`` blocks inheritance across an unknown new topic/editor request.
    An editor reset should remain gated by the caller until a user selects a
    video topic again. No filesystem/project existence is inferred here.
    """
    catalog = list(catalog)
    text = _text(text)
    candidates = {}
    references = set()
    for project in catalog:
        pid, folder = project['id'], _folder(project)
        mentions = []
        path = str(project.get('path') or '').replace('\\', '/').rstrip('/').casefold()
        # Full paths and exact directory names are stronger than prose aliases.
        for word, weight, reason in ((path, 110, '明确工程路径'), (folder, 100, '明确工程目录')):
            if len(word) < 4:
                continue
            for occurrence in _occurrences(word, text):
                reference, target = _context(text, *occurrence.span())
                if reference:
                    references.add(pid)
                else:
                    mentions.append((weight + (40 if target else 0), reason))
        for alias in _aliases(project, catalog):
            for occurrence in _occurrences(alias, text):
                reference, target = _context(text, *occurrence.span())
                if reference:
                    references.add(pid)
                else:
                    mentions.append((50 + (40 if target else 0), '明确主题：' + alias))
        if mentions:
            candidates[pid] = max(mentions)
    references.difference_update(candidates)
    refs = tuple(sorted(references))
    ranked = sorted(((score, pid, reason) for pid, (score, reason) in candidates.items()), reverse=True)
    explicit = None
    if ranked and (len(ranked) == 1 or ranked[0][0] > ranked[1][0]):
        score, pid, reason = ranked[0]
        explicit = (pid, .98 if score >= 100 else .9, reason)
        # An assistant can discuss another subject inside a film. A bare topic
        # mention is insufficient to replace the user's selected project.
        if (role == 'assistant' and _active_id(active) and pid != _active_id(active)
                and score < 100 and not re.search(
                    r'(?:本次|当前|此次)(?:工程|项目|视频|主题)|(?:视频|本片)主题(?:是|为|[:：])', text)):
            explicit = None
    chapter = _chapter_match(text, catalog, active)
    if chapter and (not explicit or ranked[0][0] < 100):
        explicit = chapter
    editor = role == 'user' and bool(_EDITOR.search(text)) and not explicit
    if explicit:
        return MatchDecision(explicit, explicit=True, references=refs)
    reset = role == 'user' and (editor or bool(_NEW_TOPIC.search(text)))
    if reset:
        return MatchDecision(None, reset=True, editor=editor, references=refs)
    if _active_id(active) and any(p['id'] == _active_id(active) for p in catalog):
        return MatchDecision((_active_id(active), .68, '同一主题的连续迭代（自动推断，可纠正）'), references=refs)
    return MatchDecision(None, references=refs)


def match(text: str, catalog: Iterable[Mapping]) -> Match | None:
    """Compatibility helper for title/cwd lookup without inherited context."""
    return match_message(text, catalog).match
