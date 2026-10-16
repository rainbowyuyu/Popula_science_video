"""Render the verified Popular Information paragraph for the separate 2→87% claim."""
from pathlib import Path
import hashlib
import json
import pypdfium2 as pdf

root = Path(__file__).resolve().parents[1]
source = root / 'research/nobelchemistry2026/originals/popular-chemistryprize2026.pdf'
out = root / 'public/papers-v02'
out.mkdir(exist_ok=True)
doc = pdf.PdfDocument(str(source))
page = doc[4]
scale = 3
image = page.render(scale=scale).to_pil()
image.save(out / 'popular-soai1995-page.jpg', quality=96)
# Coordinates in the PDF's upper-left page points. Includes the Soai subsection
# and both explanatory paragraphs, retaining the original typesetting.
bounds = [85, 435, 532, 615]
crop = image.crop(tuple(round(n*scale) for n in bounds))
crop.save(out / 'popular-soai1995-focus.jpg', quality=98)
record = {
    'source': str(source.relative_to(root)),
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'pdfPage': 5,
    'sourceType': 'Nobel official Popular Information, not the original Nature paper',
    'claim': '1995 experiment described as 2% initial ee → 87% ee',
    'cropTopLeftPagePoints': bounds,
    'scale': scale,
    'outputs': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in out.glob('popular-soai1995-*.jpg')},
}
target = root / 'docs/v02/evidence-asset-v02.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(record, ensure_ascii=True, indent=2))
