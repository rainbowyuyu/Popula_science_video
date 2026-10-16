"""Fetch and validate the two open paper PDFs used by the DNA film.

The script intentionally contains only endpoints that returned real PDF bytes
in this project.  It never treats an HTML response as a paper asset, and it
does not download the publisher-locked Goldman PDF; that paper is represented
by the archived PMC first-page capture documented in paper-sources.json.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import fitz
import requests

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "public" / "papers"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
SOURCES = {
    "nucleotide-transformer-2024.pdf": {
        "url": "https://www.nature.com/articles/s41592-024-02523-z.pdf",
        "title": "Nucleotide Transformer",
    },
    "dna-fountain-2017-preprint.pdf": {
        "url": "https://www.biorxiv.org/content/biorxiv/early/2016/12/04/074237.full.pdf",
        "title": "DNA Fountain enables a robust and efficient",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify(path: Path, title: str) -> dict[str, object]:
    raw = path.read_bytes()
    if not raw.startswith(b"%PDF-"):
        raise RuntimeError(f"{path.name}: response is not a PDF")
    document = fitz.open(path)
    if not len(document):
        raise RuntimeError(f"{path.name}: PDF has no pages")
    first_page = document[0].get_text("text")
    if title not in first_page:
        raise RuntimeError(f"{path.name}: first-page title check failed")
    return {
        "path": path.as_posix(),
        "pages": len(document),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "titleVerified": True,
    }


def fetch(name: str, url: str) -> Path:
    response = requests.get(
        url,
        headers={"User-Agent": UA, "Accept": "application/pdf,*/*"},
        timeout=60,
    )
    response.raise_for_status()
    if not response.content.startswith(b"%PDF-"):
        raise RuntimeError(f"{url}: HTTP {response.status_code} did not return PDF bytes")
    target = PAPERS / name
    target.write_bytes(response.content)
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true", help="fetch the two PDFs")
    args = parser.parse_args()
    PAPERS.mkdir(parents=True, exist_ok=True)
    results = []
    for name, item in SOURCES.items():
        target = PAPERS / name
        if args.download:
            target = fetch(name, item["url"])
        results.append(verify(target, item["title"]))
    for result in results:
        print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
