"""Read-only, bounded discovery for the local video studio. No credential reads."""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import threading
import time
from typing import Iterator
from .media_index import DeliveryScanner, select_latest
from .local_paths import TTS_ROOT, BLENDER_PATH, LOGO_ROOT


SKIP_DIRS = frozenset({
    "node_modules", ".git", ".venv", "venv", "__pycache__", ".next", ".cache",
    "work", "cache", "caches", "tmp", "temp", "dist", "build", "bundle",
    "tmp-bundle", "render-temp", "research", "_history", "_catalog",
    ".ipynb_checkpoints", "target", "vendor", ".vendor", "site-packages",
    "checkpoints", "frame-cache", "frames",
})
MEDIA_DIRS = frozenset({"output", "outputs", "delivery", "deliverables", "media", "renders", "videos", "covers", "cover", "publish", "publication"})
VIDEO_EXTS = frozenset({".mp4", ".webm", ".mov", ".m4v"})
IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
AUDIO_EXTS = frozenset({".wav", ".mp3", ".m4a", ".ogg", ".flac"})
MARKERS = frozenset({"project.json", "package.json", "pyproject.toml", "remotion.config.ts", "remotion.config.js", "manim.cfg"})


def _id(kind: str, path: Path) -> str:
    return kind + "_" + hashlib.sha256(str(path.absolute()).replace("\\", "/").casefold().encode("utf-8")).hexdigest()[:24]


def _link(path: Path) -> bool:
    """Reject Windows junctions as well as POSIX links, including link files."""
    try:
        st = path.lstat()
        return stat.S_ISLNK(st.st_mode) or bool(getattr(st, "st_file_attributes", 0) & 0x400)
    except OSError:
        return True


def _inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError, RuntimeError):
        return False


def _plain_path(path: Path, root: Path) -> bool:
    if not _inside(path, root):
        return False
    current = path.absolute()
    root_abs = root.absolute()
    while current != root_abs:
        if _link(current) or current.parent == current:
            return False
        current = current.parent
    return not _link(root_abs)


def _read(path: Path, max_bytes: int = 400_000) -> str:
    try:
        with path.open("rb") as stream:
            return stream.read(max_bytes).decode("utf-8-sig", errors="replace")
    except OSError:
        return ""


def _json(path: Path, max_bytes: int = 400_000) -> dict:
    try:
        data = json.loads(_read(path, max_bytes))
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def _frontmatter(content: str) -> dict[str, str]:
    """Minimal safe scalar YAML subset; never instantiates objects or tags."""
    if not content.startswith("---"):
        return {}
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}
    out: dict[str, str] = {}
    lines = parts[1].splitlines()
    for i, line in enumerate(lines):
        match = re.match(r"^(name|description):\s*(.*)$", line)
        if not match:
            continue
        key, value = match.groups()
        if value in {"|", ">", "|-", ">-"}:
            more = []
            for nxt in lines[i + 1:]:
                if nxt and not nxt[0].isspace():
                    break
                more.append(nxt.strip())
            value = " ".join(more)
        out[key] = value.strip().strip("\"'")
    return out


