"""Refresh the v8 cleanup inventory after the accepted bracket splice; no deletion."""
import copy
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/episode3v8'
FINAL = RESEARCH / 'visual-qa/final'
EXPECTED = 'dc21497613c34185b5071ca223c5aeae3a60369517b2b2cc3dcd72531f70aaff'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def regular(path, within_project=False):
    path = path.absolute()
    if within_project:
        path.relative_to(ROOT)
    for node in [path, *path.parents]:
        if node.is_symlink() or (node.stat().st_file_attributes & 0x400):
            raise RuntimeError(f'Reparse/symlink path rejected: {node}')
    if not path.is_file():
        raise RuntimeError(f'Not a regular file: {path}')
    return path


def fingerprint(path, within_project=False):
    path = regular(Path(path), within_project)
    before = path.stat()
    value = digest(path)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError(f'File changed during hash: {path}')
    return {'path': str(path), 'bytes': after.st_size, 'sha256': value,
            'mtime_ns': after.st_mtime_ns}


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    plan_path = RESEARCH / 'cleanup-plan.json'
    freeze_path = RESEARCH / 'dependency-freeze.json'
    old_plan, old_freeze = read(plan_path), read(freeze_path)
    if old_plan['schema'] != 'rainbow-episode3v8-cleanup-plan-v1':
        raise RuntimeError('This one-time v1-to-v2 refresh must not overwrite a later revision')

    audit_path = FINAL / 'final-media-audit.json'
    splice_path = RESEARCH / 'final-splice.json'
    visual_path = FINAL / 'visual-review-bracket-fixed.json'
    audit, splice, visual = read(audit_path), read(splice_path), read(visual_path)
    media = fingerprint(Path(audit['video']), True)
    assert media['sha256'] == EXPECTED == splice['finalSha256'] == audit['video_sha256']
    assert audit['machine_checks_pass'] is True
    assert splice['success'] and splice['outsideRepairDecodedFramesUnchanged'] == 8514
    assert splice['audioPacketSha256Unchanged'] and splice['repairedFrames'] == [2750, 3999]
    assert visual['source_video_sha256'] == EXPECTED, 'Visual report must identify the accepted MP4'
    assert visual['new_blocking_visual_findings'] == [], 'Blocking visual findings remain'
    assert visual['sampled_visual_status'].startswith('accepted;')
    assert visual['all_planned_samples_in_repaired_interval_visually_reviewed'] is True
    assert visual['sampled_repaired_frame_count'] == 74
    assert visual['final_media_audit']['sha256'] == digest(audit_path)
    assert visual['splice_evidence']['sha256'] == digest(splice_path)

    history = RESEARCH / 'cleanup-history'
    history.mkdir(exist_ok=True)
    history_records = []
    for source in [plan_path, freeze_path]:
        saved = history / (source.stem + '.revision-1-before-bracket-fix.json')
        original = source.read_bytes()
        if saved.exists():
            assert saved.read_bytes() == original, 'Do not overwrite history'
        else:
            saved.write_bytes(original)
        history_records.append(fingerprint(saved, True))

    changes = []
    retained = {}

    def retain(path, categories, previous=None):
        fresh = fingerprint(path)
        if previous:
            record = copy.deepcopy(previous)
            record.update(fresh)
            if previous['sha256'] != fresh['sha256']:
                changes.append({'path': fresh['path'], 'previous_sha256': previous['sha256'],
                                'current_sha256': fresh['sha256'], 'previous_bytes': previous['bytes'],
                                'current_bytes': fresh['bytes']})
                record.setdefault('sha256_history', []).append({
                    'sha256': previous['sha256'], 'bytes': previous['bytes'],
                    'observed_in': 'dependency-freeze revision 1',
                    'superseded_reason': 'Approved bracket timing repair and final QA completion'})
        else:
            record = fresh
        existing = retained.get(fresh['path'], {})
        record['categories'] = sorted(set(record.get('categories', []) + categories + existing.get('categories', [])))
        record['retain'] = True
        record['external_to_video_project'] = not Path(fresh['path']).is_relative_to(ROOT)
        retained[fresh['path']] = record

    for previous in old_freeze['files']:
        retain(previous['path'], [], previous)
    for path in [Path(media['path']), ROOT / 'output/episode3v8/交付说明.md',
                 ROOT / 'scripts/splice_episode3v8.py', Path(__file__), splice_path,
                 RESEARCH / 'final-render.json', RESEARCH / 'segment-render.json',
                 RESEARCH / 'visual-qa/audit-bracket-revision.mjs']:
        retain(path, ['accepted-final-or-repair-evidence'])
    for directory in [FINAL, RESEARCH / 'visual-qa/bracket-revision', history]:
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                retain(path, ['retained-final-review-evidence'])

    plan = copy.deepcopy(old_plan)
    plan.update(schema='rainbow-episode3v8-cleanup-plan-v2', updated_utc=now,
                revision=2, active_render_session=None, mode='plan-only', executed=False,
                deletion_allowed_now=False)
    plan['completed_render_sessions'] = [88344, 81539]
    plan['v8_source_dependencies'] = [fingerprint(x['path']) for x in old_plan['v8_source_dependencies']]
    candidate_changes = []
    for group in plan['candidates']:
        for item in group['files']:
            fresh = fingerprint(item['path'], True)
            if item['sha256'] != fresh['sha256']:
                candidate_changes.append({'path': item['path'], 'previous_sha256': item['sha256'],
                                          'current_sha256': fresh['sha256']})
                item['sha256_history'] = [{'sha256': item['sha256'], 'bytes': item['bytes'],
                                           'reason': 'Bundle rebuilt for accepted bracket repair'}]
            item.update(fresh)
            if 'retained_canonical' in item:
                canonical = fingerprint(item['retained_canonical'])
                assert fresh['sha256'] == canonical['sha256'], 'Canonical duplicate evidence mismatch'
                item['retained_sha256'], item['retained_bytes'] = canonical['sha256'], canonical['bytes']
        group['bytes'] = sum(x['bytes'] for x in group['files'])
        group['file_count'] = len(group['files'])

    splice_evidence = fingerprint(splice_path, True)
    for group_id, paths in [
        ('completed_splice_cache', sorted((ROOT / 'tmp/episode3v8-splice').rglob('*'))),
        ('superseded_bracket_media', [ROOT / 'output/episode3v8/segment-2750-3999.mp4',
                                     ROOT / 'output/episode3v8/joinery_v8_before_bracket_fix.mp4'])]:
        items = []
        for path in paths:
            if not path.is_file():
                continue
            item = fingerprint(path, True)
            if path.name == 'joinery_v8_before_bracket_fix.mp4':
                assert item['sha256'] == splice['sourceSha256']
            item.update(evidence='Superseded by accepted bracket-fixed final MP4; retained splice and final audit evidence',
                        retained_final=media['path'], retained_final_sha256=media['sha256'],
                        splice_evidence=splice_evidence,
                        repaired_frames=[2750,3999], outside_repair_decoded_frames_unchanged=8514,
                        audio_packet_sha256_unchanged=True)
            items.append(item)
        plan['candidates'].append({'id': group_id, 'status': 'conditional_after_owner_final_acceptance_and_process_exit',
                                   'file_count': len(items), 'bytes': sum(x['bytes'] for x in items), 'files': items})
    plan['candidate_file_count'] = sum(g['file_count'] for g in plan['candidates'])
    plan['candidate_bytes'] = sum(g['bytes'] for g in plan['candidates'])
    # Preview promotion is deliberately separate from successful final-video acceptance.
    for group in plan['deferred_candidates']:
        for item in group['files']:
            fresh = fingerprint(item['path'], True)
            assert item['sha256'] == fresh['sha256']
            item['evidence'] = 'Rebuildable preview; exact retained final-sample replacement has not been approved for cleanup'
    plan['execution_gates'] = [
        'Owner confirms all render/browser/splice/audit users of candidate caches have exited',
        'Final media audit accepted for dc21497613c34185b5071ca223c5aeae3a60369517b2b2cc3dcd72531f70aaff',
        'Bracket-fixed sampled visual review accepted for the same final SHA; human real-time watching/listening remains unperformed',
        'Immediately before deletion rehash retained files and every exact candidate; preserve any mismatch',
        'Resolve candidate absolute paths within this project; reject symlinks/reparse points; remove exact regular files only',
        'Deferred preview JPGs require a separate retained replacement record before any promotion'
    ]
    acceptance = {'video': media, 'media_audit': fingerprint(audit_path, True),
                  'machine_gate': 'accepted', 'sampled_visual_gate': 'accepted',
                  'sampled_visual_review': fingerprint(visual_path, True),
                  'human_motion_review_complete': False, 'human_listening_complete': False,
                  'deletion_owner': 'root', 'deletion_executed': False}
    revision = {'revision':2,'at_utc':now,'reason':'Approved bracket-line2 timing repair and GOP-aligned splice',
                'prior_manifest_snapshots':history_records, 'source_changes':changes,
                'candidate_changes':candidate_changes,
                'previous_video_sha256':splice['sourceSha256'],'current_video_sha256':media['sha256'],
                'splice_evidence':splice_evidence,
                'outside_repair_decoded_frames_unchanged':8514,
                'audio_packet_hash':splice['audioPacketHash']}
    plan['revision_history'] = [revision]
    plan['final_acceptance'] = acceptance
    plan['notes'] = ['No files deleted.', 'Original revision-1 manifests preserved byte-for-byte in cleanup-history.',
                     'Candidate entries are plans; owner must perform process-exit and current-hash checks before deletion.',
                     'All canonical models, source, raw/processed speech, v7 fallback and final evidence remain protected.']
    freeze = copy.deepcopy(old_freeze)
    freeze.update(schema='rainbow-episode3v8-dependency-freeze-v2', updated_utc=now, revision=2,
                  purpose='Retained hash baseline after accepted final bracket splice; not a packaging manifest',
                  files=sorted(retained.values(),key=lambda x:x['path']),
                  retained_file_count=len(retained), retained_bytes=sum(x['bytes'] for x in retained.values()),
                  pending_final_artifacts=[], revision_history=[revision], final_acceptance=acceptance)
    write(plan_path, plan)
    write(freeze_path, freeze)
    print(json.dumps({'candidate_files':plan['candidate_file_count'],'candidate_bytes':plan['candidate_bytes'],
                      'retained_files':freeze['retained_file_count'],'retained_bytes':freeze['retained_bytes'],
                      'source_changes':changes,'deletion_executed':False},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
