"""Offline cover compositor. No network, generation, posting or automatic font fallback.
Requires Pillow; rendering SVG logos additionally requires PyMuPDF.
"""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageFont, ImageOps


def resolve(base, value):
    p = Path(value).expanduser()
    return p if p.is_absolute() else base / p


def font_at(path, size, weight):
    face = ImageFont.truetype(str(path), round(size))
    try:
        axes = face.get_variation_axes()
        values = [weight if b'weight' in a['name'].lower() else a['default'] for a in axes]
        face.set_variation_by_axes(values)
    except (AttributeError, OSError):
        pass  # Non-variable fonts keep their actual face, never change font family.
    return face


def intersects(a, b):
    return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])


def run(config_path, out_dir, overwrite=False):
    config_path = config_path.resolve()
    cfg = json.loads(config_path.read_text(encoding='utf-8-sig'))
    base = config_path.parent
    width, height = cfg['size']
    if not all(isinstance(v, int) and 64 <= v <= 8192 for v in (width, height)):
        raise ValueError('size must contain two integer pixel dimensions, 64–8192')
    scale = cfg.get('supersample', 2)
    if not isinstance(scale, int) or not 1 <= scale <= 3:
        raise ValueError('supersample must be 1, 2 or 3')
    name = cfg.get('name', 'cover')
    if not isinstance(name, str) or not name or re.search(r'[<>:"/\\|?*\x00-\x1f]', name) or name in ('.', '..'):
        raise ValueError('name must be a safe filename stem')
    targets = {ext: out_dir / (name + ext) for ext in ('.png', '.jpg', '-review.jpg', '-layout-report.json')}
    existing = [str(p) for p in targets.values() if p.exists()]
    if existing and not overwrite:
        raise FileExistsError('Output exists; use a new name or --overwrite: ' + ', '.join(existing))
    background = resolve(base, cfg['background'])
    fonts = {key: resolve(base, value) for key, value in cfg['fonts'].items()}
    for p in [background, *fonts.values()]:
        if not p.is_file():
            raise FileNotFoundError(p)
    original = ImageOps.exif_transpose(Image.open(background)).convert('RGB')
    crop = cfg.get('crop')
    if crop:
        if len(crop) != 4 or not (0 <= crop[0] < crop[2] <= 1 and 0 <= crop[1] < crop[3] <= 1):
            raise ValueError('crop is [left,top,right,bottom], normalized 0–1')
        original = original.crop(tuple(round(v * (original.width if i % 2 == 0 else original.height)) for i, v in enumerate(crop)))
    ratio_diff = abs(original.width / original.height / (width / height) - 1)
    if ratio_diff > .01 and not cfg.get('allow_center_crop', False):
        raise ValueError('Background aspect differs. Supply a deliberate crop or allow_center_crop after visual review.')
    canvas_size = (width * scale, height * scale)
    image = ImageOps.fit(original, canvas_size, method=Image.Resampling.LANCZOS).convert('RGBA')
    for shade in cfg.get('shades', []):
        axis = shade['axis']
        if axis not in ('x', 'y'):
            raise ValueError('shade.axis must be x or y')
        start, end = shade['range']
        if not 0 <= start < end <= 1:
            raise ValueError('shade.range must increase within 0–1')
        low, high = shade['opacity']
        if not 0 <= low <= 1 or not 0 <= high <= 1:
            raise ValueError('shade.opacity values must be 0–1')
        layer = Image.new('RGBA', canvas_size, shade.get('color', '#050b11'))
        mask = Image.new('L', canvas_size)
        d = ImageDraw.Draw(mask)
        extent = canvas_size[0 if axis == 'x' else 1]
        for n in range(extent):
            t = max(0, min(1, (n / max(1, extent - 1) - start) / (end - start)))
            alpha = round(255 * (low + (high - low) * t))
            line = [(n, 0), (n, canvas_size[1])] if axis == 'x' else [(0, n), (canvas_size[0], n)]
            d.line(line, fill=alpha)
        layer.putalpha(mask)
        image.alpha_composite(layer)

    boxes = []
    def record(box, ident, allow_overlap=False):
        box = [v / scale for v in box]
        if box[0] < 0 or box[1] < 0 or box[2] > width or box[3] > height:
            raise ValueError(f'{ident} outside canvas: {box}; shorten/reflow/reposition instead of automatic shrinking')
        boxes.append({'id': ident, 'box': box, 'allow_overlap': allow_overlap})
        return box

    for index, item in enumerate(cfg.get('texts', [])):
        value = item['text']
        if not value.strip():
            continue
        face = font_at(fonts[item.get('font', 'sans')], item['size'] * scale, item.get('weight', 650))
        xy = (item['x'] * scale, item['y'] * scale)
        mask = Image.new('L', canvas_size)
        d = ImageDraw.Draw(mask)
        kwargs = dict(font=face, anchor=item.get('anchor', 'lt'), spacing=item.get('spacing', 8) * scale,
                      align=item.get('align', 'left'))
        # Pillow rejects top anchors for multiline text; keep the requested ink top.
        if '\n' in value and kwargs['anchor'] in ('lt', 'mt', 'rt'):
            kwargs['anchor'] = kwargs['anchor'][0] + 'a'
            baseline_box = d.multiline_textbbox((0, 0), value, **kwargs)
            xy = (xy[0], xy[1] - baseline_box[1])
        box = d.multiline_textbbox(xy, value, **kwargs)
        record(box, item.get('id', f'text-{index}'), item.get('allow_overlap', False))
        d.multiline_text(xy, value, fill=255, **kwargs)
        blur = item.get('shadow_blur', 4) * scale
        shadow = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
        shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)).point(lambda a: round(a * .42)))
        image.alpha_composite(shadow)
        fill = Image.new('RGBA', canvas_size, item.get('color', '#f8efdb'))
        if 'gradient' in item:
            colors = [Image.new('RGB', (1, 1), c).getpixel((0, 0)) for c in item['gradient']]
            if len(colors) != 2:
                raise ValueError('gradient takes two colors')
            fd = ImageDraw.Draw(fill)
            for y in range(max(0, math.floor(box[1])), min(canvas_size[1], math.ceil(box[3]))):
                t = max(0, min(1, (y - box[1]) / max(1, box[3] - box[1])))
                color = tuple(round(a + (b - a) * t) for a, b in zip(*colors)) + (255,)
                fd.line([(0, y), (canvas_size[0], y)], fill=color)
        fill.putalpha(mask)
        image.alpha_composite(fill)

    logo_cfg = cfg.get('logo')
    if logo_cfg:
        logo_path = resolve(base, logo_cfg['path'])
        if logo_path.suffix.lower() == '.svg':
            import fitz
            with fitz.open(stream=logo_path.read_bytes(), filetype='svg') as svg:
                with fitz.open('pdf', svg.convert_to_pdf()) as pdf:
                    page = pdf[0]
                    zoom = logo_cfg['height'] * scale / page.rect.height
                    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
                    logo = Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)
        else:
            logo = Image.open(logo_path).convert('RGBA')
        h = round(logo_cfg['height'] * scale)
        logo = logo.resize((round(logo.width / logo.height * h), h), Image.Resampling.LANCZOS)
        if 'color' in logo_cfg:
            tinted = Image.new('RGBA', logo.size, logo_cfg['color'])
            tinted.putalpha(logo.getchannel('A'))
            logo = tinted
        x, y = round(logo_cfg['x'] * scale), round(logo_cfg['y'] * scale)
        record((x, y, x + logo.width, y + h), 'logo', logo_cfg.get('allow_overlap', False))
        image.alpha_composite(logo, (x, y))

    errors = []
    for i, a in enumerate(boxes):
        for b in boxes[i+1:]:
            if intersects(a['box'], b['box']) and not (a['allow_overlap'] or b['allow_overlap']):
                errors.append(f"{a['id']} overlaps {b['id']}")
        for region in cfg.get('protected_regions', []):
            if intersects(a['box'], region['box']) and a['id'] not in region.get('allow', []):
                errors.append(f"{a['id']} obscures protected region {region['id']}")
    if errors:
        raise ValueError('\n'.join(errors))

    final = image.convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    review = Image.new('RGB', (1060, 670), '#09131d')
    for size, origin in [(620, (20, 20)), (320, (680, 20)), (160, (680, 440))]:
        thumb = final.copy()
        thumb.thumbnail((size, size), Image.Resampling.LANCZOS)
        review.paste(thumb, origin)
    report = {'config': str(config_path), 'size': [width, height], 'mode': 'RGB', 'boxes': boxes,
              'protected_regions': cfg.get('protected_regions', []), 'automatic_layout_checks': 'passed',
              'visual_review': 'Required: inspect final image and both mobile sizes; no aesthetic claim from bounds checks.',
              'background_sha256': hashlib.sha256(background.read_bytes()).hexdigest()}
    out_dir.mkdir(parents=True, exist_ok=True)
    final.save(targets['.png'], icc_profile=srgb)
    final.save(targets['.jpg'], quality=95, subsampling=0, optimize=True, icc_profile=srgb)
    review.save(targets['-review.jpg'], quality=93)
    for ext in ('.png', '.jpg'):
        with Image.open(targets[ext]) as check:
            assert check.size == (width, height) and check.mode == 'RGB'
    targets['-layout-report.json'].write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'files': [str(p.resolve()) for p in targets.values()], 'size': [width, height]}, ensure_ascii=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--out-dir', required=True, type=Path)
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    run(args.config, args.out_dir, args.overwrite)
