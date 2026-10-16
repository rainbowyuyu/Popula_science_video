"""Read-only zero-offset master comparison for the h070 bridge repair."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'
MASTER = ROOT / 'public/master.wav'
OUT = ROOT / 'research/revision-v5/h070-bridge-repair/audio-verification.json'

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()

def pcm(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-xerror',
        '-i', str(path), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000',
        '-f', 'f32le', 'pipe:1'], capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype='<f4').astype('float64')

def main():
    video_sha, master_sha = sha(VIDEO), sha(MASTER)
    marker = json.loads((ROOT / 'tmp/final-render.json').read_text(encoding='utf8'))
    assert marker['success'] and marker['videoSHA256'] == video_sha
    assert marker['masterSHA256'] == master_sha
    x, y = pcm(VIDEO), pcm(MASTER)
    assert abs(len(x) - len(y)) <= 512
    n = min(len(x), len(y))
    x, y = x[:n], y[:n]
    windows = []
    for start in range(0, n, 40000):
        a, b = x[start:start+40000], y[start:start+40000]
        energy = float(np.sum(b*b))
        if energy <= len(b) * 1e-10:
            continue
        correlation = float(np.sum(a*b) / np.sqrt(np.sum(a*a) * energy))
        error = float(np.sqrt(np.sum((a-b)**2) / energy))
        assert correlation >= .99 and error <= .10, (start / 8000, correlation, error)
        windows.append({'startSeconds': start/8000, 'correlation': correlation, 'normalizedRMSE': error})
    correlation = float(np.sum(x*y) / np.sqrt(np.sum(x*x)*np.sum(y*y)))
    assert correlation >= .995
    assert sha(VIDEO) == video_sha and sha(MASTER) == master_sha
    report = {'createdUTC': datetime.now(timezone.utc).isoformat(),
        'videoSHA256': video_sha, 'masterSHA256': master_sha,
        'method': 'Full decoded mono 8 kHz PCM comparison at zero offset; no lag correction',
        'automaticCheckPassed': True, 'samplesCompared': n,
        'correlation': correlation, 'minimumWindowCorrelation': min(w['correlation'] for w in windows),
        'windows': windows, 'subjectiveListeningCompleted': False}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k != 'windows'}, indent=2))

if __name__ == '__main__':
    main()
