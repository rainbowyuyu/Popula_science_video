"""Read-only voice-wave audit; does not certify subjective voice quality."""
from pathlib import Path
import numpy as np
import soundfile as sf
from voice import ROOT, read, save, sha

rows = []
for clip in read(ROOT / 'docs/story.json')['shots']:
    take = read(ROOT / 'audio/takes' / f"{clip['id']}.json")
    raw, sr = sf.read(ROOT / take['raw'], dtype='float32')
    cleaned, cs = sf.read(ROOT / take['processed'], dtype='float32')
    hop = max(1, round(sr * .01))
    usable = raw[:len(raw) // hop * hop]
    if usable.ndim > 1:
        usable = usable.mean(axis=1)
    rms = np.sqrt(np.mean(usable.reshape(-1, hop) ** 2, axis=1))
    active = np.flatnonzero(rms > max(.002, float(rms.max()) * .04))
    trailing = len(raw) / sr - ((active[-1] + 1) * hop / sr if len(active) else 0)
    rows.append(dict(id=clip['id'], samples=len(cleaned), sr=cs,
        duration=len(cleaned) / cs, lastActiveToEndSeconds=trailing,
        peakDBFS=float(20*np.log10(max(float(abs(cleaned).max()), 1e-12))),
        rawEndpointFlag=bool(take.get('rawEndpointFlag')),
        finite=bool(np.isfinite(raw).all() and np.isfinite(cleaned).all()),
        processingDurationDelta=len(cleaned) / cs - len(raw) / sr,
        sourceSHA256=sha(ROOT / take['processed']),
        sourceHashMatchesTake=sha(ROOT / take['processed']) == take['sha256']))
report = dict(sentences=rows, allFinite=all(r['finite'] for r in rows),
    maxDurationDelta=max(abs(r['processingDurationDelta']) for r in rows),
    rawEndpointFlags=[r['id'] for r in rows if r['rawEndpointFlag']],
    minimumTrailingMarginSeconds=min(r['lastActiveToEndSeconds'] for r in rows),
    allSourceHashesMatch=all(r['sourceHashMatchesTake'] for r in rows),
    subjectiveListeningChecked=False,
    timingPolicy='Waveform duration unchanged; low-level trailing activity is recorded, not automatically trimmed.')
save(ROOT / 'research/audio-take-audit.json', report)
assert report['allFinite'] and report['allSourceHashesMatch']
assert report['maxDurationDelta'] <= 1 / 24000
print('VOICE_AUDIT', len(rows), 'finite and hash checks passed; raw endpoint flags', report['rawEndpointFlags'])
