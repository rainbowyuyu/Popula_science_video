"""Promote complete V5 candidate takes, retaining selected recordings and evidence."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil

from audio_v5_common import AUDIO, DEFAULT_STORY, RESEARCH, ROOT, read, save, sha, spoken, validate_story, within


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--story', type=Path, default=DEFAULT_STORY)
    parser.add_argument('--expected-story-sha', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--only', required=True)
    parser.add_argument('--reason', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', args.candidate):
        parser.error('Invalid candidate name')
    story, story_sha = validate_story(args.story, args.expected_story_sha)
    rows = {row['id']:row for row in story['shots']}
    ids = args.only.split(',')
    if set(ids)-set(rows):
        parser.error('Unknown shot IDs')
    changes = []
    for sid in ids:
        candidate_record = within(AUDIO/'candidates'/args.candidate/'takes'/f'{sid}.json', AUDIO)
        candidate = read(candidate_record)
        source = within(ROOT/candidate['processed'], AUDIO/'candidates'/args.candidate)
        if candidate['storySHA256'] != story_sha or candidate['ttsText'] != spoken(rows[sid]) or candidate['sha256'] != sha(source):
            raise ValueError('Candidate identity does not match frozen story: '+sid)
        selected_path = AUDIO/'takes'/f'{sid}.json'
        destination = AUDIO/'voice'/f'{sid}.wav'
        previous = read(selected_path)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        archive = AUDIO/'selected-prior'/sid/(previous['sha256'][:16]+'-'+stamp)
        archive.mkdir(parents=True)
        shutil.copy2(selected_path, archive/'take.json')
        shutil.copy2(within(ROOT/previous['processed'], AUDIO), archive/'voice.wav')
        temporary = destination.with_suffix('.selected.tmp.wav')
        shutil.copy2(source, temporary)
        if sha(temporary) != candidate['sha256']:
            raise ValueError('Candidate copy changed: '+sid)
        temporary.replace(destination)
        result = dict(candidate, processed=destination.relative_to(ROOT).as_posix(),
            selectedCandidate=args.candidate, candidateTakeSHA256=sha(candidate_record),
            candidateRecord=candidate_record.relative_to(ROOT).as_posix(),
            selectionReason=args.reason, previousSelectedSHA256=previous['sha256'],
            subjectiveListeningChecked=False)
        save(selected_path,result)
        changes.append(dict(id=sid, previousSHA256=previous['sha256'], selectedSHA256=result['sha256'],
            candidateTakeSHA256=sha(candidate_record), archive=archive.relative_to(ROOT).as_posix(), reason=args.reason))
        print('V5_SELECTED',sid,args.candidate,result['duration'],flush=True)
    save(RESEARCH/'candidate-selections'/f'{stamp}.json',dict(storySHA256=story_sha,changes=changes,subjectiveListeningChecked=False))


if __name__ == '__main__':
    main()
