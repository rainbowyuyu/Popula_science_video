"""Bind independent sampled-frame observations to completed render segments.

This records visual inspection of the listed stills/contact sheets, not a
continuous normal-speed viewing or an audio listening review.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'encoded-boundaries'
REV = '2afc39fce9ba'
observations = {
    'ocean_to_desk': {
        'assessment': 'pass_with_minor_transition_note',
        'notes': [
            'Drafting-sheet to desk approach remains directionally coherent in frames 744–816.',
            'At 779 the arriving model briefly touches the faint entering headline edge; it clears by 792. No held unreadable headline or exposed model replacement is observed.'
        ]
    },
    'ocean_desk_wipe': {
        'assessment': 'pass',
        'notes': [
            'Outgoing title clears before the ocean structure exits to the left.',
            'Drawing sheet covers the boundary at frames 724 and 725; incoming desk geometry appears after the covered switch.',
            'No exposed instantaneous structural replacement in the sampled boundary.'
        ]
    },
    'recovery_to_recheck': {
        'assessment': 'pass_with_minor_transition_note',
        'notes': [
            'No overlapping headlines or model pop in frames 1976–2048.',
            'Carousel clips outgoing and incoming text at the viewport edges around 2000–2024. The fragments occupy separate areas rather than overlapping each other.',
            'Incoming layout is fully settled by frame 2036. This is a temporary sliding crop, not a held clipping error.'
        ]
    },
    'recheck_to_selection': {
        'assessment': 'pass_with_minor_transition_note',
        'notes': [
            'No overlapping headlines or model pop in frames 2407–2479.',
            'Outgoing punctuation and recheck label, and incoming heading, are briefly clipped by the moving carousel viewport around 2431–2455.',
            'Incoming selection layout is fully settled by frame 2467; the visible automatic recheck wording is correct.'
        ]
    },
    'selection_to_physics': {
        'assessment': 'pass',
        'notes': [
            'Desk model moves offscreen before drafting sheet covers the scene.',
            'Frames 2865/2866 show the sheet covering the boundary. It then clears to ocean and the platform enters from the left by 2902.',
            'No exposed scene switch or title overlap in the sampled transition.'
        ]
    },
    'final_physics_scope': {
        'assessment': 'pass',
        'notes': [
            'Frame 3082 inspected at 1920×1080: final text reads 存档独立回放 · 非论文验证 and remains legible.',
            'Zwind final verification headline, saved response plot and four visible fairlead chains are separately readable without critical occlusion.',
            'The visible scope avoids presenting the independent saved replay as the paper design verification.'
        ]
    },
    'certificate_to_close': {
        'assessment': 'pass',
        'notes': [
            'Frames 5816–5876 inspected: outgoing tabletop platform exits toward the right; a full drafting sheet covers frames 5839/5840.',
            'The final ocean turbine enters from the left after the covered scene switch and settles right of the incoming end title.',
            'No exposed instantaneous structural replacement or title collision in the sampled transition.'
        ]
    },
    'final_close': {
        'assessment': 'pass',
        'notes': [
            'Frames 6086 and 6234 inspected at 1920×1080: closing headline and sharp Ocean College vector logo remain readable.',
            'Tower, nacelle, platform and three external columns remain visible. At 6086 the bottom subtitle temporarily crosses the front-platform vicinity but not the title or nacelle.',
            'The end copy says design process is traceable; it does not claim every generated output is physically verified.'
        ]
    },
    'final_last_frame': {
        'assessment': 'pass',
        'notes': [
            'Last encoded frame 6263 inspected at 1920×1080: title has cleared, with the ocean turbine and logo still present.',
            'No black frame or empty-ocean-only ending. Chains can extend beyond the lower frame boundary as scene geometry.'
        ]
    },
    'research_numbers': {
        'assessment': 'pass_with_minor_composition_note',
        'notes': [
            'Frame 3601 shows 278→247.9 t/MW and −10.8%; these match the current manuscript.',
            'Frame 4074 shows 602 tonnes and 5560→4958 t as an equal-20-MW conversion. Narration caption says approximately 602 tonnes.',
            'Frame 4469 shows 14185→14041 kN including safety factor, limit 20165.9 kN, pitch 8.02→9.56°, limit 10°.',
            'Frame 4469 full-size inspection: the right end of the tension comparison bar lightly touches the left-column contour, but no number or label is obscured.',
            'Research values are independently listed and the geometry is labeled schematic.'
        ]
    }
}

sampling = json.loads((OUT / 'sampling.json').read_text(encoding='utf-8'))
assert sampling['revision'] == REV
reviewed = []
for group in sampling['groups']:
    if group['name'] not in observations:
        continue
    for frame in group['frames']:
        assert sha256((ROOT / frame['file']).read_bytes()).hexdigest() == frame['sha256']
    sheet = ROOT / group['sheet']
    reviewed.append({
        **group,
        'visualReviewPassed': True,
        'sheetSHA256': sha256(sheet.read_bytes()).hexdigest(),
        **observations[group['name']],
    })

report = {
    'schema': 'v20-independent-encoded-frame-review-v1',
    'revision': REV,
    'updatedAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Inspection of decoded stills/contact sheets extracted from SHA-verified completed segments.',
    'blockingFindings': [],
    'reviewedGroups': reviewed,
    'pendingGroups': sampling['pending'],
    'frameCount': sum(len(g['frames']) for g in reviewed),
    'fullContinuousWatch': False,
    'audioListeningPerformed': False,
    'wholeFinalFileApproval': False,
}
(OUT / 'review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'revision': REV, 'reviewedFrames': report['frameCount'], 'pending': report['pendingGroups']}))
