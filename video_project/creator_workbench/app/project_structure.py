"""Normalize video project routes without relocating render dependencies.

The manifest is an index of real paths, not a second copy of large assets. Scans
are bounded and never follow links. Applying only creates canonical directories
and two owned metadata files; source trees and existing deliveries remain intact.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import threading
import uuid


SCHEMA = 2
GENERATED_BY = 'rainbow-project-structure-v2'
MANIFEST = '.studio/structure-v2.json'
GUIDE = '.studio/PROJECT_STRUCTURE.md'
DIRECTORIES = {
    'source': '源码、镜头表、场景与可重渲染入口',
    'assets': '稳定模型、图片、字体和来源记录',
    'audio': '原始旁白、背景音乐、最终混音',
    'subtitles': '字幕源句、时间码和最终字幕',
    'covers': '各画幅封面、布局与发布文案',
    'output': '完整成片和发布文件；验收后登记当前版本',
    'work': '可再生成的预览、抽帧、缓存与试验',
    'references': '论文、参考视频、授权和风格观察',
    '.studio': '工程设置、修改记录、目录索引和当前版本清单',
}
ALIASES = {
    'source': {'source', 'src', 'sources', 'scripts', 'scene', 'scenes', 'manim', 'tools', 'viewer'},
    'assets': {'assets', 'asset', 'public', 'models', 'model', 'blender', 'artwork', 'fonts', 'data', 'lux3d', 'content'},
    'audio': {'audio', 'audios', 'music', 'voice', 'narration'},
    'subtitles': {'subtitles', 'captions'},
    'covers': {'covers', 'cover', 'cover_artwork', '封面'},
    'output': {'output', 'outputs', 'delivery', 'deliverables', 'publish', 'publication', 'renders', 'videos'},
    'work': {'work', 'tmp', 'temp', 'cache', 'caches', 'qa', 'build', 'bundle', 'dist', 'frames'},
    'references': {'references', 'research', 'docs', 'experiments'},
    '.studio': {'.studio'},
}
SKIP = {'node_modules', 'vendor', '.vendor', '.git', '__pycache__', 'site-packages', 'checkpoints'}
SOURCE_EXT = {'.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.glsl', '.vert', '.frag', '.ipynb', '.ps1'}
MARKERS = {'package.json', 'package-lock.json', 'pyproject.toml', 'tsconfig.json', 'remotion.config.ts', 'remotion.config.js', 'manim.cfg'}
TEMP_NAME = re.compile(r'^(?:tmp|temp|cache|qa|preview|inspect|test)[-_]', re.I)
VERSION = re.compile(r'^(?:v\d|versions?$|release|final|最终|成片|最新)', re.I)
SECRET = re.compile(r'^\.env(?:$|\.)|(?:credentials?|secrets?|api[-_]?keys?|auth)\.(?:json|toml|ya?ml)$|^id_(?:rsa|ed25519)|\.pem$', re.I)


def _link(path: Path) -> bool:
    st = path.lstat()
    return stat.S_ISLNK(st.st_mode) or bool(getattr(st, 'st_file_attributes', 0) & 0x400)


def _safe(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or '\x00' in relative:
        raise ValueError('目录索引路径无效')
    name = Path(relative)
    if name.is_absolute() or name.drive or '..' in name.parts:
        raise ValueError('目录索引只允许当前工程内的相对路径')
    if not root.is_dir() or _link(root):
        raise ValueError('不跟随工程链接或目录联接')
    cursor = root
    for part in name.parts:
        if ':' in part or part.endswith((' ', '.')) or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', part, re.I):
            raise ValueError('目录名包含系统保留名称')
        cursor /= part
        if os.path.lexists(cursor) and _link(cursor):
            raise ValueError('目录索引不跟随链接或目录联接')
    if not cursor.resolve().is_relative_to(root.resolve()):
        raise ValueError('目录索引路径超出工程')
    return cursor


def _category(name: str) -> str | None:
    lower = name.lower()
    for category, aliases in ALIASES.items():
        if lower in aliases:
            return category
    if re.match(r'^(?:output|outputs|delivery|publish)[-_]', lower):
        return 'output'
    if re.match(r'^(?:cover|covers)[-_]', lower):
        return 'covers'
    if TEMP_NAME.match(lower):
        return 'work'
    return None


def _read_json(path: Path, max_bytes: int = 2000000) -> dict:
    try:
        if path.stat().st_size > max_bytes:
            return {}
        value = json.loads(path.read_text(encoding='utf-8-sig'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _atomic_owned(root: Path, relative: str, text: str, *, json_file: bool) -> bool:
    path = _safe(root, relative)
    if path.exists():
        if not path.is_file():
            raise ValueError(f'索引目标不是文件：{relative}')
        old = path.read_text(encoding='utf-8')
        owned = _read_json(path).get('generatedBy') == GENERATED_BY if json_file else old.startswith(f'<!-- {GENERATED_BY} -->')
        if not owned:
            raise ValueError(f'保留同名用户文件，请先处理目录索引冲突：{relative}')
        if old == text:
            return False
    temporary = _safe(root, relative + '.pending-' + uuid.uuid4().hex)
    try:
        with temporary.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(text)
        # Recheck after writing: a replaced parent may now be a junction.
        _safe(root, relative)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return True


def _guide(report: dict) -> str:
    lines = [f'<!-- {GENERATED_BY} -->', '# 工程目录导航', '',
             f"工程：{report['name']}", '',
             '本文件由工作台生成。新内容按下面的规范保存；修改已有场景时沿用其真实源码和素材路径。',
             '目录是导航索引，不复制大型媒体，也不移动渲染依赖。', '',
             '| 用途 | 新文件目录 | 已存在的兼容目录 |', '|---|---|---|']
    for key, label in DIRECTORIES.items():
        legacy = [f'`{p}`' for p in report['routes'][key]['existing'] if p != key]
        lines.append(f"| {label} | `{key}/` | {'、'.join(legacy) or '—'} |")
    lines += ['', '## 当前交付物', '', '“最新”表示媒体索引选中的版本，不自动代表通过完整质量验收。', '']
    for item in report['currentMedia']:
        lines.append(f"- {item['kind']} {item.get('ratio') or ''}：`{item['path']}`")
    if not report['currentMedia']:
        lines.append('- 当前未找到可预览的完整成片或规范封面。')
    lines += ['', '## 可重渲染入口', '']
    lines.extend(f'- `{path}`' for path in report['engineRoots'])
    if not report['engineRoots']:
        lines.append('- 未识别到构建入口；请保留当前素材并补充渲染说明。')
    lines += ['', '## 命名和版本', '',
              '- 工程文件夹和稳定 ID 保持不变；系列名称、集数和显示名称通过工作台设置。',
              '- 新成片：`output/v003/主题_v003_1080p.mp4`。新封面：`covers/v003/主题_v003_16x9.jpg`。',
              '- 同版本画幅使用 `16x9`、`9x16`、`3x4`、`4x3`、`1x1`，不重复加入“最终最终”等字样。',
              '- 旁白、配乐、混音分放 `audio/narration`、`audio/bgm`、`audio/master`。',
              '- 文案按平台存入 `covers/copy`；镜头和时间线存入 `source`；试渲染和抽帧存入 `work`。',
              '- 升级已有引擎时继续使用其 `src/public/scripts` 等现有路径；不要为迁移目录盲改导入。',
              '- `.studio/current-release.json` 登记已验收成片与依赖。清理中间文件必须走工作台清理扫描。',
              '- 保留最新可重渲染版本及一个回退版本；目录规范化本身不删除、不改名、不搬动文件。', '',
              '## 仍需人工或工具核验的旧布局', '']
    for finding in report['findings']:
        lines.append(f"- {finding['message']}")
    if not report['findings']:
        lines.append('- 当前未发现目录级问题。')
    lines += ['', f"详细路径和保护清单：`{MANIFEST}`。", '']
    return '\n'.join(lines)


class ProjectStructure:
    def __init__(self, library, *, max_entries: int = 12000):
        self.library = library
        self.max_entries = max(10, int(max_entries))
        self.lock = threading.RLock()

    def scan(self, project_id: str) -> dict:
        project = self.library.project(project_id)
        root = Path(project['path']).absolute()
        _safe(root, '.studio')
        routes = {key: {'preferred': key, 'description': label, 'existing': []} for key, label in DIRECTORIES.items()}
        roots, skipped, loose, protected, conflicts = [], [], [], [], []
        seen, count, truncated = set(), 0, False
        # Existing engine roots come from the bounded library discovery. Only
        # direct children of those roots and wrapper folders need enumeration.
        pending = [(root, 0)]
        for raw in project.get('sourceRoots', []):
            try:
                relative = Path(raw).absolute().relative_to(root).as_posix()
                engine = _safe(root, relative or '.')
                if engine.is_dir():
                    roots.append(relative or '.')
                    pending.append((engine, 0))
            except (ValueError, OSError):
                skipped.append({'path': str(raw), 'reason': '外部或链接的源码入口不进入扫描'})
        while pending and count < self.max_entries:
            directory, depth = pending.pop(0)
            rel = directory.relative_to(root).as_posix()
            if rel in seen:
                continue
            seen.add(rel)
            try:
                _safe(root, rel)
                with os.scandir(directory) as scan:
                    entries = sorted(scan, key=lambda e: e.name.casefold())
            except OSError:
                skipped.append({'path': rel, 'reason': '目录不可读'})
                continue
            for entry in entries:
                count += 1
                if count > self.max_entries:
                    truncated = True
                    break
                path = Path(entry.path)
                relative = path.relative_to(root).as_posix()
                try:
                    attrs = entry.stat(follow_symlinks=False)
                    if entry.is_symlink() or bool(getattr(attrs, 'st_file_attributes', 0) & 0x400):
                        skipped.append({'path': relative, 'reason': '链接或目录联接，未跟随'})
                        continue
                    lower = entry.name.lower()
                    if lower in SKIP or lower.startswith(('.venv', 'node_modules')) or SECRET.search(lower):
                        skipped.append({'path': relative, 'reason': '依赖、缓存或私有配置，未展开'})
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        category = _category(lower)
                        if category:
                            routes[category]['existing'].append(relative)
                            # Public/source assets may contain real audio/covers;
                            # probe named subfolders, never walk their contents.
                            for child_name, child_category in [('audio', 'audio'), ('covers', 'covers'), ('subtitles', 'subtitles')]:
                                child_relative = (Path(relative) / child_name).as_posix()
                                try:
                                    child = _safe(root, child_relative)
                                    if child.is_dir():
                                        routes[child_category]['existing'].append(child_relative)
                                except (ValueError, OSError):
                                    skipped.append({'path': child_relative, 'reason': '子目录是链接，未跟随'})
                        elif depth < 3 and (VERSION.match(lower) or lower in {'project', 'runtime'}):
                            pending.append((path, depth + 1))
                    elif entry.is_file(follow_symlinks=False):
                        if entry.name in MARKERS:
                            roots.append(rel)
                            # Small config hashes prove normalization preserved
                            # imports/build roots without hashing large media.
                            if attrs.st_size <= 2000000:
                                protected.append({'path': relative, 'size': attrs.st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                        if directory == root and (TEMP_NAME.match(entry.name) or path.suffix.lower() in SOURCE_EXT):
                            loose.append({'path': relative, 'kind': 'temporary-name' if TEMP_NAME.match(entry.name) else 'root-source', 'size': attrs.st_size, 'action': 'indexed-in-place'})
                except OSError:
                    skipped.append({'path': relative, 'reason': '扫描时文件已变化或不可读'})
        if pending:
            truncated = True
        missing = []
        for key in DIRECTORIES:
            try:
                path = _safe(root, key)
                if not path.exists():
                    missing.append(key)
                elif not path.is_dir():
                    conflicts.append({'path': key, 'reason': '规范目录位置已被文件占用'})
            except ValueError as exc:
                conflicts.append({'path': key, 'reason': str(exc)})
            routes[key]['existing'] = sorted(set(routes[key]['existing']))
        for relative in (MANIFEST, GUIDE):
            try:
                path = _safe(root, relative)
                if path.exists():
                    if not path.is_file():
                        conflicts.append({'path': relative, 'reason': '索引文件位置被目录占用'})
                    elif relative == MANIFEST and _read_json(path).get('generatedBy') != GENERATED_BY:
                        conflicts.append({'path': relative, 'reason': '同名用户文件不会覆盖'})
                    elif relative == GUIDE and not path.read_text(encoding='utf8').startswith(f'<!-- {GENERATED_BY} -->'):
                        conflicts.append({'path': relative, 'reason': '同名用户文件不会覆盖'})
            except (OSError, ValueError, UnicodeError) as exc:
                conflicts.append({'path': relative, 'reason': str(exc)})
        current = []
        media = [project.get('latestVideo')]
        covers = project.get('latestCovers', [])
        media.extend(covers.values() if isinstance(covers, dict) else covers)
        for item in media:
            if not isinstance(item, dict):
                continue
            try:
                relative = item.get('relativePath') or Path(item['path']).absolute().relative_to(root).as_posix()
                if _safe(root, relative).is_file():
                    current.append({'path': relative, 'kind': item.get('kind'), 'ratio': item.get('ratio'), 'mediaId': item.get('id')})
            except (KeyError, ValueError, OSError):
                continue
        findings = []
        if missing:
            findings.append({'code': 'missing-standard-directories', 'message': '待补齐规范目录：' + '、'.join(missing), 'paths': missing})
        if loose:
            findings.append({'code': 'loose-root-files', 'message': f'根目录有 {len(loose)} 个源码或临时命名文件；已标记原路径，未猜测其依赖或删除。', 'paths': [f['path'] for f in loose]})
        for category in ('source', 'output', 'covers'):
            legacy = [p for p in routes[category]['existing'] if p != category]
            if legacy:
                findings.append({'code': 'compatibility-' + category, 'message': f"{DIRECTORIES[category]}沿用 {len(legacy)} 处旧路径；索引统一指向真实位置。", 'paths': legacy})
        if not current:
            findings.append({'code': 'no-current-delivery', 'message': '没有识别到当前完整成片/封面，目录规范化不会伪造发布记录。', 'paths': []})
        if truncated:
            findings.append({'code': 'bounded-scan', 'message': '本次目录级扫描达到上限；未展开的内容需按需检查。', 'paths': []})
        return {'schema': SCHEMA, 'generatedBy': GENERATED_BY, 'projectId': project_id, 'name': project.get('displayName') or project.get('name') or root.name,
                'root': str(root), 'manifestPath': MANIFEST, 'guidePath': GUIDE, 'policy': 'index-existing-dependencies-create-canonical-routes',
                'routes': routes, 'engineRoots': sorted(set(roots)), 'protectedBuildFiles': sorted(protected, key=lambda f: f['path']),
                'currentMedia': current, 'looseFiles': loose, 'skipped': sorted(skipped, key=lambda f: f['path']),
                'findings': findings, 'conflicts': conflicts, 'missingDirectories': missing,
                'scan': {'entriesExamined': count, 'limit': self.max_entries, 'truncated': truncated, 'scope': 'directory-level-and-known-engine-roots'},
                'summary': {'missingDirectories': len(missing), 'looseFiles': len(loose), 'compatibilityRoutes': sum(len([p for p in r['existing'] if p != k]) for k, r in routes.items()), 'conflicts': len(conflicts)}}

    def apply(self, project_id: str) -> dict:
        with self.lock:
            report = self.scan(project_id)
            if report['conflicts']:
                raise ValueError('目录规范化发现冲突，尚未修改：' + '；'.join(row['path'] + ' ' + row['reason'] for row in report['conflicts']))
            root = Path(report['root'])
            created = []
            for relative in report['missingDirectories']:
                path = _safe(root, relative)
                path.mkdir(exist_ok=True)
                created.append(relative)
            updated = self.scan(project_id)
            changed_manifest = _atomic_owned(root, MANIFEST, json.dumps(updated, ensure_ascii=False, indent=2) + '\n', json_file=True)
            changed_guide = _atomic_owned(root, GUIDE, _guide(updated), json_file=False)
            return {**updated, 'applied': True, 'createdDirectories': created, 'writtenFiles': [path for path, changed in [(MANIFEST, changed_manifest), (GUIDE, changed_guide)] if changed],
                    'movedFiles': [], 'deletedFiles': [], 'message': '已建立规范目录和真实路径导航，现有渲染源、成片与依赖保持可用。'}

    def context(self, project_id: str) -> dict:
        """Small prompt contract, reading only the owned manifest on demand."""
        root = Path(self.library.project(project_id)['path']).absolute()
        data = _read_json(_safe(root, MANIFEST))
        if data.get('generatedBy') != GENERATED_BY:
            return {'manifestPath': None, 'newFileDirectories': list(DIRECTORIES), 'policy': '修改已有工程先查找真实源码；新文件按规范目录保存。'}
        return {'manifestPath': MANIFEST, 'guidePath': GUIDE, 'newFileDirectories': list(DIRECTORIES),
                'engineRoots': data.get('engineRoots', [])[:20],
                'routes': {key: row.get('existing', [])[:12] for key, row in data.get('routes', {}).items()},
                'policy': '沿用已有引擎路径；新独立资源写规范目录。先读目录导航再编辑，不移动渲染依赖；验收前不覆盖或删除当前成片。'}
