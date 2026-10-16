"""Read-only voice-wave audit; does not certify subjective voice quality."""
from pathlib import Path
import argparse
import numpy as np
import soundfile as sf
from voice import ROOT, read, save, sha

p = argparse.ArgumentParser()
p.add_argument('--output', default='research/audio-take-audit.json')
p.add_argument('--candidate', default='')
p.add_argument('--only', default='')
args = p.parse_args()

def edges(w, sr):
    if w.ndim > 1:
        w = w.mean(axis=1)
    hop = max(1, round(sr * .01))
    v = w[:len(w) // hop * hop].reshape(-1, hop)
    rms = np.sqrt(np.mean(v ** 2, axis=1))
    threshold = max(10 ** (-48 / 20), float(rms.max()) * .015)
    active = np.flatnonzero(rms > threshold)
    first = float(active[0] * hop / sr) if len(active) else len(w) / sr
    last = float((active[-1] + 1) * hop / sr) if len(active) else 0
    edge = max(1, round(sr * .02))
    db = lambda x: float(20 * np.log10(max(float(np.sqrt(np.mean(x ** 2))), 1e-12)))
    return dict(leadingSeconds=first, trailingSeconds=len(w)/sr-last,
                first20msDBFS=db(w[:edge]), last20msDBFS=db(w[-edge:]),
                thresholdDBFS=20*np.log10(threshold))

rows = []
for clip in read(ROOT / 'docs/story.json')['shots']:
    if args.only and clip['id'] not in args.only.split(','):
        continue
    base = ROOT / 'audio/candidates' / args.candidate if args.candidate else ROOT / 'audio/takes'
    take = read(base / f"{clip['id']}.json")
    raw, sr = sf.read(ROOT / take['raw'], dtype='float32')
    cleaned, cs = sf.read(ROOT / take['processed'], dtype='float32')
    rawEdges, cleanEdges = edges(raw, sr), edges(cleaned, cs)
    guard = take.get('edgeGuards', {})
    guardSeconds = guard.get('leadSeconds', 0) + guard.get('tailSeconds', 0)
    rows.append(dict(id=clip['id'], samples=len(cleaned), sr=cs,
        duration=len(cleaned) / cs, lastActiveToEndSeconds=rawEdges['trailingSeconds'],
        rawEdges=rawEdges, processedEdges=cleanEdges, explicitGuardSeconds=guardSeconds,
        peakDBFS=float(20*np.log10(max(float(abs(cleaned).max()), 1e-12))),
        rawClippedSamples=int(np.count_nonzero(np.abs(raw)>=.999)),
        processedClippedSamples=int(np.count_nonzero(np.abs(cleaned)>=.999)),
        rawEndpointFlag=bool(take.get('rawEndpointFlag')),
        finite=bool(np.isfinite(raw).all() and np.isfinite(cleaned).all()),
        processingDurationDelta=len(cleaned) / cs - len(raw) / sr,
        unexpectedDurationDelta=len(cleaned)/cs-len(raw)/sr-guardSeconds,
        boundaryMarginFlags=(["short_processed_head"] if cleanEdges['leadingSeconds']<.06 else [])+
                            (["short_processed_tail"] if cleanEdges['trailingSeconds']<.12 else []),
        rawSourceSHA256=sha(ROOT / take['raw']),
        sourceSHA256=sha(ROOT / take['processed']),
        sourceHashMatchesTake=sha(ROOT / take['processed']) == take['sha256']))
report = dict(sentences=rows, allFinite=all(r['finite'] for r in rows),
    maxDurationDelta=max(abs(r['processingDurationDelta']) for r in rows),
    maxUnexpectedDurationDelta=max(abs(r['unexpectedDurationDelta']) for r in rows),
    rawEndpointFlags=[r['id'] for r in rows if r['rawEndpointFlag']],
    minimumTrailingMarginSeconds=min(r['lastActiveToEndSeconds'] for r in rows),
    minimumProcessedHeadMarginSeconds=min(r['processedEdges']['leadingSeconds'] for r in rows),
    minimumProcessedTailMarginSeconds=min(r['processedEdges']['trailingSeconds'] for r in rows),
    boundaryMarginFlags=[dict(id=r['id'],flags=r['boundaryMarginFlags']) for r in rows if r['boundaryMarginFlags']],
    allSourceHashesMatch=all(r['sourceHashMatchesTake'] for r in rows),
    allUnclipped=all(r['rawClippedSamples']==0 and r['processedClippedSamples']==0 for r in rows),
    subjectiveListeningChecked=False,
    timingPolicy='No source trimming or stretching. Explicit v3 leading/trailing guards are included in measured duration. Energy margins and ASR cannot prove phonetic completeness or pleasantness.')
save(ROOT / args.output, report)
assert report['allFinite'] and report['allSourceHashesMatch'] and report['allUnclipped']
assert report['maxUnexpectedDurationDelta'] <= 1 / 24000
print('VOICE_AUDIT', len(rows), 'finite/hash/duration checks passed; raw endpoint flags', report['rawEndpointFlags'],
      'boundary margins', report['boundaryMarginFlags'])
