"""Measure the finished delivery and extract actual encoded frames for visual review.

No source-video edits. With --wait, readiness is checked silently once per 60 s.
Automated measurements never certify a full human audiovisual viewing.
--video and --out accept absolute paths or paths relative to the shell directory.
"""
from __future__ import annotations
import argparse
from array import array
from collections import defaultdict
from datetime import datetime, timezone
from fractions import Fraction
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFont, JpegImagePlugin, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/ShanghaiTower_1080p.mp4'
MARKER = ROOT / 'tmp/final-render.json'
OUT = ROOT / 'research/qa/final-check'
EXPECTED = {'width': 1920, 'height': 1080, 'fps': 30}
OFFSETS = [-45, -20, 0, 20, 45]
DETAIL_IDS = ['s001','s002','s006','s007','s008','s010','s011','s013','s016','s018','s019','s020','s025','s027','s029','s031','s033','s035','s036','s037','s040','s041','s042','s043','s044','s045']


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def timeline_frames(timeline):
    return timeline['durationFrames'] if 'durationFrames' in timeline else timeline['duration']


def matching_marker(timeline):
    """An unrelated prior render must never supply readiness or patch records."""
    if not MARKER.exists():
        return None
    try:
        marker=json.loads(MARKER.read_text(encoding='utf-8-sig'))
        output=marker.get('outputLocation')
        if not isinstance(output,str) or not output.strip():
            return None
        target=Path(output).expanduser()
        # render.mjs writes absolute paths; project-relative markers are accepted
        # only after explicitly resolving against the render project's directory.
        target=target if target.is_absolute() else ROOT/target
        valid=(marker.get('success') is True
               and marker.get('frames')==[0,timeline_frames(timeline)-1]
               and target.resolve()==VIDEO.resolve())
        return marker if valid else None
    except (OSError, ValueError, TypeError, KeyError):
        return None


