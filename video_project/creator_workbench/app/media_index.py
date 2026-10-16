"""Small delivery index: inspect delivery directories, defer historical assets."""
from __future__ import annotations

import os
from pathlib import Path
import re
import struct

RATIOS = ("16:9", "3:4", "4:3", "9:16", "1:1")
VERSION = re.compile(r"(?:^|[^a-z0-9])v(?:ersion)?[-_ ]?(\d+)(?:[^0-9]|$)", re.I)
TEMP = re.compile(r"(?:^|[/_\- .])(?:preview|previews|pilot|segment|segments|clip|clips|chunk|chunks|frame|frames|stills|qa|test|tests|draft|drafts|thumb(?:nail)?\d*|review|contact(?:[-_ ]?sheet)?|raw|render-temp|opening|benchmark|picture|patches|parts|head|tail|source)(?:[/_\- .\d]|$)|预览|片段|测试|检查|样片|试片|拼图|四比例|对比|片头|开场|\d+秒", re.I)
DELIVERY = re.compile(r"^(?:outputs?|delivery|deliverables?|publish|publication|covers?|封面)(?:$|[-_])", re.I)
VERSION_DIR = re.compile(r"^(?:v\d|versions?$|release|final|最终|成片|最新)", re.I)
COVER = re.compile(r"cover|封面|海报", re.I)
SOURCE_SKIP = {"src", "source", "sources", "scripts", "tools", "assets", "public", "artwork", "blender", "models", "audio", "research", "node_modules", "work", "cache", "tmp", "build", "dist", "bundle", ".git", ".studio"}


def version_key(path):
    values = [int(n) for n in VERSION.findall(str(path).replace("\\", "/"))]
    return max(values, default=0)


def rank_media(row):
    relative = row.get("relativePath", row["name"]).lower()
    final = 3 if re.search(r"final|master|1080p|4k|成片|完整版|完整视频|最终", row["name"], re.I) else 0
    final += 2 if re.search(r"(?:^|/)(delivery|deliverables|publish|publication)(?:/|$)", relative) else 0
    return (version_key(relative), final, row.get("modified", 0), row.get("size", 0), relative)


def deliverable_video(row):
    relative = row.get("relativePath", row["name"])
    parts = Path(relative).parts
    deliverable = len(parts) == 1 or any(DELIVERY.match(part) for part in parts[:-1]) or bool(re.search(r"final|master|完整版|完整视频|成片", row["name"], re.I))
    return row["kind"] == "video" and deliverable and not TEMP.search(relative)


def image_dimensions(path):
    """Header-only PNG/JPEG dimensions; no large imaging dependency."""
    try:
        with Path(path).open("rb") as stream:
            header = stream.read(24)
            if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) == 24:
                return struct.unpack(">II", header[16:24])
            if not header.startswith(b"\xff\xd8"):
                return None
            stream.seek(2)
            for _ in range(300):
                byte = stream.read(1)
                if not byte:
                    break
                if byte != b"\xff":
                    continue
                marker = stream.read(1)
                while marker == b"\xff":
                    marker = stream.read(1)
                if marker in {b"\xd8", b"\xd9"}:
                    continue
                length_bytes = stream.read(2)
                if len(length_bytes) != 2:
                    return None
                size = struct.unpack(">H", length_bytes)[0]
                if size < 2:
                    return None
                if marker and marker[0] in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                    chunk = stream.read(5)
                    if len(chunk) == 5:
                        height, width = struct.unpack(">HH", chunk[1:])
                        return width, height
                    return None
                stream.seek(size - 2, 1)
                if stream.tell() > 128000:
                    return None
    except OSError:
        pass
    return None


