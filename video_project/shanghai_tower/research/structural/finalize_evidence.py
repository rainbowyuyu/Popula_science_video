from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent
manifest_path = ROOT / 'source-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
sources = {s['id']: s for s in manifest['sources']}
sources['zhao2011'].update({
    'pdfUrl': 'https://scholar.archive.org/work/uijqo5swnnb6vm452fgvww5sza/access/wayback/https://core.ac.uk/download/pdf/82001482.pdf',
    'local': 'zhao2011-archive.pdf',
    'status': 'Complete 9-page published PDF downloaded, extracted and read',
    'license': 'PDF states CC BY-NC-ND',
})
sources['zhu_design'] = {
    'id': 'zhu_design', 'title': 'Structural Design Challenges of Shanghai Tower',
    'authors': 'Yi Zhu; Dennis Poon; Emmanuel E. Velivasakis; Steve Zuo; Paul Fu',
    'year': None, 'yearNote': 'Search metadata associates a related version with 2012; this 19-page manuscript itself lacks verified publication date. Filename is search label only.',
    'doi': None, 'pdfUrl': 'http://eeme.ntua.gr/proceedings/8th/Invited_Speakers/PAP_Velivasakis.pdf',
    'local': 'zhu2012-http.pdf', 'primary': True,
    'version': 'Designer-authored manuscript hosted on original conference proceedings server; 19 PDF pages',
}
sources['ding2013'] = {
    'id': 'ding2013', 'title': 'Structural analysis and health monitoring of Shanghai Tower in construction stage',
    'authors': 'Jiemin Ding; Qilin Zhang; Xin Zhao; Congzhi Yan; Lang Huang',
    'year': 2013, 'publisher': 'SHMII-6, Hong Kong, 9–11 December 2013',
    'pdfUrl': 'https://ishmii.org/wp-content/uploads/2015/04/MS05-01.pdf',
    'local': 'ding2013-construction.pdf', 'primary': True,
}
sources['li2013'] = {
    'id': 'li2013', 'title': 'Analysis and monitoring of construction phase internal forces of Shanghai Tower considering time-dependent effect',
    'authors': 'Han Li; Lu Chen; Jia Lv; Jia Hu; Qi-lin Zhang; Xin Zhao',
    'year': 2013, 'publisher': 'SHMII-6, Hong Kong, 9–11 December 2013',
    'pdfUrl': 'https://ishmii.org/wp-content/uploads/2015/04/MS05-03.pdf',
    'local': 'dingtimed2013-construction.pdf', 'primary': True,
    'filenameNote': 'Historical retrieval label is ding; cite the actual first author Li.',
}
for source in sources.values():
    path = ROOT / source['local']
    source['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    source['bytes'] = path.stat().st_size
    source['accessed'] = '2026-10-08'
manifest.update({'checked': '2026-10-08', 'pageConvention': 'one-based local PDF pages', 'sources': list(sources.values())})
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def val(value, units, source, page, note=None):
    entry = {'value': value, 'units': units, 'sourceId': source, 'pdfPage': page, 'status': 'verified_in_source'}
    if note:
        entry['note'] = note
    return entry

data = {
    'checked': '2026-10-08',
    'scope': 'Verified literature values, not complete as-built CAD or engineering design inputs. Reconstructed/assumed values must remain separate.',
    'geometry': {
        'architecturalHeight': val(632, 'm', 'su2013', 5),
        'structuralHeight': val(580, 'm', 'su2013', 5),
        'strengtheningLevelElevations': val([33.45, 99.00, 173.70, 239.40, 314.10, 393.30, 465.40, 542.00], 'm', 'su2013', 6, 'Figure 1b, not exact outrigger chord elevations'),
        'coreBaseFootprint': val([30, 30], 'm', 'su2013', 7),
        'coreConfigurations': val({'zones1to4': 'nine-cell square', 'zones5to6': 'cut-corner transition', 'zones7to8': 'five-cell cross', 'top': 'three-cell rectangle'}, None, 'su2013', [7, 8], 'Exact transition coordinates reconstructed from Figure 3'),
        'outerCoreWallThicknessEndpoints': val([1.2, 0.5], 'm', 'zhu_design', 10, 'Five thickness steps, exact floor schedule not obtained'),
        'interiorCoreWallThicknessEndpoints': val([0.9, 0.5], 'm', 'zhu_design', 10),
        'supercolumnCounts': val({'toZone8': 8, 'additionalDiagonalToZone5': 4}, None, 'su2013', 8),
        'supercolumnUndergroundMaximumSection': val([5.3, 4.3], 'm', 'su2013', 8),
        'supercolumnZone1Section': val([5.1, 3.7], 'm', 'ou2013', 2),
        'supercolumnTopMinimumSection': val([2.4, 1.9], 'm', 'su2013', 8),
        'outriggerZones': val([2, 4, 5, 6, 7, 8], None, 'su2013', 6),
        'beltTrussSets': val(8, 'two-storey double-belt spatial trusses', 'zhu_design', 11),
        'officeSlab': val({'totalDepth': 0.155, 'deckHeight': 0.075, 'concreteAboveDeck': 0.080}, 'm', 'zhu_design', 12),
        'matThickness': val(6, 'm', 'zhu_design', 8),
        'piles': val({'count': 947, 'diameter': 1, 'effectiveLengthRange': [52, 56]}, 'm except count', 'zhu_design', 8),
    },
    'geometryConflicts': [{
        'parameter': 'inner floor plate diameter',
        'versions': [val([83.6, 42], 'm', 'chen2013', 2), val([82.2, 46.5], 'm', 'zhu_design', 6)],
        'resolution': 'Unresolved possible version or measurement-definition difference. Declare chosen source and interpolation.'
    }],
    'materials': {
        'coreConcrete': val('C60', 'strength grade', 'su2013', 7),
        'supercolumnEmbeddedSteelAreaRatio': val([0.04, 0.06], 'fraction', 'zhu_design', 11),
        'actualElasticModulus': {'status': 'not_obtained'},
        'actualMassDensity': {'status': 'not_obtained'},
    },
    'construction': {
        'columnLagBehindCore': val([6, 9], 'floors', 'li2013', 2),
        'slabLagBehindColumns': val([4, 7], 'floors', 'li2013', 2),
        'typicalCycleLowerToUpper': val([8, 4], 'days/floor', 'li2013', 2),
        'curtainwallStartsAtHeightFraction': val(1/3, 'fraction of construction height', 'li2013', 2),
        'outriggerLockIn': val({'duringZone7Construction': [2, 4, 5], 'duringZone8Construction': [6], 'structuralTopOut': [7, 8]}, 'outrigger zone numbers', 'ding2013', 4),
    },
    'dynamics': {
        'designPeriodsETABS': val([9.05, 8.96, 5.59, 3.31, 3.20, 2.62], 's', 'zhu_design', 12, 'First three modes X translation, Y translation, torsion; design model, not measured'),
        'operationalSpectralFrequencies': val([0.106, 0.204, 0.320, 0.440], 'Hz', 'wu2021', 10, '2018 typhoons; frequency depends on amplitude'),
        'tmdMass': val(1000000, 'kg', 'wu2021', 3, '1000 metric tons at floor125; passive eddy-current TMD'),
        'smallAmplitudeStructuralDampingIntercept': val({'X': 0.0057, 'Y': 0.0056}, 'fraction', 'wu2021', [16, 17], 'Fit intercept; not universal effective damping'),
    },
    'wind': {
        'referenceSpeed': val({'at10m': 31.7, 'at500m': 50.0}, 'm/s', 'zhao2011', 3, '100-year return period, 10-minute mean, terrain B'),
        'shapeComparisonBaseMoment': val({'rectangular': 6.22e10, 'twist120initial0': 4.75e10}, 'N m', 'zhao2011', 4, 'Table2, 100-year with damping2%; only this comparison supports ~24% reduction'),
        'designWindTunnelBaseResponse': val({'shear': 1.03e8, 'moment': 3.80e10}, 'N and N m', 'zhao2011', 6, 'Table4 dynamic design case. Not validation target for synthetic mean-wind static load.'),
    },
    'unverifiedInputs': ['exact column center coordinates', 'exact outrigger chord elevations', 'intermediate section schedule', 'actual material E/rho', 'floor and crown mass distribution', 'connection stiffness', 'foundation stiffness', 'raw time-history wind pressure'],
}
(ROOT/'verified-parameters.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Wrote {len(sources)} verified source records and parameter manifest.')