def ready():
    if not VIDEO.exists() or not VIDEO.is_file() or not VIDEO.stat().st_size:
        return False
    try:
        timeline=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf-8-sig'))
        return matching_marker(timeline) is not None
    except (OSError, ValueError, TypeError, KeyError):
        return False


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def path_label(path):
    """Keep project paths short while permitting QA output anywhere requested."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path.resolve())


def environment_qa_binding(qa, environment_sha):
    """Accept both saved report schemas while checking their actual digest."""
    pass_fields=[key for key in ('allPassed','passed') if key in qa]
    digests={}
    if 'environmentResponseSHA256' in qa:
        digests['environmentResponseSHA256']=qa['environmentResponseSHA256']
    source_hashes=qa.get('sourceHashes',{})
    if isinstance(source_hashes,dict) and 'environment' in source_hashes:
        digests['sourceHashes.environment']=source_hashes['environment']
    passed=bool(pass_fields) and all(qa[key] is True for key in pass_fields)
    matches=bool(digests) and all(value==environment_sha for value in digests.values())
    return {'passFields':pass_fields,'declaredPassed':passed,'recordedDigests':digests,
            'actualEnvironmentSHA256':environment_sha,'hashesMatch':matches,'passed':passed and matches}


def response_display_evidence(paths):
    """Read V10 metadata and recover the exact selected-web display range."""
    required=('physicsResponse','physicsSummary','shellResponse','cinematicResponse')
    missing=[name for name in required if not paths[name].is_file()]
    if missing:
        return {'available':False,'missing':missing}
    response=json.loads(paths['physicsResponse'].read_text('utf-8-sig'))
    summary=json.loads(paths['physicsSummary'].read_text('utf-8-sig'))
    shell=json.loads(paths['shellResponse'].read_text('utf-8-sig'))
    cinematic=json.loads(paths['cinematicResponse'].read_text('utf-8-sig'))
    record={'available':True,'modelVersion':response.get('modelVersion'),
            'metadataSources':{key:path_label(paths[key]) for key in required},
            'wallCount':len(response.get('walls',[])),
            'wallStressMeaning':response.get('visualization',{}).get('wallStress'),
            'shellSchema':shell.get('schema'),'shellWindIncrementLimitMPa':shell.get('displayLimitMPa'),
            'shellGravityLimitMPa':shell.get('gravityDisplayLimitMPa'),
            'shellDisplayRangeScope':shell.get('displayRangeScope'),
            'responseSemantics':cinematic.get('semantics'),
            'memberRoleRanges':summary.get('roleStressLimits',{})}
    if not record['wallCount']:
        return record
    binary=ROOT/'public'/cinematic['binary']
    record['cinematicBinary']={'path':path_label(binary),'sha256':sha(binary),
        'recordedSHA256':cinematic.get('sha256')}
    record['cinematicBinary']['matchesMetadata']=record['cinematicBinary']['sha256']==cinematic.get('sha256')
    member_ids=cinematic['memberIds']
    selected={str(member['id']) for member in response['members']
        if any(re.fullmatch(r'FE_M_Z04_C03_OX[12]',mesh) for mesh in member.get('meshIds',[]))}
    selected_indices=[i for i,member_id in enumerate(member_ids) if str(member_id) in selected]
    field=cinematic['fields']['axialMPa']
    count=field['shape'][1]
    if (cinematic.get('dtype')!='little-endian float32' or count!=len(member_ids)
            or field['length']!=math.prod(field['shape']) or not selected_indices):
        raise ValueError('Selected-web stress metadata is inconsistent or missing.')
    values=array('f')
    with binary.open('rb') as stream:
        stream.seek(field['offsetBytes']);values.fromfile(stream,field['length'])
    if sys.byteorder!='little':values.byteswap()
    peak=max(abs(values[offset+i]) for offset in range(0,len(values),count) for i in selected_indices)
    power=10**math.floor(math.log10(peak)) if peak>0 else 1
    limit=next((v*power for v in (1,2,3,5,8,10) if v*power>=peak),10*power) if peak>0 else 1
    record['selectedWeb']={'meshIds':['FE_M_Z04_C03_OX1','FE_M_Z04_C03_OX2'],
        'memberIds':[member_ids[i] for i in selected_indices],'sampleCount':field['shape'][0],
        'peakAbsoluteMPa':peak,'fixedSymmetricLimitMPa':limit,
        'derivation':'Actual full-duration axialMPa float32 samples; same upward 1/2/3/5/8/10 range rounding as PhysicsPlayback.'}
    return record


def source_evidence():
    """Record current inputs separately from encoded-frame visual verification."""
    paths={name:ROOT/relative for name,relative in {
        'environment':'public/physics/environment-response.json',
        'environmentQA':'public/physics/environment-qa.json',
        'modelManifest':'public/models/shanghai-tower-manifest.json',
        'publicTimeline':'public/timeline.json',
        'sourceTimeline':'src/timeline.json',
        'environmentPlayback':'src/EnvironmentPlayback.ts',
        'physicsPlayback':'src/PhysicsPlayback.ts',
        'physicsResponse':'public/physics/response.json',
        'physicsSummary':'public/physics/run-summary.json',
        'shellResponse':'public/physics/shell-response.json',
        'cinematicResponse':'public/physics/cinematic-response.json',
        'film':'src/Film.tsx',
        'world':'src/World.ts',
    }.items()}
    evidence={'files':{name:{'path':path_label(path),'sha256':sha(path)}
                        for name,path in paths.items() if path.is_file()},
              'scope':'Current source/data evidence, not proof of the rendered image or the render-time bundle. '
                      'Stress-category transitions and TMD visual motion still require encoded-frame review.'}
    if paths['modelManifest'].is_file():
        manifest=json.loads(paths['modelManifest'].read_text('utf-8-sig'))
        evidence['modelPartCount']=len(manifest.get('parts',[]))
    if paths['environmentQA'].is_file() and paths['environment'].is_file():
        qa=json.loads(paths['environmentQA'].read_text('utf-8-sig'))
        evidence['environmentQABinding']=environment_qa_binding(qa,evidence['files']['environment']['sha256'])
        evidence['environmentMatchesPassedNumericalQA']=evidence['environmentQABinding']['passed']
    if paths['sourceTimeline'].is_file() and paths['publicTimeline'].is_file():
        source=json.loads(paths['sourceTimeline'].read_text('utf-8-sig'))
        public=json.loads(paths['publicTimeline'].read_text('utf-8-sig'))
        evidence['publicTimelineMatchesSource']=source==public
        evidence['timelineFrames']=timeline_frames(source)
    if paths['environmentPlayback'].is_file():
        code=paths['environmentPlayback'].read_text('utf-8-sig')
        match=re.search(r'export\s+const\s+TMD_RELATIVE_MAGNIFICATION\s*=\s*([\d.]+)',code)
        evidence['tmdRelativeMagnificationFromSource']=float(match.group(1)) if match else None
    if paths['physicsPlayback'].is_file():
        code=paths['physicsPlayback'].read_text('utf-8-sig')
        match=re.search(r'this\.bendingMode\s*=\s*u\s*>=\s*([\d.]+)\s*&&\s*u\s*<=\s*([\d.]+)',code)
        evidence['coreBendingClipProgressRangeFromSource']=[float(v) for v in match.groups()] if match else None
        display=response_display_evidence(paths);evidence['responseDisplayMetadata']=display
        if display.get('wallCount',0)>0:
            web=display['selectedWeb']['fixedSymmetricLimitMPa']
            shell=display['shellWindIncrementLimitMPa']
            column=display['memberRoleRanges']['megacolumn']['fixedFullRangeMPa']
            evidence['visualReviewExpectations']=[
                f'Outrigger close-up: the two selected diagonal webs share a fixed -{web:g}..+{web:g} MPa wind-induced axial increment scale derived from all stored samples; other members stay neutral.',
                f'Core close-up: fixed -{shell:g}..+{shell:g} MPa signed longitudinal membrane-stress increment, recovered as mean of four Gauss N22/thickness from wall shells; legend matches the signed field.',
                f'Then mega-column close-up: fixed -{column:g}..+{column:g} MPa signed wind-induced axial increment, with matching legend.',
                'The displayed increments are relative to converged gravity; positive increment does not alone mean net tensile stress. Ranges are fixed across frames and do not denote capacity.',
                'TMD relative motion uses stored coupled-solver samples; the source magnification is recorded above.',
            ]
        else:
            evidence['visualReviewExpectations']=['Wall-shell metadata unavailable; inspect the recorded response version and rendered legend before assigning any stress range.']
    return evidence


class Runner:
    def __init__(self):
        self.commands = []

    def run(self, name, args, accept_failure=False):
        print(f'QA {name}', flush=True)
        started = now()
        clock = time.monotonic()
        process = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
        (OUT / f'{name}.stdout.txt').write_text(process.stdout, encoding='utf-8')
        (OUT / f'{name}.stderr.txt').write_text(process.stderr, encoding='utf-8')
        self.commands.append({'name': name, 'command': args, 'startedAtUTC': started,
                              'seconds': round(time.monotonic() - clock, 3), 'exitCode': process.returncode})
        write_json(OUT / 'commands.json', self.commands)
        if process.returncode and not accept_failure:
            raise RuntimeError(f'{name} failed with {process.returncode}: {process.stderr[-1200:]}')
        return process


@lru_cache(maxsize=8)
def font(size):
    for path in [ROOT/'audio/font-sources/NotoSansSC-VF.ttf',Path('C:/Windows/Fonts/arial.ttf')]:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def contact(path, title, items, columns=2, width=640):
    """Each item is a frame number and an independently readable provenance label."""
    gap = 14
    label_height = 42 if width >= 600 else 33
    image_height = round(width * 9 / 16)
    header = 66
    rows = math.ceil(len(items) / columns)
    canvas = Image.new('RGB', (gap + columns * (width + gap),
                              header + gap + rows * (image_height + label_height + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 14), title, fill='#29484a', font=font(30))
    for index, (frame, label) in enumerate(items):
        x = gap + (index % columns) * (width + gap)
        y = header + gap + (index // columns) * (image_height + label_height + gap)
        with Image.open(OUT / 'frames' / f'frame-{frame:06d}.jpg') as original:
            canvas.paste(original.resize((width, image_height), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 4, y + image_height + 5), label, fill='#29484a', font=font(25 if width >= 600 else 20))
    canvas.save(path, quality=93, subsampling=0)


def build_plan(timeline):
    fps = timeline['fps']
    total = timeline_frames(timeline)
    clamp = lambda frame: max(0, min(total - 1, int(frame)))
    plan = defaultdict(list)
    representatives = []
    section_boundaries = []
    clip_boundaries = []
    details = []
    for clip in timeline['clips']:
        frame = clamp(math.floor(clip['start'] + clip['duration'] * .7))
        representatives.append({'id': clip['id'], 'section': clip['section'], 'frame': frame,
                                'timeSeconds': frame / fps, 'caption': clip.get('caption',clip['text'])})
        plan[frame].append(f"representative:{clip['id']}:70percent")
    seen = set()
    for section in timeline['sections']:
        for edge in ['start', 'end']:
            center = section[edge]
            if center in seen:
                continue
            seen.add(center)
            row = {'label': f"section:{section['id']}:{edge}", 'center': center, 'frames': []}
            for offset in OFFSETS:
                frame = clamp(center + offset)
                row['frames'].append({'offset': offset, 'frame': frame})
                plan[frame].append(f"{row['label']}:{offset:+d}")
            section_boundaries.append(row)
    for clip in timeline['clips']:
        if clip['id'] not in DETAIL_IDS:
            continue
        row={'id':clip['id'],'section':clip['section'],'frames':[]}
        for phase in [.15,.35,.55,.75,.95]:
            frame=clamp(clip['start']+clip['duration']*phase)
            row['frames'].append({'phase':phase,'frame':frame})
            plan[frame].append(f"detail:{clip['id']}:{phase:.2f}")
        details.append(row)
    # Every sentence boundary receives before / crossing / after samples, so
    # continuous camera changes within a chapter are not missed by chapter QA.
    for clip in timeline['clips'][1:]:
        center=clip['start'];row={'label':f"clip:{clip['id']}:start",'center':center,'frames':[]}
        for offset in OFFSETS:
            frame=clamp(center+offset);row['frames'].append({'offset':offset,'frame':frame})
            plan[frame].append(f"{row['label']}:{offset:+d}")
        clip_boundaries.append(row)
    coda_start = timeline.get('outro',{}).get('start',total-round(9*fps))
    coda_length=total-coda_start
    coda = [clamp(coda_start+round(coda_length*phase)) for phase in [0,.08,.18,.35,.67,.995]]
    for frame in coda:
        plan[frame].append('paper_coda')
    patch_boundaries=[]
    # Only the actual final render marker can declare applied patches. An old
    # plan may survive a later full render and must not be presented as applied.
    render_record=matching_marker(timeline) or {}
    if render_record.get('patches'):
        for patch in render_record['patches']:
            for edge,center in [('start',patch['start']),('end',patch['end']+1)]:
                if center>=total:continue
                row={'label':f"patch:{patch['start']}:{edge}",'center':center,'frames':[]}
                for offset in [-2,-1,0,1,2]:
                    frame=clamp(center+offset);row['frames'].append({'offset':offset,'frame':frame})
                    plan[frame].append(f"{row['label']}:{offset:+d}")
                patch_boundaries.append(row)
    for center in render_record.get('seams', []):
        if not isinstance(center, int) or not 0 < center < total:
            raise ValueError('Invalid encoded segment seam in render marker')
        row={'label':f'segment-seam:{center}','center':center,'frames':[]}
        for offset in [-2,-1,0,1,2]:
            frame=clamp(center+offset);row['frames'].append({'offset':offset,'frame':frame})
            plan[frame].append(f"{row['label']}:{offset:+d}")
        patch_boundaries.append(row)
    plan[0].append('first_frame')
    plan[total - 1].append('last_frame')
    for frame in [2100,2209,2280,2410]:
        plan[clamp(frame)].append('foundation-world-anchor-check')
    for frame in [600,710,779,904,1380,1414,1435,1530,3990,4406,5110,6430,6750,
                  9430,10200,10890,11140,11220,11380,12420,12519,15570]:
        plan[clamp(frame)].append('v10-frozen-reference-comparison')
    return {'fps': fps, 'durationFrames': total, 'representatives': representatives,
            'sectionBoundaries': section_boundaries, 'clipBoundaries': clip_boundaries, 'detailPhases':details, 'patchBoundaries':patch_boundaries,
            'codaFrames': coda, 'frames': [{'frame': f, 'timeSeconds': f / fps, 'reasons': plan[f]}
                                        for f in sorted(plan)]}


def main():
    global VIDEO, OUT
    parser = argparse.ArgumentParser()
    parser.add_argument('--video',type=Path,default=VIDEO,
                        help='Selected MP4; absolute or relative to the current shell directory.')
    parser.add_argument('--out',type=Path,default=OUT,
                        help='QA output directory; absolute or relative to the current shell directory.')
    parser.add_argument('--wait', action='store_true', help='Silently check readiness once per 60 seconds.')
    parser.add_argument('--plan-only',action='store_true',help='Write the frame review manifest without needing a completed MP4.')
    args = parser.parse_args()
    VIDEO=args.video.expanduser().resolve()
    OUT=args.out.expanduser().resolve()
    if args.plan_only:
        OUT.mkdir(parents=True,exist_ok=True)
        timeline=json.loads((ROOT/'src/timeline.json').read_text('utf-8-sig'))
        plan=build_plan(timeline);write_json(OUT/'frame-manifest.json',plan)
        print(json.dumps({'plannedFrames':len(plan['frames']),'representatives':len(plan['representatives']),
            'clipBoundaries':len(plan['clipBoundaries']),'detailSequences':len(plan['detailPhases'])}),flush=True)
        return 0
    if args.wait and not ready():
        print(f'WAITING for final-render.json to certify {VIDEO}; checks every 60 seconds.', flush=True)
        while not ready():
            time.sleep(60)
    if not ready():
        print(f'NOT_READY: {MARKER} must certify the selected video {VIDEO} and the current timeline frame range.', flush=True)
        return 3
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'frames').mkdir(exist_ok=True)
    (OUT / 'contacts').mkdir(exist_ok=True)
    ffmpeg = shutil.which('ffmpeg')
    ffprobe = shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise RuntimeError('ffmpeg and ffprobe must be installed.')
    runner = Runner()
    started = now()
    timeline = json.loads((ROOT / 'src/timeline.json').read_text(encoding='utf-8-sig'))
    initial_video_sha=sha(VIDEO)
    initial_timeline_sha=sha(ROOT/'src/timeline.json')
    initial_marker_sha=sha(MARKER)
    render_marker=matching_marker(timeline)
    if render_marker is None:
        raise RuntimeError('Render marker changed before QA started; selected video is no longer certified.')
    if render_marker.get('videoSHA256') and render_marker['videoSHA256']!=initial_video_sha:
        raise RuntimeError('Selected video does not match the SHA256 recorded in its render marker.')
    evidence=source_evidence()
    write_json(OUT/'source-evidence.json',evidence)
    EXPECTED.update(frames=timeline_frames(timeline),duration=timeline_frames(timeline)/timeline['fps'])
    write_json(OUT / 'render-marker.json', render_marker)
    probe = runner.run('ffprobe', [ffprobe, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(VIDEO)])
    metadata = json.loads(probe.stdout)
    write_json(OUT / 'ffprobe.json', metadata)
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in metadata['streams'] if s['codec_type'] == 'audio')
    decode = runner.run('decode-blackdetect', [ffmpeg, '-hide_banner', '-nostdin', '-xerror', '-i', str(VIDEO),
        '-map', '0:v:0', '-map', '0:a:0', '-vf', 'blackdetect=d=0.12:pix_th=0.02:pic_th=0.98',
        '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], accept_failure=True)
    frames = [int(x) for x in re.findall(r'^frame=(\d+)\s*$', decode.stdout, re.M)]
    black = [{'start': float(a), 'end': float(b), 'duration': float(c)} for a, b, c in re.findall(
        r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)', decode.stderr)]
    measured = runner.run('aac-loudnorm', [ffmpeg, '-hide_banner', '-nostdin', '-i', str(VIDEO), '-vn',
        '-map', '0:a:0', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    matches = re.findall(r'\{\s*"input_i"[\s\S]*?\}', measured.stderr)
    if not matches:
        raise RuntimeError('No loudnorm input measurement found.')
    loudnorm = json.loads(matches[-1])
    write_json(OUT / 'aac-loudnorm.json', loudnorm)
    plan = build_plan(timeline)
    write_json(OUT / 'frame-manifest.json', plan)
    selected = [row['frame'] for row in plan['frames']]
    expression = '+'.join(f'eq(n\\,{frame})' for frame in selected)
    runner.run('extract-final-frames', [ffmpeg, '-hide_banner', '-nostdin', '-i', str(VIDEO),
        '-an', '-vf', f'select={expression}', '-fps_mode', 'vfr', '-q:v', '2',
        '-start_number', '0', '-y', str(OUT / 'frames' / 'selected-%06d.jpg')])
    for i, frame in enumerate(selected):
        temporary = OUT / 'frames' / f'selected-{i:06d}.jpg'
        if not temporary.exists():
            raise RuntimeError(f'Missing selected frame {i} for source frame {frame}.')
        temporary.replace(OUT / 'frames' / f'frame-{frame:06d}.jpg')
    contacts = []
    for i, section in enumerate(timeline['sections'], 1):
        rows = [x for x in plan['representatives'] if section['start'] <= x['frame'] < section['end']]
        for page in range(0, len(rows), 6):
            items = [(x['frame'], f"{x['id']} | F{x['frame']:04d} | {x['timeSeconds']:.2f}s") for x in rows[page:page+6]]
            dest = OUT / 'contacts' / f'representatives-{i:02d}-{section["id"]}-{page//6+1}.jpg'
            contact(dest, f'FINAL MP4 | {section["id"]} | 70% of each clip', items)
            contacts.append(path_label(dest))
    for kind in ['sectionBoundaries', 'clipBoundaries','patchBoundaries']:
        rows = plan[kind]
        for page in range(0, len(rows), 3):
            items = [(x['frame'], f"{row['label']} {x['offset']:+d} F{x['frame']}")
                     for row in rows[page:page+3] for x in row['frames']]
            dest = OUT / 'contacts' / f'{kind}-{page//3+1:02d}.jpg'
            offsets='-2 / -1 / 0 / +1 / +2' if kind=='patchBoundaries' else '-45 / -20 / 0 / +20 / +45'
            contact(dest, f'FINAL MP4 | {kind} | offsets {offsets}', items,
                    columns=5, width=384)
            contacts.append(path_label(dest))
    focused = plan['detailPhases']
    for page in range(0, len(focused),3):
        dest = OUT / 'contacts' / f'structure-details-{page//3+1}.jpg'
        contact(dest,'FINAL MP4 | structure, force and assembly phases',
                [(x['frame'],f"{row['id']} {x['phase']:.0%} F{x['frame']}") for row in focused[page:page+3] for x in row['frames']],
                columns=5,width=384)
        contacts.append(path_label(dest))
    coda_dest = OUT / 'contacts' / 'paper-coda.jpg'
    contact(coda_dest, 'FINAL MP4 | paper coda entrance and hold',
            [(f, f'F{f} | {f/timeline["fps"]:.2f}s') for f in plan['codaFrames']])
    contacts.append(path_label(coda_dest))
    final_frames = int(video.get('nb_frames', frames[-1] if frames else 0))
    fps = float(Fraction(video['avg_frame_rate']))
    duration = float(video.get('duration', metadata['format']['duration']))
    checks = {
        'width1920': video['width'] == EXPECTED['width'], 'height1080': video['height'] == EXPECTED['height'],
        'fps30': abs(fps - EXPECTED['fps']) < .0001, 'framesMatchTimeline': final_frames == EXPECTED['frames'],
        'videoDurationMatchesTimeline': abs(duration - EXPECTED['duration']) <= 1/EXPECTED['fps'],
        'fullDecodeSuccess': decode.returncode == 0,
        'decodedFramesMatchTimeline': bool(frames) and frames[-1] == EXPECTED['frames'],
        'audioAAC': audio['codec_name'] == 'aac',
        'videoBT709Matrix': video.get('color_space') == 'bt709',
        'videoBT709Transfer': video.get('color_transfer') == 'bt709',
        'videoBT709Primaries': video.get('color_primaries') == 'bt709',
        'noDetectedBlackSegments': not black,
        'audio48kHzStereo': int(audio.get('sample_rate',0))==48000 and audio.get('channels')==2,
        'audioDurationMatchesTimeline': abs(float(audio.get('duration',metadata['format']['duration']))-EXPECTED['duration'])<=.15,
        'aacTruePeakAtMostMinus1dBTP': float(loudnorm['input_tp']) <= -1,
        'aacLoudnessBetweenMinus16AndMinus14': -16<=float(loudnorm['input_i'])<=-14,
        'allRepresentativeClipsExtracted': len(plan['representatives']) == len(timeline['clips']),
        'allPlannedFramesExist': all((OUT/'frames'/f'frame-{f:06d}.jpg').exists() for f in selected),
        'videoUnchangedDuringQA':sha(VIDEO)==initial_video_sha,
        'timelineUnchangedDuringQA':sha(ROOT/'src/timeline.json')==initial_timeline_sha,
        'markerStillCertifiesSelectedVideo':matching_marker(timeline) is not None,
        'renderMarkerUnchangedDuringQA':sha(MARKER)==initial_marker_sha,
        'productionSourcesUnchangedDuringQA':all(sha(ROOT/row['path'])==row['sha256']
                                                  for row in evidence['files'].values()),
    }
    report = {'startedAtUTC': started, 'finishedAtUTC': now(), 'video': str(VIDEO),
        'videoSHA256': sha(VIDEO), 'videoBytes': VIDEO.stat().st_size,
        'timelineSHA256': sha(ROOT/'src/timeline.json'), 'expected': EXPECTED,
        'sourceEvidence':evidence,
        'measured': {'width': video['width'], 'height': video['height'], 'fps': fps,
            'metadataFrames': final_frames, 'decodedFrames': frames[-1] if frames else None,
            'videoDurationSeconds': duration, 'containerDurationSeconds': float(metadata['format']['duration']),
            'videoCodec': video['codec_name'], 'pixelFormat': video.get('pix_fmt'),
            'colorSpace': video.get('color_space'), 'colorTransfer': video.get('color_transfer'),
            'colorPrimaries': video.get('color_primaries'),
            'audioCodec': audio['codec_name'], 'audioSampleRate': audio.get('sample_rate'),
            'aacIntegratedLUFS': float(loudnorm['input_i']), 'aacTruePeakDBTP': float(loudnorm['input_tp']),
            'aacLoudnessRangeLU': float(loudnorm['input_lra'])},
        'checks': checks, 'automaticChecksPass': all(checks.values()),
        'blackDetection': {'minDurationSeconds': .12, 'pixelThreshold': .02, 'pictureBlackRatio': .98, 'segments': black,
            'note': 'Detects near-black pictures only; intentionally still paper coda is not treated as an error.'},
        'framesExtracted': len(selected), 'representatives': len(timeline['clips']), 'contactSheets': contacts,
        'manualVisualReviewCompleted': False,
        'scope': 'The entire file was decoded automatically. Frames are extracted from the final encoded MP4. '
                 'No claim of frame-by-frame or full-duration human viewing is made. AAC input loudnorm values '
                 'measure the delivered audio, not the pre-encode mix.'}
    write_json(OUT / 'automatic-report.json', report)
    markdown = ['# 最终MP4自动检查', '', f'文件：{VIDEO}', f'UTC：{report["finishedAtUTC"]}', '',
                f'自动检查全部通过：{report["automaticChecksPass"]}', '', '| 检查 | 实测 |', '|---|---|']
    markdown += [f'| {k} | {v} |' for k,v in report['measured'].items()]
    markdown += ['', f'黑场段：{len(black)}；抽取唯一帧：{len(selected)}；{len(timeline["clips"])}句均有70%代表帧。', '',
                 '完整解码、黑场检测、AAC响度为自动检测；目视检查记录另存visual-review.md，不能据此声称人工逐秒看完。']
    (OUT / 'automatic-report.md').write_text('\n'.join(markdown), encoding='utf-8')
    print(json.dumps({'automaticChecksPass': report['automaticChecksPass'], 'measured': report['measured'],
                      'blackSegments': black, 'framesExtracted': len(selected), 'contactSheets': len(contacts)},
                     ensure_ascii=False), flush=True)
    return 0 if report['automaticChecksPass'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