def cover_ratio(row, declared=None):
    if row["kind"] != "image" or TEMP.search(row.get("relativePath", row["name"])):
        return None
    if declared in RATIOS:
        return declared
    relative = row.get("relativePath", row["name"])
    if not COVER.search(relative):
        return None
    match = re.search(r"(?<!\d)(16|9|4|3|1)[xX×:_\-](16|9|4|3|1)(?!\d)", row["name"])
    if match:
        ratio = ":".join(match.groups())
        if ratio in RATIOS:
            return ratio
    # Files below cover_artwork often contain scene renders and textures, not
    # posters. A bare rectangular image there is not sufficient evidence.
    if not COVER.search(row["name"]):
        return None
    size = image_dimensions(row["path"])
    if size:
        for ratio in RATIOS:
            width, height = map(int, ratio.split(":"))
            if abs(size[0] / size[1] - width / height) < .015:
                return ratio
    return None


def select_latest(rows, approved=None, declarations=None):
    declarations = declarations or {}
    videos = [r for r in rows if deliverable_video(r)]
    video = approved or (max(videos, key=rank_media) if videos else None)
    covers = {}
    def cover_rank(row):
        # A cover explicitly saved into the current studio project is a curated
        # deliverable, and should supersede an old unregistered vN poster.
        return (row["path"] in declarations, rank_media(row))
    for row in rows:
        ratio = cover_ratio(row, declarations.get(row["path"]))
        if ratio and (ratio not in covers or cover_rank(row) > cover_rank(covers[ratio])):
            covers[ratio] = {**row, "ratio": ratio}
    ordered = [covers[ratio] for ratio in RATIOS if ratio in covers]
    audio = [r for r in rows if r["kind"] == "audio" and not TEMP.search(r["relativePath"]) and re.search(r"master|narration|旁白|配音|混音", r["name"], re.I)]
    latest = ([video] if video else []) + ordered + ([max(audio, key=rank_media)] if audio else [])
    return video, ordered, latest


class DeliveryScanner:
    """A bounded allowlist walk, never visits source/public assets for first paint."""
    def __init__(self, root, linked, make_row, max_entries=12000, max_media=4000):
        self.root = Path(root)
        self.linked, self.make_row = linked, make_row
        self.max_entries, self.max_media = max_entries, max_media
        self.watches, self.rows, self.markers, self.python, self.blends = {}, [], [], [], []
        self.truncated = False
        self.count = 0

    def watch(self, path):
        relative = path.relative_to(self.root).as_posix()
        try:
            st = path.stat()
            self.watches[relative] = [st.st_mtime_ns, st.st_size if path.is_file() else None]
        except OSError:
            self.watches[relative] = None

    def scan(self):
        pending = [(self.root, 0, False)]
        while pending:
            directory, depth, delivering = pending.pop()
            self.watch(directory)
            try:
                with os.scandir(directory) as scan:
                    entries = sorted(scan, key=lambda e: (version_key(e.name), e.name.casefold()), reverse=True)
            except OSError:
                continue
            children = []
            for entry in entries:
                self.count += 1
                if self.count > self.max_entries:
                    self.truncated = True
                    return
                path = Path(entry.path)
                if self.linked(path):
                    continue
                name = entry.name.casefold()
                if entry.is_dir(follow_symlinks=False):
                    if depth >= 6 or name in SOURCE_SKIP or name.startswith((".", "tmp", "cache")) or TEMP.search(name):
                        continue
                    child_delivering = delivering or bool(DELIVERY.match(name))
                    if child_delivering or VERSION_DIR.match(name) or name == "scene":
                        children.append((path, depth + 1, child_delivering))
                elif entry.is_file(follow_symlinks=False):
                    if name in {"project.json", "package.json", "pyproject.toml", "remotion.config.ts", "remotion.config.js", "manim.cfg"}:
                        self.markers.append(path)
                        self.watch(path)
                    elif path.suffix == ".py" and not delivering:
                        self.python.append(path)
                    elif path.suffix == ".blend" and not delivering:
                        self.blends.append(path)
                    row = self.make_row(path)
                    if row and (delivering or row["kind"] == "video") and not TEMP.search(row["relativePath"]):
                        self.rows.append(row)
                        self.watch(path)
                        if len(self.rows) >= self.max_media:
                            self.truncated = True
                            return
            # Entries are ranked newest first; reverse enqueue keeps that order
            # on the LIFO stack when an entry/media budget truncates the scan.
            pending.extend(reversed(children))

