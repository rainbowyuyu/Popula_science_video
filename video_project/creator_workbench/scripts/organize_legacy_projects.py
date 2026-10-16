"""Audit or normalize registered local projects without moving/deleting assets."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

WORKBENCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKBENCH))
from app.library import Library
from app.project_structure import ProjectStructure, _atomic_owned, _safe, GENERATED_BY


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video-root', type=Path, default=WORKBENCH.parent)
    parser.add_argument('--apply', action='store_true', help='Create canonical directories and owned path maps. Never move or delete files.')
    parser.add_argument('--project-id', action='append', default=[])
    args = parser.parse_args()
    video_root = args.video_root.absolute()
    library = Library(video_root, skill_roots=[])
    projects = library.snapshot(lightweight=True)['projects']
    if args.project_id:
        found = {p['id'] for p in projects}
        unknown = set(args.project_id) - found
        if unknown:
            parser.error('Unknown project IDs: ' + ', '.join(sorted(unknown)))
        projects = [p for p in projects if p['id'] in args.project_id]
    manager = ProjectStructure(library)
    results = []
    for project in projects:
        try:
            before = manager.scan(project['id'])
            after = manager.apply(project['id']) if args.apply else before
            results.append({'projectId': project['id'], 'name': project['name'], 'status': 'applied' if args.apply else 'audited',
                            'root': project['path'], 'before': before, 'after': after})
        except (ValueError, OSError) as exc:
            results.append({'projectId': project['id'], 'name': project['name'], 'status': 'error', 'error': str(exc)})
    totals = {'projects': len(results), 'applied': sum(r['status'] == 'applied' for r in results),
              'errors': sum(r['status'] == 'error' for r in results),
              'createdDirectories': sum(len(r.get('after', {}).get('createdDirectories', [])) for r in results),
              'legacyRoutes': sum(r.get('after', {}).get('summary', {}).get('compatibilityRoutes', 0) for r in results),
              'looseFilesIndexed': sum(r.get('after', {}).get('summary', {}).get('looseFiles', 0) for r in results),
              'filesMoved': 0, 'filesDeleted': 0}
    report = {'generatedBy': GENERATED_BY, 'schema': 2, 'mode': 'apply' if args.apply else 'audit', 'summary': totals, 'projects': results}
    directory = _safe(video_root, '_catalog')
    directory.mkdir(exist_ok=True)
    prefix = 'project-structure-v2-applied' if args.apply else 'project-structure-v2-audit'
    _atomic_owned(video_root, '_catalog/' + prefix + '.json', json.dumps(report, ensure_ascii=False, indent=2) + '\n', json_file=True)
    lines = [f'<!-- {GENERATED_BY} -->', '# 视频工程目录规范化报告', '',
             f"登记工程 {totals['projects']} 个；新增规范目录 {totals['createdDirectories']} 个；旧路径映射 {totals['legacyRoutes']} 处；根目录散落文件登记 {totals['looseFilesIndexed']} 个。", '',
             '本次仅建立规范目录和真实路径清单。未移动、删除或改名任何源文件、媒体和依赖；不会释放磁盘空间。',
             '后续新文件按统一规则保存，旧渲染路径继续保留，缓存清理由独立的验收/清理流程执行。', '',
             '| 工程 | 结果 | 新增目录 | 兼容路径 | 散落文件 | 当前成片/封面 |', '|---|---|---:|---:|---:|---:|']
    for result in results:
        after = result.get('after', {})
        summary = after.get('summary', {})
        lines.append(f"| {result['name']} | {result['status']} | {len(after.get('createdDirectories', []))} | {summary.get('compatibilityRoutes', 0)} | {summary.get('looseFiles', 0)} | {len(after.get('currentMedia', []))} |")
    lines += ['', '各工程入口：`.studio/PROJECT_STRUCTURE.md`；机器可读清单：`.studio/structure-v2.json`。', '',
              '目录级扫描只读取已登记构建入口及其直接目录，跳过依赖、缓存和目录链接；不是所有文件的完整内容审计。', '']
    _atomic_owned(video_root, '_catalog/' + prefix + '.md', '\n'.join(lines), json_file=False)
    print(json.dumps({'summary': totals, 'report': str(directory / (prefix + '.md'))}, ensure_ascii=True))
    return 1 if totals['errors'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
