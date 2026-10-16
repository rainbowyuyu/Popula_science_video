"""Read-only static evidence extraction from the user-supplied ETABS EDB.

This is NOT an EDB importer or solver. Numeric record candidates are explicitly
unvalidated until exported by a supported ETABS version. Never executes EDB or
any downloaded binary. Writes only its own audit directory.
"""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
import argparse
import hashlib
import json
import re
import struct

OUT = Path(__file__).resolve().parent
DEFAULT = Path('C:/Users/zju/Downloads/7de1922b76fe33023854/mod2.EDB')


def redacted_history(text):
    # Preserve project/revision identity, omit unrelated path prefixes and names.
    m = re.match(r'(ETABS .*? File (?:saved as|imported from)\s+)(.*?)( at\s+.*)', text)
    if not m:
        return text
    head, path, tail = m.groups()
    markers = ['28571.00-Shanghai center', '28571-Shanghai Center',
               'Shanghai\\Belt Truss Design', '上海中心', '20090921SH-ETAB_SEP2109']
    selected = next((path[path.index(k):] for k in markers if k in path), None)
    path = '[project path]\\' + (selected if selected is not None else path.rsplit('\\', 1)[-1])
    path = re.sub(r' from [^\\.]+(?=\.(?:EDB|e2k|\$ET))', ' from [name omitted]', path, flags=re.I)
    return head + path + tail


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=DEFAULT)
    args = parser.parse_args()
    source = args.input.resolve(strict=True)
    before = source.stat()
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    header = [data[a:a+16].decode('ascii').strip() for a in [0, 16, 32]]

    history = []
    pat = rb'ETABS (?:Nonlinear(?: I)?|Display|Educational) [^\r\n\x00]{1,2000}'
    for match in re.finditer(pat, data):
        line = match.group().decode('gb18030', errors='strict')
        if 'File saved as' not in line and 'File imported from' not in line:
            continue
        vm = re.match(r'ETABS (.*?) (\d+\.\d+\.\d+) ', line)
        history.append({'offset': match.start(), 'lengthBytes': len(match.group()),
                        'version': vm.group(2) if vm else None,
                        'mode': vm.group(1) if vm else None,
                        'text': redacted_history(line)})

    # Bounded examination of the visible level-like record region. These fields
    # are observed bytes and arithmetic consistency, not an official schema.
    start = data.find(b'Z9_C18')
    end = data.find(b'BASE', start)
    candidates = []
    if start >= 2 and end > start:
        for offset in range(start-2, end):
            n = struct.unpack_from('<H', data, offset)[0]
            if not 1 <= n <= 16:
                continue
            name = data[offset+2:offset+2+n]
            if not re.fullmatch(rb'(?:Z9_C\d+|\d{1,3}(?: MEP)?|B\d+|BASE)', name):
                continue
            flag, first, second, third = struct.unpack_from('<Iddd', data, offset+2+n)
            if not (flag < 10000 and 0 <= first <= 20000 and -50000 <= second <= 700000 and third == 0):
                continue
            if first < 100 and name != b'BASE':
                continue
            candidates.append({'offset': offset+2, 'label': name.decode('ascii'),
                               'rawFlag': flag, 'rawNumber1': first, 'rawNumber2': second})
    adjacency = []
    for upper, lower in zip(candidates, candidates[1:]):
        adjacency.append(abs((upper['rawNumber2']-lower['rawNumber2'])-upper['rawNumber1']))

    names = []
    for m in re.finditer(rb'[\x20-\x7e]{3,60}', data[:750000]):
        s = m.group().decode('ascii')
        if re.fullmatch(r'(?:STEELQ345GJ|CONC|STEEL|C(?:35|50|60|70|80)|WALL\d+C\d+|SC\d+ZONE\w+|NSC\d+ZONE\w+|FINWALL\w+\)?|MECH200(?:CORE)?|MEPTOP|PODIUM|LOBBY125|OBSERVATION125|OFFICE125|RETAIL125|PARKING125|ROOF125)', s):
            names.append({'offset': m.start(), 'text': s})

    unit_tokens = ['N, mm', 'kN, m', 'N-mm', 'kN-m', 'KN-M', 'Units', 'UNITS']
    unit_scan = {t: data.find(t.encode()) for t in unit_tokens}
    after = source.stat()
    after_digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert digest == after_digest and before.st_size == after.st_size and before.st_mtime_ns == after.st_mtime_ns
    report = {
        'recordedAtUTC': datetime.now(timezone.utc).isoformat(),
        'input': str(source), 'bytes': len(data), 'sha256': digest,
        'readOnly': True, 'sourceCopiedByThisScript': False,
        'EDBExecuted': False, 'downloadedBinaryExecuted': False,
        'sourceUnchangedSHA256SizeMtime': True,
        'header': {'software': header[0], 'formatMarker': header[1], 'versionMarker': header[2]},
        'projectAssociation': 'Shanghai Center project association confirmed by strong internal history evidence',
        'solverReady': False, 'originalLuOpenSeesInput': False,
        'asBuiltOrFinalDesignModelVerified': False,
        'modelCompletenessVerified': False, 'authorAuthenticationVerified': False,
        'historyCount': len(history), 'historyVersionCounts': dict(Counter(h['version'] for h in history)),
        'historyFirst': history[0] if history else None, 'historyLast': history[-1] if history else None,
        'historyContainsShanghaiProject': sum(('Shanghai' in h['text'] or '上海中心' in h['text']) for h in history),
        'designStageEvidence': '2009 core layout / 100% DD / revision history; last visible save 2010-11-07 after text import into ETABS 9.2.0',
        'levelCandidates': {
            'officialSchemaParsed': False, 'classification': 'visible labels with locally consistent raw scalar pairs',
            'count': len(candidates), 'first': candidates[0] if candidates else None,
            'last': candidates[-1] if candidates else None,
            'uniqueLabels': len(set(c['label'] for c in candidates)),
            'adjacentDifferenceEqualsFirstScalarCount': sum(x < 1e-6 for x in adjacency),
            'adjacentPairCount': len(adjacency), 'maxResidualRaw': max(adjacency, default=0),
            'millimetreInterpretation': 'Plausible: top raw 632000 maps to 632 m, but unit and official story tables require supported ETABS export',
            'notActualOccupiedFloorCount': True,
        },
        'unitTokenSearchFirstOffsets': unit_scan, 'unitVerified': False,
        'nodeCount': None, 'elementCount': None, 'loadCasesVerified': False,
        'warnings': [
            'Header is 9.2.0; history also includes 9.5.0/9.6.0/9.7.1 and an Educational 9.2.0 text import. Audit conversion warnings in a supported ETABS workflow.',
            'Save paths establish project association, not author authentication, as-built status, completeness or solver validity.',
            'Do not feed inferred numeric records or raw EDB into the verified solver pipeline.',
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, value in [('audit.json', report), ('history-redacted.json', history),
                        ('level-label-candidates.json', candidates), ('visible-structural-names.json', names)]:
        (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'sha256':digest, 'header':report['header'], 'historyCount':len(history),
                      'historyVersionCounts':report['historyVersionCounts'],
                      'levelCandidates':report['levelCandidates'], 'sourceUnchanged':True}, ensure_ascii=True))


if __name__ == '__main__':
    main()
