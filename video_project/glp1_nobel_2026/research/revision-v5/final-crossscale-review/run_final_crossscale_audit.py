"""Preserve old evidence while running the two final cross-scale QA extractors.

Default only describes sampling. --execute requires the final composed film
and matching successful qa_final report. No production input is modified.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import types


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'research/qa/final-v5/crossscale-audit'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def rel(path):
    return Path(path).relative_to(ROOT).as_posix()


def load_script(name):
    path = ROOT / 'scripts' / name
    module = types.ModuleType(name.removesuffix('.py'))
    module.__file__ = str(path)
    exec(compile(path.read_text(encoding='utf-8'), str(path), 'exec'), module.__dict__)
    return module


def expanded_crossscale_windows(original, timeline, step):
    windows = original(timeline, step)
    dense = sorted(set(range(14534, 14591, 5)) | {14590})
    for window in windows:
        if window['name'] == 'nephron-to-meal':
            window['additionalRepairFrames'] = sorted(set(window['additionalRepairFrames']) | set(dense))
            window['frames'] = sorted(set(window['frames']) | set(dense))
            window['firstFrame'], window['lastFrame'] = window['frames'][0], window['frames'][-1]
    # Covers the complete changed h040 visibility support F11371..11406,
    # with context before/after its seated-person reveal.
    first, last = 11330, 11450
    assert all(0 <= frame < timeline['duration'] for frame in (first, last))
    frames = list(range(first, last + 1, 5))
    windows.append({'name': 'h040-dining-return', 'firstFrame': first, 'lastFrame': last,
                    'regularSamplingRange': [first, last], 'additionalRepairFrames': frames,
                    'stepFrames': 5, 'stepSeconds': 5 / timeline['fps'], 'frames': frames})
    return windows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    cross = load_script('qa_v5_crossscale_current.py')
    focus = load_script('qa_v5_focused_transitions.py')
    original = cross.build_windows
    cross.build_windows = lambda timeline, step: expanded_crossscale_windows(original, timeline, step)
    timeline = json.loads((ROOT / 'src/timeline.json').read_text(encoding='utf-8'))
    cross_windows = cross.build_windows(timeline, 10)
    focus_windows = focus.build_windows(timeline)
    sampling = {'timelineSHA256': sha(ROOT / 'src/timeline.json'), 'fps': timeline['fps'],
                'durationFrames': timeline['duration'],
                'crossscale': {'windows': cross_windows, 'contactSheets': sum(math.ceil(len(w['frames']) / 8) for w in cross_windows)},
                'focused': {'windows': focus_windows, 'contactSheets': sum(math.ceil(len(w['frames']) / 8) for w in focus_windows)},
                'notes': 'All original windows plus dense h040 return and F14534..14590 anchors; no source modifications.'}
    if not args.execute:
        print(json.dumps({'executed': False, 'writesFiles': False, **sampling}, ensure_ascii=False, indent=2))
        return

    qa, _, hashes, qa_hash, marker_hash = cross.lock_inputs()
    marker = json.loads(cross.MARKER.read_text(encoding='utf-8'))
    locked_sources = []
    if marker.get('singlePassRender') is True:
        if marker.get('frames') != [0, timeline['duration'] - 1]:
            raise RuntimeError('Full render does not cover the current timeline.')
        lock_name = marker.get('sourceLock')
        if not isinstance(lock_name, str) or not lock_name:
            raise RuntimeError('Full render has no source lock.')
        source_lock = (ROOT / lock_name).resolve()
        if not source_lock.is_relative_to(ROOT) or not source_lock.is_file():
            raise RuntimeError('Full-render source lock is outside the project or missing.')
        if sha(source_lock) != marker.get('sourceLockSHA256'):
            raise RuntimeError('Full-render source lock SHA does not match the current file.')
        lock = json.loads(source_lock.read_text(encoding='utf-8'))
        if lock.get('frames') != timeline['duration'] or lock.get('fps') != timeline['fps']:
            raise RuntimeError('Full-render source lock belongs to another timeline.')
        locked_sources.append(source_lock)
        for record in lock['files']:
            current = (ROOT / record['path']).resolve()
            if not current.is_relative_to(ROOT) or not current.is_file() or sha(current) != record['sha256']:
                raise RuntimeError(f'Current source differs from full render: {record["path"]}')
            locked_sources.append(current)
    elif not marker.get('composition') or marker.get('singlePassRender') is not False:
        raise RuntimeError('Wait for a locked full render or final patch composition and automatic QA.')
    protected = [cross.VIDEO, cross.TIMELINE, cross.MASTER, cross.MARKER, cross.QA_REPORT,
                 Path(cross.__file__), Path(focus.__file__), Path(__file__).resolve(), *locked_sources]
    protected_hashes = {rel(path): sha(path) for path in protected}
    run = EVIDENCE / hashes['videoSHA256'][:16]
    if run.exists():
        raise RuntimeError(f'Independent evidence run already exists; preserve it: {run}')
    run.mkdir(parents=True)
    # focused.main resolves its automatic report via OUT.parent; retain the
    # exact canonical report bytes here, and lock both copies to the same SHA.
    report_copy = run / 'automatic-report.json'
    report_copy.write_bytes(cross.QA_REPORT.read_bytes())
    if sha(report_copy) != qa_hash:
        raise RuntimeError('Automatic QA report changed while copying evidence.')
    write(run / 'sampling-plan.json', sampling)
    cross.OUT = run / 'crossscale-current'
    focus.OUT = run / 'focused-transitions'
    started = {'startedUTC': datetime.now(timezone.utc).isoformat(), **hashes,
               'inputSHA256': protected_hashes, 'automaticReportSHA256': qa_hash,
               'renderMarkerSHA256': marker_hash, 'samplingPlanSHA256': sha(run / 'sampling-plan.json'),
               'command': subprocess.list2cmdline([sys.executable, '-B', str(Path(__file__).resolve()), *sys.argv[1:]]),
               'extractionOnly': True, 'subjectiveReviewCompleted': False,
               'decodePolicy': 'Original QA scripts, CPU sequential decode from frame zero.',
               'namespaceOverrides': {'crossscale.OUT': rel(cross.OUT), 'focused.OUT': rel(focus.OUT),
                                      'focusedAutomaticReportCopy': rel(report_copy)}}
    write(run / 'extraction-started.json', started)
    try:
        previous_argv = sys.argv
        try:
            sys.argv = [str(cross.__file__), '--step', '10']
            cross.main()
        finally:
            sys.argv = previous_argv
        focus.main()
        for relative, expected in protected_hashes.items():
            if sha(ROOT / relative) != expected:
                raise RuntimeError(f'Input changed during final extraction: {relative}')
        if sha(report_copy) != qa_hash:
            raise RuntimeError('Retained automatic report changed during extraction.')
        manifests = [cross.OUT / 'manifest.json', focus.OUT / 'manifest.json']
        sheets = []
        for manifest_path in manifests:
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            if manifest['videoSHA256'] != hashes['videoSHA256']:
                raise RuntimeError('Extractor manifest belongs to another final video.')
            for path in manifest['contactSheets']:
                absolute = ROOT / path
                sheets.append({'path': rel(absolute), 'sha256': sha(absolute), 'opened': False})
        artifacts = {rel(path): sha(path) for path in sorted(run.rglob('*.jpg'))}
        result = {**started, 'finishedUTC': datetime.now(timezone.utc).isoformat(),
                  'extractionCompleted': True, 'subjectiveReviewCompleted': False,
                  'contactSheets': sheets, 'artifactSHA256': artifacts,
                  'manifestSHA256': {rel(path): sha(path) for path in manifests},
                  'scope': 'Sampled encoded frames only. Actual sheet opening and scientific/visual findings require separate review JSON.'}
        write(run / 'extraction-complete.json', result)
        print(json.dumps({'evidenceDirectory': rel(run), 'contactSheets': len(sheets),
                          'videoSHA256': hashes['videoSHA256'], 'subjectiveReviewCompleted': False}, indent=2), flush=True)
    except BaseException as error:
        write(run / 'extraction-failed.json', {**started, 'error': str(error),
                                              'failedUTC': datetime.now(timezone.utc).isoformat()})
        raise


if __name__ == '__main__':
    main()
