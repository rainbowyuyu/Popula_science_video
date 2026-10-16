"""Bind delivery evidence to the actual encoded film. Does not waive visual review."""
from pathlib import Path
import argparse, datetime, hashlib, json

ROOT = Path(__file__).resolve().parents[1]
REVISION = '02344ec045cc'

def read(rel):
    return json.loads((ROOT / rel).read_text('utf-8-sig'))

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--visual-reviewed', action='store_true')
    args = parser.parse_args()
    if not args.visual_reviewed:
        raise SystemExit('Inspect final contact sheets before setting --visual-reviewed')
    video = ROOT / 'output/ai_engineer_launch_v16_1080p60.mp4'
    digest = sha(video)
    manifest = read(f'output/launch-v16-render-{REVISION}/render-manifest.json')
    technical = read('research/qa/launch-v16-delivery.json')
    binding = read('research/qa/v16-audio-final-binding.json')
    coda = read('research/qa/v16-coda-adjudication.json')
    camera = read('research/qa/launch-v16-camera.json')
    sampled = read('research/qa/v16-final-visual/sampling.json')
    recovery = read('research/qa/v16-recovery-package.json')
    assert manifest['finalSHA256'] == technical['sha256'] == binding['videoSHA256'] == coda['videoSHA256'] == sampled['sha256'] == digest
    assert not manifest['browserErrors'] and manifest['finished']
    failures = [name for name, row in technical['checks'].items() if not row['passed']]
    assert set(failures) <= {'noUnintendedLongSilence'}, failures
    assert technical['fullDecodePassed'] and binding['passed']
    assert coda['all16UtterancesCompleteAndCaptioned'] and coda['exactDecodedAACIdentity']
    assert coda['coda']['tailOnlyAfterSpokenContent'] and coda['coda']['sameSilenceAsApprovedAAC']
    # Preserve raw technical result; explain the planned ending separately.
    coda['accepted'] = True
    coda['waivedChecks'] = failures
    (ROOT / 'research/qa/v16-coda-adjudication.json').write_text(json.dumps(coda,ensure_ascii=False,indent=2)+'\n','utf8')
    source_checks = []
    for row in manifest['sourceAssets']:
        actual = sha(ROOT / row['file'])
        source_checks.append({'file': row['file'], 'matches': actual == row['sha256']})
    assert all(row['matches'] for row in source_checks)
    assert all(sha(ROOT / row['file']) == row['sha256'] for row in camera['sources'])
    assert recovery['revision'] == REVISION
    assert all(recovery[k] for k in ['crcPass','memberSHA256Pass','exactListingPass','requiredSourceMatchesFormalRevision','relativeImportClosurePass'])
    assert sha(ROOT / recovery['zip']) == recovery['zipSHA256']
    result = {
        'schema':'v16-final-delivery-v1',
        'checkedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'revision':REVISION,'video':str(video),'sha256':digest,'sizeBytes':video.stat().st_size,
        'objectiveDeliveryAccepted':True,'visualSampleReviewPassed':True,
        'rawTechnicalPassed':technical['passed'],
        'rawGateException':'Only final 1.0525 seconds of the approved music coda fall below -50 dB. All 16 utterances are complete; no middle-film silence.',
        'technicalQa':'research/qa/launch-v16-delivery.json',
        'codaAdjudication':'research/qa/v16-coda-adjudication.json',
        'audioBinding':'research/qa/v16-audio-final-binding.json',
        'cameraQa':'research/qa/launch-v16-camera.json',
        'visualSampling':'research/qa/v16-final-visual/sampling.json',
        'visualReview':'research/qa/v16-final-visual/review.json',
        'recovery':recovery['zip'],'recoverySHA256':recovery['zipSHA256'],
        'normalSpeedFullWatch':False,'humanListening':False,
        'qaScope':'Full decode and camera trajectory; actual final frame inspection and AAC signal/ASR checks. No claim of complete human real-time viewing or subjective listening.',
        'sourceChecks':source_checks,
        'actualUpgrade':['Native WaterPro WebGPU','Blender connected presentation shell','Continuous camera corridor','Two Qwen/WAN first-last frame bridges','Background-aware typography','rainbow voice and Dragonflame remix'],
        'toolLimitations':['Claude request failed; no Claude output integrated','No Gaussian-splat scan used','Zwind is saved response replay; visual waves are separate'],
    }
    out = ROOT / 'research/qa/v16-final-delivery.json'
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({'report':str(out),'sha256':digest,'objectiveDeliveryAccepted':True,'sizeBytes':video.stat().st_size}))

if __name__ == '__main__':
    main()
