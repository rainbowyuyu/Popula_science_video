"""Run the frozen V11 mux with ffprobe's supported extradata hash output.

The installed ffprobe crashes when serializing raw -show_data. Compare the
SHA256 of that same codec extradata instead. Frozen production inputs and all
packet, decoded-pixel, audio, timestamp and provenance checks remain unchanged.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess

import mux_v11 as mux
import verify_v11_tail as proof


def compatible_probe(path, out, name, count_frames=False):
    args = [proof.FFPROBE, '-v', 'error']
    if count_frames:
        args += ['-count_frames']
    args += ['-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', path]
    info = json.loads(proof.run(args, out / f'{name}-probe.log'))
    for stream in info['streams']:
        if stream.get('codec_name') in ('h264', 'aac'):
            proof.require(int(stream.get('extradata_size', 0)) > 0,
                          'Missing codec extradata in compatibility probe')
            proof.require(re.fullmatch(r'SHA256:[0-9a-f]{64}', stream.get('extradata_hash', '')) is not None,
                          'Missing valid codec-extradata SHA256 in compatibility probe')
    return info


def main():
    out = proof.ROOT / 'research/qa/v11-mux-compat'
    out.mkdir(parents=True, exist_ok=True)
    evidence = out / 'execution.json'
    proof.require(not evidence.exists(), 'Compatibility execution already recorded; inspect before retrying')
    sources = [Path(__file__), proof.ROOT/'scripts/mux_v11.py', proof.ROOT/'scripts/verify_v11_tail.py',
               proof.ROOT/'research/visual/v11-final-lock.json']
    record = {
        'startedAtUTC': datetime.now(timezone.utc).isoformat(),
        'status': 'running',
        'reason': 'Installed ffprobe raw -show_data crashes at avtextformat.c:562; use codec extradata SHA256.',
        'sourceSHA256': {str(p): proof.digest(p) for p in sources},
        'ffprobeSHA256': proof.digest(proof.FFPROBE),
        'ffprobeVersion': subprocess.check_output([str(proof.FFPROBE), '-version'], text=True).splitlines()[0],
        'probeChange': '-show_data -> -show_data_hash sha256',
        'comparisonChange': 'extradata -> extradata_hash; hash presence and syntax required',
        'otherProductionAndVerificationLogicUnchanged': True,
    }
    proof.save(evidence, record)
    proof.probe = compatible_probe
    mux.probe = compatible_probe
    mux.COMPATIBILITY_FIELDS = tuple('extradata_hash' if key == 'extradata' else key
                                     for key in mux.COMPATIBILITY_FIELDS)
    try:
        mux.main()
        record['status'] = 'completed'
        record['videoSHA256'] = proof.digest(mux.V11_VIDEO)
        record['markerSHA256'] = proof.digest(mux.V11_MARKER)
        proof.require(all(proof.digest(Path(p)) == h for p, h in record['sourceSHA256'].items()),
                      'A compatibility or frozen source changed during assembly')
    except BaseException as error:
        record['status'] = 'failed'
        record['error'] = str(error)
        raise
    finally:
        record['finishedAtUTC'] = datetime.now(timezone.utc).isoformat()
        proof.save(evidence, record)


if __name__ == '__main__':
    main()
