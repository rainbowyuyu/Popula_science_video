"""Archive the long take, then remove two repeated narration bridges.

The retained takes are never stretched or resynthesized. This preserves the
complete 41-take original while the accepted 39-take timeline stays concise.
"""
from pathlib import Path
import json, shutil, subprocess, sys, hashlib

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'research/audio/long-edit-41-clips'
REMOVED = {'r016', 'r040'}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    story_path = ROOT / 'research/story.json'
    story = json.loads(story_path.read_text('utf8'))
    if any(row['id'] in REMOVED for row in story['clips']):
        for source in [story_path, ROOT/'src/timeline.json',
                       ROOT/'public/audio/audio-manifest.json',
                       ROOT/'public/audio/narration.wav']:
            target = ARCHIVE / source.name
            if source.exists() and not target.exists():
                shutil.copy2(source, target)
        for cid in sorted(REMOVED):
            take_dir = ARCHIVE / cid
            take_dir.mkdir(exist_ok=True)
            for source in [ROOT/f'public/audio/{cid}.wav',
                           ROOT/f'research/audio/raw/{cid}-raw.wav',
                           ROOT/f'research/audio/raw/{cid}-protected.wav',
                           ROOT/f'research/audio/takes/{cid}.json',
                           ROOT/f'research/audio/takes/{cid}-master.json']:
                if source.exists() and not (take_dir/source.name).exists():
                    shutil.copy2(source, take_dir/source.name)
        story['clips'] = [row for row in story['clips'] if row['id'] not in REMOVED]
        story['editV06'] = {
            'removedRepeatedBridges': sorted(REMOVED),
            'longEditArchive': ARCHIVE.relative_to(ROOT).as_posix(),
            'timeStretch': False,
            'reason': 'Retain the causal path and remove repeated summary bridges.'
        }
        story_path.write_text(json.dumps(story,ensure_ascii=False,indent=2)+'\n','utf8')
    subprocess.run([sys.executable,str(ROOT/'scripts/generate_audio.py'),
                    '--timeline-only'], cwd=ROOT, check=True)
    timeline = json.loads((ROOT/'src/timeline.json').read_text('utf8'))
    report = {'retainedClips':len(timeline['clips']),
              'removedClips':sorted(REMOVED),
              'seconds':timeline['seconds'],
              'frames':timeline['duration'],
              'archiveFiles':[{'file':str(p.relative_to(ROOT)),
                               'bytes':p.stat().st_size,'sha256':sha(p)}
                              for p in ARCHIVE.rglob('*') if p.is_file()]}
    (ROOT/'research/audio/accepted-edit-v06.json').write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='archiveFiles'},ensure_ascii=False),flush=True)

if __name__ == '__main__':
    main()