class Library:
    """Persist a small delivery index; load resources and history on demand.

    Returned dicts are detached so consumers cannot mutate cached path ownership.
    Scan budgets are constructor arguments/environment overrides, not unlimited walks.
    """

    def __init__(self, video_root: Path, skill_roots: list[Path] | None = None,
                 *, max_files: int = 60_000, max_media: int = 4_000,
                 max_depth: int = 9, cache_seconds: int = 60):
        self.video_root = Path(video_root).absolute()
        personal = Path.home()
        self.skill_roots = [Path(p).absolute() for p in (skill_roots if skill_roots is not None else [
            personal / ".codex/skills", personal / ".agents/skills", personal / ".codex/plugins/cache",
            self.video_root / "creator_workbench/skills",
            self.video_root / "shared/skills",
        ])]
        self.max_files = max(10, int(os.getenv("CREATOR_SCAN_MAX_FILES", str(max_files))))
        self.max_media = max(1, int(os.getenv("CREATOR_SCAN_MAX_MEDIA", str(max_media))))
        self.max_depth = max(1, int(max_depth))
        self.cache_seconds = max(0, cache_seconds)
        self._projects: dict[str, dict] = {}
        self._learning_projects: dict[str, dict] = {}
        self._skills: dict[str, dict] = {}
        self._media: dict[str, list[dict]] = {}
        self._latest: dict[str, list[dict]] = {}
        self._lookup: dict[str, dict] = {}
        self._watches: dict[str, dict] = {}
        self._project_stamps: dict[str, float] = {}
        self._full_media_stamps: dict[str, float] = {}
        self._resources: dict | None = None
        self._resource_counts: dict = {}
        self._resource_stamp = 0.0
        self._stamp = 0.0
        self._lock = threading.RLock()
        self._truncated: list[str] = []
        self._cache_root = self.video_root / "creator_workbench/work/library-index"
        self._learning_root = self.video_root / "creator_workbench/work/learning-workspaces"
        self._load_light_cache()

    def register_learning_project(self, collection_id: str, name: str) -> dict:
        """Trusted internal workspace; callers cannot choose a filesystem root.

        These rows are deliberately separate from the visible video catalog.
        Only LearningWorkspace creates or restores them from its own records.
        """
        if not isinstance(collection_id, str) or not re.fullmatch(r"[0-9a-f]{32}", collection_id):
            raise ValueError("学习工作空间标识无效")
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            raise ValueError("学习工作空间名称无效")
        with self._lock:
            if not self.video_root.is_dir() or _link(self.video_root):
                raise ValueError("视频工作区根目录无效")
            root = self._learning_root / collection_id
            current = self.video_root
            for part in root.relative_to(self.video_root).parts:
                current = current / part
                if current.exists() and _link(current):
                    raise ValueError("学习工作空间不能使用链接或目录联接")
                current.mkdir(exist_ok=True)
            if not _plain_path(root, self.video_root):
                raise ValueError("学习工作空间位置无效")
            ident = "learning_" + collection_id
            row = {"id": ident, "name": name.strip(), "title": name.strip(), "dirname": collection_id,
                   "path": str(root), "kind": "learning", "hidden": True, "independent": True,
                   "collectionId": collection_id, "videoCount": 0, "videoCountExact": False,
                   "sourceRoots": ["source"], "technologies": [], "mediaLoaded": False}
            config = root / ".studio" / "project.json"
            if (config.parent.exists() and _link(config.parent)) or (config.exists() and _link(config)):
                raise ValueError("学习配置不能使用链接或目录联接")
            if not config.exists():
                config.parent.mkdir(exist_ok=True)
                config.write_text(json.dumps({"kind": "learning", "displayName": name.strip(),
                    "seriesId": None, "useSeriesStyle": False, "references": [], "covers": [],
                    "cameraPresets": [], "edits": [], "learnedSkills": []}, ensure_ascii=False), encoding="utf8")
            self._learning_projects[ident] = row
            return copy.deepcopy(row)

    def is_learning_project(self, project_id: str) -> bool:
        with self._lock:
            return project_id in self._learning_projects

    def _load_light_cache(self):
        cache = self._cache_root / "latest-v4.json"
        if not cache.is_file() or not _plain_path(cache, self.video_root):
            return
        data = _json(cache, 8_000_000)
        if data.get("schema") != 4 or data.get("videoRoot") != str(self.video_root):
            return
        projects = data.get("projects", {})
        if not isinstance(projects, dict):
            return
        for pid, record in projects.items():
            if not isinstance(record, dict):
                continue
            project = record.get("project", {})
            if not isinstance(project, dict):
                continue
            path = Path(str(project.get("path", "")))
            if path.parent != self.video_root or pid != _id("project", path) or not path.is_dir() or not _plain_path(path, self.video_root):
                continue
            latest, watches = record.get("latest", []), record.get("watches", {})
            if not isinstance(latest, list) or not isinstance(watches, dict):
                continue
            if any(not isinstance(rel, str) or Path(rel).is_absolute() or Path(rel).drive or ".." in Path(rel).parts for rel in watches):
                continue
            if any(not self._valid_media(row, path) for row in latest):
                continue
            required = {"id", "name", "dirname", "path", "videoCount", "sourceRoots", "technologies"}
            if not required.issubset(project) or project["id"] != pid:
                continue
            project.pop("latestVideo", None)
            project["latestCovers"] = [r for r in latest if r.get("kind") == "image" and r.get("ratio")]
            video = next((r for r in latest if r.get("kind") == "video"), None)
            if video:
                project["latestVideo"] = video
            # An index is not proof that a full history scan ran in this process.
            project["mediaLoaded"] = False
            self._projects[pid] = project
            self._latest[pid], self._watches[pid] = latest, watches
            self._remember(latest, pid)
        counts = data.get("resourceCounts", {})
        if isinstance(counts, dict):
            self._resource_counts = {key: value for key, value in counts.items() if key in {"skills", "plugins", "tools"} and isinstance(value, int) and value >= 0}

    def _cache_allowed(self):
        ancestor = self._cache_root
        while not ancestor.exists() and ancestor != self.video_root:
            ancestor = ancestor.parent
        return _plain_path(ancestor, self.video_root)

    def _save_light_cache(self):
        if not self._cache_allowed():
            return
        try:
            self._cache_root.mkdir(parents=True, exist_ok=True)
            payload = {"schema": 4, "videoRoot": str(self.video_root), "resourceCounts": self._resource_counts,
                       "projects": {pid: {"project": project, "latest": self._latest.get(pid, []), "watches": self._watches.get(pid, {})} for pid, project in self._projects.items()}}
            path = self._cache_root / "latest-v4.json"
            temporary = path.with_suffix(".tmp")
            if any(item.exists() and not _plain_path(item, self._cache_root) for item in (path, temporary)):
                return
            temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            os.replace(temporary, path)
        except OSError:
            pass  # Read-only project roots can still be browsed without a cache.

    def _remember(self, rows, project_id, persist=False):
        for row in rows:
            record = {**row, "projectId": project_id}
            self._lookup[row["id"]] = record
            if persist and self._cache_allowed():
                try:
                    directory = self._cache_root / "lookup"
                    directory.mkdir(parents=True, exist_ok=True)
                    destination = directory / (row["id"] + ".json")
                    if _plain_path(directory, self.video_root) and (not destination.exists() or _plain_path(destination, directory)):
                        destination.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
                except OSError:
                    pass

    def _valid_media(self, row, root):
        if not isinstance(row, dict) or not isinstance(row.get("path"), str):
            return False
        path = Path(row["path"])
        return (row.get("id") == _id("media", path) and path.suffix.casefold() in VIDEO_EXTS | IMAGE_EXTS | AUDIO_EXTS
                and path.is_file() and _plain_path(path, root))

    def _walk(self, root: Path, *, depth: int | None = None,
              skip: frozenset[str] = SKIP_DIRS, budget: int | None = None) -> Iterator[Path]:
        if not root.is_dir() or _link(root):
            return
        pending = [(root, 0)]
        seen = 0
        limit = budget or self.max_files
        max_depth = self.max_depth if depth is None else depth
        while pending:
            directory, level = pending.pop()
            try:
                with os.scandir(directory) as scan:
                    entries = sorted(scan, key=lambda entry: entry.name.casefold())
            except OSError:
                continue
            for entry in entries:
                seen += 1
                if seen > limit:
                    self._truncated.append(str(root))
                    return
                try:
                    # DirEntry caches Windows file attributes from enumeration. Avoid
                    # three extra filesystem round-trips for every generated frame.
                    if entry.is_symlink() or bool(getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0) & 0x400):
                        continue
                    path = Path(entry.path)
                    if entry.is_dir(follow_symlinks=False):
                        lower_name = entry.name.casefold()
                        if lower_name not in skip and not lower_name.startswith(("tmp-", "tmp_", "cache-", "cache_")) and level < max_depth:
                            pending.append((path, level + 1))
                    elif entry.is_file(follow_symlinks=False):
                        yield path
                except OSError:
                    continue

    def _media_row(self, path, root):
        suffix = path.suffix.casefold()
        if suffix not in VIDEO_EXTS | IMAGE_EXTS | AUDIO_EXTS:
            return None
        try:
            st = path.stat()
        except OSError:
            return None
        return {"id": _id("media", path), "name": path.name, "path": str(path),
                "relativePath": path.relative_to(root).as_posix(), "size": st.st_size,
                "modified": st.st_mtime, "kind": "video" if suffix in VIDEO_EXTS else "image" if suffix in IMAGE_EXTS else "audio"}

    def _approved_and_covers(self, root, scanner=None):
        approved, declarations, rows = None, {}, []
        release_path = root / ".studio/current-release.json"
        config_path = root / ".studio/project.json"
        for path in (release_path, config_path):
            if scanner:
                scanner.watch(path)
        def owned(name):
            if not isinstance(name, str) or not name:
                return None
            relative = Path(name)
            if relative.is_absolute() or relative.drive or ".." in relative.parts:
                return None
            path = root / relative
            return path if path.is_file() and _plain_path(path, root) else None
        if release_path.is_file() and _plain_path(release_path, root):
            release = _json(release_path)
            source = owned(release.get("path"))
            fingerprint = release.get("fingerprint", {})
            if source and source.suffix.casefold() in VIDEO_EXTS and release.get("probe", {}).get("fullDecodeChecked") is True:
                st = source.stat()
                # The approval already hashed/full-decoded the clip. Match its
                # recorded stat fingerprint without rereading hundreds of MB.
                valid = fingerprint.get("size") == st.st_size and fingerprint.get("mtimeNs") == st.st_mtime_ns and bool(fingerprint.get("sha256"))
                if fingerprint.get("ctimeNs") is not None:
                    valid = valid and fingerprint["ctimeNs"] == st.st_ctime_ns
                if valid:
                    approved = {**self._media_row(source, root), "approved": True}
                    rows.append(approved)
        if config_path.is_file() and _plain_path(config_path, root):
            for cover in _json(config_path, 4_000_000).get("covers", []):
                if not isinstance(cover, dict):
                    continue
                path = owned(cover.get("path"))
                if path:
                    row = self._media_row(path, root)
                    if row and row["kind"] == "image":
                        rows.append(row)
                        declarations[str(path)] = cover.get("ratio")
        return approved, declarations, rows

    def _scan_project_light(self, folder):
        pid = _id("project", folder)
        scanner = DeliveryScanner(folder, _link, lambda path: self._media_row(path, folder), min(self.max_files, 12000), self.max_media)
        scanner.scan()
        if scanner.truncated:
            self._truncated.append(str(folder) + " (delivery scan limit)")
        approved, declarations, configured_rows = self._approved_and_covers(folder, scanner)
        rows = list({row["id"]: row for row in scanner.rows + configured_rows}.values())
        source_roots, tech, descriptions = set(), set(), []
        for marker in scanner.markers:
            source_roots.add(str(marker.parent))
            data = _json(marker) if marker.suffix == ".json" else {}
            if isinstance(data.get("description"), str) and data["description"]:
                descriptions.append(data["description"][:200])
            if marker.name == "package.json":
                dependencies = {}
                for key in ("dependencies", "devDependencies"):
                    if isinstance(data.get(key), dict):
                        dependencies.update(data[key])
                if any("remotion" in key.lower() for key in dependencies):
                    tech.add("Remotion")
                if "three" in dependencies:
                    tech.add("Three.js")
        if scanner.python:
            source_roots.add(str(folder))
            tech.add("Python")
        if scanner.blends:
            source_roots.add(str(folder))
            tech.add("Blender")
        if not source_roots and not any(row["kind"] == "video" for row in rows):
            self._projects.pop(pid, None)
            self._latest.pop(pid, None)
            self._media.pop(pid, None)
            self._watches.pop(pid, None)
            return None
        video, covers, latest = select_latest(rows, approved, declarations)
        for row in latest:
            scanner.watch(Path(row["path"]))
        project = {"id": pid, "name": folder.name, "dirname": folder.name, "path": str(folder),
                   "summary": descriptions[0] if descriptions else " / ".join(sorted(tech)) or "本地视频素材工程",
                   "videoCount": sum(row["kind"] == "video" for row in rows), "videoCountExact": False,
                   "sourceRoots": sorted(source_roots), "technologies": sorted(tech), "latestCovers": covers,
                   "mediaLoaded": False}
        if video:
            project["latestVideo"] = video
        self._projects[pid] = project
        self._latest[pid] = latest
        self._watches[pid] = scanner.watches
        self._project_stamps[pid] = time.monotonic()
        self._media.pop(pid, None)
        self._full_media_stamps.pop(pid, None)
        self._remember(latest, pid)
        return project

    def _watches_current(self, project_id):
        project = self._projects[project_id]
        root = Path(project["path"])
        if not _plain_path(root, self.video_root):
            return False
        watches = self._watches.get(project_id)
        if not watches:
            return False
        for relative, previous in watches.items():
            path = root / relative
            try:
                if _link(path):
                    current = None
                else:
                    st = path.stat()
                    current = [st.st_mtime_ns, st.st_size if path.is_file() else None]
            except OSError:
                current = None
            if current != previous:
                return False
        return True

    def _ensure_projects(self, refresh=False):
        if not refresh and self._projects and time.monotonic() - self._stamp < self.cache_seconds:
            return
        if not self.video_root.is_dir() or _link(self.video_root):
            return
        existing = set()
        for folder in sorted(self.video_root.iterdir(), key=lambda p: p.name.casefold()):
            if not folder.is_dir() or _link(folder) or folder.name.startswith((".", "_")) or folder.name.casefold() in {"shared", "maintenance", "creator_workbench"}:
                continue
            pid = _id("project", folder)
            existing.add(pid)
            if pid not in self._projects or not self._watches_current(pid):
                self._scan_project_light(folder)
        for pid in set(self._projects) - existing:
            self._projects.pop(pid, None)
            self._latest.pop(pid, None)
            self._media.pop(pid, None)
            self._watches.pop(pid, None)
        self._stamp = time.monotonic()
        self._save_light_cache()

    def _scan_project_media(self, project):
        root, rows = Path(project["path"]), []
        for path in self._walk(root, depth=7, budget=min(self.max_files, 24000)):
            row = self._media_row(path, root)
            if not row:
                continue
            parts = {p.casefold() for p in path.relative_to(root).parts[:-1]}
            if row["kind"] != "video" and not any(p in MEDIA_DIRS or p.startswith(("cover-", "cover_", "output-", "output_")) for p in parts):
                continue
            rows.append(row)
            if len(rows) >= self.max_media:
                self._truncated.append(str(root) + " (media limit)")
                break
        rows.sort(key=lambda m: (-m["modified"], m["path"].casefold()))
        pid = project["id"]
        self._media[pid] = rows
        self._full_media_stamps[pid] = time.monotonic()
        project.update(videoCount=sum(r["kind"] == "video" for r in rows), videoCountExact=len(rows) < self.max_media, mediaLoaded=True)
        self._remember(rows, pid)
        return rows

    def _scan_skills(self) -> tuple[list[dict], list[dict]]:
        skills: list[dict] = []
        plugins: list[dict] = []
        names_hashes: dict[tuple[str, str], dict] = {}
        seen_paths: set[str] = set()
        seen_plugins: set[tuple[str, str]] = set()
        skill_skip = SKIP_DIRS - {"cache"}
        for root in self.skill_roots:
            for path in self._walk(root, depth=10, skip=skill_skip):
                name = path.name.casefold()
                if name not in {"skill.md", "plugin.json", "manifest.json"}:
                    continue
                normal = str(path.absolute()).casefold()
                if normal in seen_paths:
                    continue
                seen_paths.add(normal)
                if name != "skill.md":
                    if not (path.parent.name in {".claude-plugin", ".codex-plugin", ".plugin"} or path.name == "plugin.json"):
                        continue
                    data = _json(path)
                    plugin_name = data.get("name")
                    if not isinstance(plugin_name, str):
                        continue
                    version = str(data.get("version", ""))
                    key = (plugin_name, version)
                    if key in seen_plugins:
                        continue
                    seen_plugins.add(key)
                    plugins.append({"id": _id("plugin", path), "name": plugin_name, "version": version, "description": str(data.get("description", ""))[:600], "path": str(path), "status": "unverified", "statusDetail": "本地清单可读；未验证 MCP 服务或远端账户连接"})
                    continue
                content = _read(path)
                meta = _frontmatter(content)
                skill_name = meta.get("name") or path.parent.name
                content_hash = hashlib.sha256(content.replace("\r\n", "\n").encode()).hexdigest()
                key = (skill_name.casefold(), content_hash)
                if key in names_hashes:
                    names_hashes[key]["aliases"].append(str(path))
                    continue
                lower = (skill_name + " " + meta.get("description", "")).casefold()
                category = "视频创作" if any(w in lower for w in ["video", "remotion", "rainbow", "hyperframes", "视频", "cover", "tts", "motion"]) else "建模与视觉" if any(w in lower for w in ["3d", "blender", "image", "design", "figma", "canva", "visual", "图像", "建模"]) else "研究与文档" if any(w in lower for w in ["paper", "research", "nature", "pdf", "doc", "science", "life-"]) else "工程工具"
                row = {"id": _id("skill", path), "name": skill_name, "description": meta.get("description", "")[:1200], "path": str(path), "category": category, "aliases": [], "status": "registered", "sourceHash": content_hash}
                names_hashes[key] = row
                skills.append(row)
        skills.sort(key=lambda x: (x["category"], x["name"].casefold(), x["path"]))
        plugins.sort(key=lambda x: (x["name"].casefold(), x["version"]))
        return skills, plugins

    def _scan_tools(self, projects: list[dict]) -> list[dict]:
        rows = []
        def add(tool_id: str, name: str, path: Path | str | None, description: str, executable: bool = False):
            value = str(path) if path else ""
            exists = bool(value) and Path(value).exists()
            rows.append({"id": tool_id, "name": name, "path": value, "status": "available" if exists and executable else "configured" if exists else "unverified", "description": description})
        add("blender", "Blender", BLENDER_PATH, "本地可执行程序；MCP 连接另行探测。", True)
        add("tts", "rainbow鱼 TTS", TTS_ROOT, "运行前读 RAINBOW_AUDIO_WORKFLOW.md 与 BROADCAST_NARRATION.md；不复制私人音色。")
        add("claude", "Claude 代码协作", Path.home() / ".codex/tools/claude/run.mjs", "使用全局 README 的独立运行器，当前 CC Switch 提供商在每次启动时读取；未发起付费探针。")
        add("logo", "rainbow鱼品牌素材", LOGO_ROOT, "引用原始品牌资产，保留原件。")
        for tool_id, name in [("node", "Node.js"), ("ffmpeg", "FFmpeg"), ("ffprobe", "FFprobe"), ("python", "Python"), ("manim", "Manim CLI")]:
            add(tool_id, name, shutil.which(tool_id), "仅验证 PATH 文件存在；执行时记录版本与结果。", True)
        for package, label in [("remotion", "Remotion"), ("three", "Three.js")]:
            # Project declaration is not evidence that a running render environment works.
            matches = [p for p in projects if label in p.get("technologies", [])]
            rows.append({"id": package, "name": label, "path": matches[0]["path"] if matches else "", "status": "configured" if matches else "unverified", "description": f"{len(matches)} 个工程声明使用；依赖链接与渲染能力在选定工程中验证。"})
        qwen_scripts = []
        for project in projects:
            for path in self._walk(Path(project["path"]), depth=3, skip=SKIP_DIRS | MEDIA_DIRS | {"public", "assets"}, budget=3000):
                if path.suffix.casefold() in {".py", ".mjs", ".js", ".ps1"} and any(token in path.name.casefold() for token in ("qwen", "wan_", "wan-", "dashscope")):
                    qwen_scripts.append(str(path))
                    if len(qwen_scripts) >= 16:
                        break
            if len(qwen_scripts) >= 16:
                break
        rows.append({"id": "qwen", "name": "Qwen / Wan 素材脚本", "path": qwen_scripts[0] if qwen_scripts else "", "status": "configured" if qwen_scripts else "unverified", "description": "发现脚本不代表 API 或余额可用；仅在任务需要时读用法并探测。", "references": qwen_scripts})
        rows.append({"id": "mcp", "name": "Blender / Lux3D 等 MCP", "path": "", "status": "unverified", "description": "插件安装清单不能证明 MCP 已启动；需在具体工具调用中验证连接。"})
        return rows

    def snapshot(self, refresh: bool = False, lightweight: bool = False) -> dict:
        """The default keeps resource metadata compatible; first paint opts out.

        Neither form scans historical media. That work belongs to media_page or
        the legacy media(project_id) call for one explicitly selected project.
        """
        with self._lock:
            started = time.monotonic()
            # A saved render should appear on the next bootstrap, even during
            # the history/resource TTL. This checks stat fingerprints only;
            # unchanged projects never enter their source or delivery trees.
            self._ensure_projects(True)
            projects = sorted(self._projects.values(), key=lambda p: (p["name"].casefold(), p["id"]))
            if not lightweight and (self._resources is None or refresh or started - self._resource_stamp >= self.cache_seconds):
                skills, plugins = self._scan_skills()
                tools = self._scan_tools(projects)
                self._skills = {s["id"]: s for s in skills}
                self._resources = {"skills": skills, "plugins": plugins, "tools": tools}
                self._resource_counts = {k: len(v) for k, v in self._resources.items()}
                self._resource_stamp = time.monotonic()
                self._save_light_cache()
            resources = self._resources if not lightweight and self._resources is not None else {"skills": [], "plugins": [], "tools": []}
            result = {"projects": projects, **resources, "resourcesLoaded": not lightweight,
                      "totals": {"projects": len(projects), "videos": sum(p["videoCount"] for p in projects),
                                 **{key: self._resource_counts.get(key, 0) for key in ("skills", "plugins", "tools")}},
                      "countsComplete": {"videos": all(p.get("videoCountExact", False) for p in projects), "resources": not lightweight},
                      "scan": {"seconds": round(time.monotonic() - started, 3), "truncated": sorted(set(self._truncated)), "root": str(self.video_root), "lightweight": lightweight}}
            return copy.deepcopy(result)

    def project(self, project_id: str) -> dict:
        with self._lock:
            if project_id in self._learning_projects:
                value = self._learning_projects[project_id]
                if not Path(value["path"]).is_dir() or not _plain_path(Path(value["path"]), self.video_root):
                    raise KeyError("Unknown learning workspace")
                return copy.deepcopy(value)
            self._ensure_projects()
            value = self._projects.get(project_id)
            if not value or not Path(value["path"]).is_dir() or not _plain_path(Path(value["path"]), self.video_root):
                raise KeyError("Unknown project")
            return copy.deepcopy(value)

    def media(self, project_id: str) -> list[dict]:
        """Compatibility endpoint: full bounded history for this project only."""
        project = self.project(project_id)
        root = Path(project["path"])
        with self._lock:
            if project_id not in self._media or time.monotonic() - self._full_media_stamps.get(project_id, 0) >= self.cache_seconds:
                self._scan_project_media(project)
            rows = [row for row in self._media.get(project_id, []) if self._valid_media(row, root)]
            self._remember(rows, project_id)
            return copy.deepcopy(rows)

    def media_page(self, project_id: str, scope: str = "latest", offset: int = 0, limit: int = 40, refresh: bool = False) -> dict:
        if scope not in {"latest", "history", "all"}:
            raise ValueError("Unknown media scope")
        if isinstance(offset, bool) or isinstance(limit, bool):
            raise ValueError("Invalid pagination")
        offset, limit = max(0, int(offset)), max(1, min(100, int(limit)))
        with self._lock:
            if project_id in self._learning_projects:
                project = self.project(project_id)
                rows = self.media(project_id) if not refresh else self._scan_project_media(project)
                if scope == "latest":
                    rows = [next(row for row in rows if row['kind'] == kind) for kind in ('video', 'image', 'audio') if any(row['kind'] == kind for row in rows)]
                items = rows[offset:offset + limit]
                self._remember(items, project_id, persist=True)
                more = offset + len(items) < len(rows)
                return copy.deepcopy({"items": items, "hasMore": more, "nextOffset": offset + len(items) if more else None,
                                      "total": len(rows), "scope": scope, "offset": offset, "limit": limit})
            # A refresh of one gallery must never turn into a refresh of every
            # video project or scan skill/plugin source trees.
            project = self._projects.get(project_id)
            if project is None:
                project = self.project(project_id)
            root = Path(project["path"])
            if not root.is_dir() or not _plain_path(root, self.video_root):
                raise KeyError("Unknown project")
            if refresh or not self._watches_current(project_id):
                project = self._scan_project_light(root)
                if project is None:
                    raise KeyError("Unknown project")
                self._save_light_cache()
            if scope == "latest":
                rows = self._latest.get(project_id, [])
            else:
                if refresh or project_id not in self._media or time.monotonic() - self._full_media_stamps.get(project_id, 0) >= self.cache_seconds:
                    self._scan_project_media(self._projects[project_id])
                rows = self._media.get(project_id, [])
                if scope == "history":
                    latest_ids = {r["id"] for r in self._latest.get(project_id, [])}
                    rows = [r for r in rows if r["id"] not in latest_ids]
            rows = [r for r in rows if self._valid_media(r, root)]
            items = rows[offset:offset + limit]
            self._remember(items, project_id, persist=True)
            more = offset + len(items) < len(rows)
            return copy.deepcopy({"items": items, "hasMore": more, "nextOffset": offset + len(items) if more else None,
                                  "total": len(rows), "scope": scope, "offset": offset, "limit": limit})

    def media_lookup(self, media_id: str) -> dict:
        """Resolve a known ID without searching every project's historical media."""
        if not isinstance(media_id, str) or not re.fullmatch(r"media_[0-9a-f]{24}", media_id):
            raise KeyError("Unknown media")
        with self._lock:
            row = self._lookup.get(media_id)
            if row is None:
                cache = self._cache_root / "lookup" / (media_id + ".json")
                if cache.is_file() and _plain_path(cache, self.video_root):
                    row = _json(cache)
            if not row:
                self._ensure_projects()
                row = self._lookup.get(media_id)
            if not isinstance(row, dict) or row.get("id") != media_id:
                raise KeyError("Unknown media")
            pid = row.get("projectId")
            project = self._learning_projects.get(pid) or self._projects.get(pid)
            if project is None:
                self._ensure_projects()
                project = self._projects.get(pid)
            if not project or not self._valid_media(row, Path(project["path"])):
                raise KeyError("Unknown media")
            fresh = self._media_row(Path(row["path"]), Path(project["path"]))
            if fresh is None:
                raise KeyError("Unknown media")
            return {**copy.deepcopy(row), **fresh, "projectId": pid}

    def register_media(self, path: Path | str, project_id: str) -> dict:
        """Register a newly generated project asset for durable direct preview.

        Paths can be absolute or relative to the named project. This deliberately
        does not promote frame captures/reference images into latest covers.
        """
        with self._lock:
            project = self.project(project_id)
            root, candidate = Path(project["path"]), Path(path)
            if not candidate.is_absolute():
                candidate = root / candidate
            if not candidate.is_file() or not _plain_path(candidate, root):
                raise ValueError("Media must belong to the selected project")
            candidate = candidate.resolve()
            row = self._media_row(candidate, root)
            if row is None:
                raise ValueError("Unsupported media file")
            self._remember([row], project_id, persist=True)
            return copy.deepcopy({**row, "projectId": project_id})

    def skill(self, skill_id: str) -> dict:
        with self._lock:
            if not self._skills:
                self.snapshot()
            item = self._skills.get(skill_id)
            if not item or not any(_plain_path(Path(item["path"]), root) for root in self.skill_roots):
                raise KeyError("Unknown skill")
            return {"id": item["id"], "name": item["name"], "path": item["path"], "content": _read(Path(item["path"]))}
