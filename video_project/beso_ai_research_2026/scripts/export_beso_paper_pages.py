"""Read-only Word export of the actual manuscript, followed by page inspection."""
import argparse
import hashlib
import json
from pathlib import Path

import fitz
import pythoncom
import win32com.client

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=Path(r"D:\python_project\beso_ai\submission\manuscript\nature_article_draft_v1.docx"))
parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "public/beso-research/papers")
args = parser.parse_args()
SOURCE = args.source.resolve()
OUT = args.out.resolve()
OUT.mkdir(parents=True, exist_ok=True)
PDF = OUT / "nature_article_draft_v1.pdf"
before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
pythoncom.CoInitialize()
word = doc = None
try:
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    word.AutomationSecurity = 3
    doc = word.Documents.Open(str(SOURCE), ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False, NoEncodingDialog=True)
    doc.ExportAsFixedFormat(str(PDF), 17, OpenAfterExport=False, OptimizeFor=0)
finally:
    if doc is not None:
        doc.Close(SaveChanges=0)
    if word is not None:
        word.Quit(SaveChanges=0)
    pythoncom.CoUninitialize()
after = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
assert before == after, "Source manuscript changed unexpectedly"
document = fitz.open(PDF)
pages = []
for i, page in enumerate(document):
    text = page.get_text()
    pages.append({"page": i+1, "width": page.rect.width, "height": page.rect.height, "characters": len(text), "start": text[:300]})
    (OUT / f"page-{i+1:02d}.txt").write_text(text, encoding="utf-8")
manifest = {
    "source": str(SOURCE), "sourceSha256": before,
    "pdf": PDF.name, "pdfSha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
    "pageCount": len(document), "pages": pages,
    "export": "Microsoft Word ExportAsFixedFormat PDF, read-only source, original Word page layout",
    "sourceUnmodified": before == after,
    "status": "Research manuscript draft; do not portray as published or accepted Nature article",
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(manifest, indent=2, ensure_ascii=False))
