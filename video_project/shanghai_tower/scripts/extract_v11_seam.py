"""Extract exact decoded frames around V11's final edit seam for visual QA.

Defaults: F1740--1859 inclusive, every frame (120 JPEGs and six 20-frame sheets).
This is a standalone read-only video inspection tool, not a production renderer
or an automatic visual-quality verdict. It never replaces an existing report.

Example:
    python scripts/extract_v11_seam.py delivery/ShanghaiTower_1080p_v11.mp4
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(block)
    return hasher.hexdigest()


def save_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n',
                    encoding='utf-8')


def executable(name: str, override: str | None, sibling: Path | None = None) -> Path:
    candidates = [override] if override else []
    if not override:
        if sibling:
            candidates.append(str(sibling.with_name(name + sibling.suffix)))
        candidates.extend([shutil.which(name), f'C:/ffmpeg/bin/{name}.exe'])
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate).resolve()
    raise RuntimeError(f'{name} was not found; pass --{name} with its executable path')


def run(command: list[str], log: Path | None = None) -> str:
    result = subprocess.run(command, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', check=False)
    if log:
        log.write_text(result.stdout + '\n' + result.stderr, encoding='utf-8')
    if result.returncode:
        suffix = f'; see {log}' if log else ': ' + result.stderr[-1600:]
        raise RuntimeError(f'{Path(command[0]).name} exited {result.returncode}{suffix}')
    return result.stdout


def contact_sheets(output: Path, frames: list[dict], fps: Fraction) -> list[dict]:
    from PIL import Image, ImageDraw, ImageFont

    def font(size: int):
        for name in ['C:/Windows/Fonts/segoeui.ttf', 'DejaVuSans.ttf']:
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
        return ImageFont.load_default()

    title_font, label_font = font(23), font(19)
    cols, per_page, cell_w, cell_h, header = 4, 20, 480, 300, 48
    records = []
    for first in range(0, len(frames), per_page):
        batch = frames[first:first + per_page]
        rows = (len(batch) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * cell_w, header + rows * cell_h), '#efede8')
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 10), 'V11 encoded seam | every frame | '
                  f'F{batch[0]["frame"]}--F{batch[-1]["frame"]}',
                  font=title_font, fill='#263f46')
        for index, record in enumerate(batch):
            x, y = index % cols * cell_w, header + index // cols * cell_h
            with Image.open(output / record['file']) as source:
                thumb = source.convert('RGB')
                # Preserve the entire encoded image even for non-16:9 inputs.
                thumb.thumbnail((cell_w, 270), Image.Resampling.LANCZOS)
                sheet.paste(thumb, (x + (cell_w - thumb.width) // 2,
                                   y + (270 - thumb.height) // 2))
            draw.text((x + 10, y + 274),
                      f'F{record["frame"]}  /  {float(Fraction(record["frame"], 1) / fps):.3f}s',
                      font=label_font, fill='#263f46')
        path = output / f'contact-{first // per_page + 1:02d}.jpg'
        sheet.save(path, quality=95, subsampling=0)
        records.append({'file': path.name, 'sha256': digest(path),
                        'frames': [record['frame'] for record in batch],
                        'width': sheet.width, 'height': sheet.height})
    return records


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('video', type=Path, help='Completed encoded input video; never modified')
    parser.add_argument('-o', '--output-dir', type=Path,
                        default=ROOT / 'research/qa/v11-final-seam',
                        help='New or empty QA directory (default: research/qa/v11-final-seam)')
    parser.add_argument('--start', type=int, default=1740, help='First zero-based frame, inclusive')
    parser.add_argument('--end', type=int, default=1859, help='Last zero-based frame, inclusive')
    parser.add_argument('--ffmpeg', help='Optional FFmpeg executable override')
    parser.add_argument('--ffprobe', help='Optional ffprobe executable override')
    args = parser.parse_args(argv)
    if args.start < 0 or args.end < args.start:
        parser.error('--start must be nonnegative and --end must be at least --start')
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    video, output = args.video.resolve(), args.output_dir.resolve()
    if not video.is_file():
        raise RuntimeError(f'Input video does not exist: {video}')
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise RuntimeError(f'Output must be new or empty; refusing to overwrite: {output}')
    ffmpeg = executable('ffmpeg', args.ffmpeg)
    ffprobe = executable('ffprobe', args.ffprobe, ffmpeg)
    initial_stat = video.stat()
    video_sha = digest(video)
    probe_command = [str(ffprobe), '-v', 'error', '-select_streams', 'v:0',
                     '-show_streams', '-show_format', '-of', 'json', str(video)]
    probe = json.loads(run(probe_command))
    streams = probe.get('streams', [])
    if not streams:
        raise RuntimeError('Input contains no decodable video stream')
    stream = streams[0]
    rate = stream.get('avg_frame_rate', '0/0')
    if rate == '0/0':
        rate = stream.get('r_frame_rate', '0/0')
    try:
        fps = Fraction(rate)
    except (ValueError, ZeroDivisionError) as error:
        raise RuntimeError('Input video has no usable frame rate') from error
    if fps <= 0:
        raise RuntimeError('Input video has a nonpositive frame rate')
    frame_count = stream.get('nb_frames')
    if frame_count and frame_count.isdecimal() and args.end >= int(frame_count):
        raise RuntimeError(f'F{args.end} exceeds input frame count {frame_count}')
    # Check dependencies before creating the output tree.
    from PIL import Image
    output.mkdir(parents=True, exist_ok=True)
    frames_dir = output / 'frames'
    frames_dir.mkdir()
    save_json(output / 'ffprobe.json', probe)
    wanted = list(range(args.start, args.end + 1))
    extract_command = [str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
                       '-i', str(video), '-map', '0:v:0', '-an', '-sn', '-dn',
                       '-vf', f'select=between(n\\,{args.start}\\,{args.end})',
                       '-fps_mode', 'passthrough', '-frames:v', str(len(wanted)),
                       '-q:v', '2', '-start_number', str(args.start),
                       str(frames_dir / 'frame-%06d.jpg')]
    # Decode from the beginning: fast input seeking would reset filter n and
    # make frame-number provenance ambiguous. Stop after the exact output count.
    run(extract_command, output / 'ffmpeg-extract.log')
    expected_paths = [frames_dir / f'frame-{frame:06d}.jpg' for frame in wanted]
    actual_paths = sorted(frames_dir.glob('frame-*.jpg'))
    if actual_paths != expected_paths:
        raise RuntimeError(f'Exact frame extraction failed: expected {len(wanted)}, '
                           f'found {len(actual_paths)}; no completed manifest written')
    records = []
    for number, path in zip(wanted, expected_paths):
        with Image.open(path) as frame_image:
            frame_image.verify()
            dimensions = frame_image.size
        if dimensions != (stream['width'], stream['height']):
            raise RuntimeError(f'Unexpected decoded frame dimensions at F{number}: {dimensions}')
        records.append({'frame': number, 'timeSeconds': float(Fraction(number, 1) / fps),
                        'file': path.relative_to(output).as_posix(),
                        'sha256': digest(path), 'bytes': path.stat().st_size})
    contacts = contact_sheets(output, records, fps)
    final_stat = video.stat()
    if (initial_stat.st_size, initial_stat.st_mtime_ns) != (final_stat.st_size, final_stat.st_mtime_ns):
        raise RuntimeError('Input video changed during extraction; no completed manifest written')
    if digest(video) != video_sha:
        raise RuntimeError('Input video SHA-256 changed; no completed manifest written')
    manifest = {
        'schemaVersion': 1, 'createdAtUTC': datetime.now(timezone.utc).isoformat(),
        'scope': 'Exact decoded encoded-video frames for manual visual QA; '
                 'not real-time playback, audio review, or a visual-quality verdict.',
        'video': str(video), 'videoSHA256': video_sha, 'videoBytes': final_stat.st_size,
        'inputUnchangedAfterExtraction': True, 'sourceVideoStream': stream,
        'frameRangeInclusive': [args.start, args.end], 'stepFrames': 1,
        'frameCount': len(records), 'fps': {'numerator': fps.numerator, 'denominator': fps.denominator},
        'dimensions': [stream['width'], stream['height']], 'frameNumbering': 'zero-based decoded video frames',
        'frames': records, 'contacts': contacts,
        'tools': {'ffmpeg': str(ffmpeg), 'ffprobe': str(ffprobe)},
        'commands': {'probe': probe_command, 'extract': extract_command},
        'extractor': {'file': str(Path(__file__).resolve()), 'sha256': digest(Path(__file__))},
        'visualVerdict': None,
    }
    save_json(output / 'manifest.json', manifest)
    print(json.dumps({'output': str(output), 'manifest': str(output / 'manifest.json'),
                      'frames': len(records), 'contacts': len(contacts),
                      'videoSHA256': video_sha, 'visualVerdict': None}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, json.JSONDecodeError) as error:
        print(f'QA extraction failed: {error}', file=sys.stderr)
        raise SystemExit(1)
