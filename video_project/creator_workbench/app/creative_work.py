"""A persisted workboard backed by real tool observations, not progress guesses.

The model may describe its plan and judgments. Only the harness can add evidence.
This module never executes processes or modifies project/source media.
"""
from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

STEP_STATES = {"pending", "in_progress", "completed", "blocked", "skipped"}
CHECK_KINDS = {"automatic", "sampled_frames", "listening", "manual", "model_review"}
KINDS = {
    "video": {".mp4", ".mov", ".webm", ".m4v", ".mkv"},
    "image": {".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif"},
    "audio": {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"},
    "subtitle": {".srt", ".vtt", ".ass"},
    "model": {".blend", ".glb", ".gltf", ".obj", ".fbx", ".stl", ".ply"},
    "document": {".md", ".txt", ".pdf", ".docx", ".html", ".csv", ".tex"},
    "source": {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".css", ".html", ".glsl", ".vert", ".frag", ".yaml", ".yml", ".toml", ".ps1"},
    "report": {".json", ".md", ".txt", ".html", ".csv", ".xml", ".log", ".pdf"},
}


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def text(value, label, maximum=300, *, optional=False, clean=str):
    if value is None and optional:
        return ""
    if not isinstance(value, str) or (not value.strip() and not optional) or len(value) > maximum:
        raise ValueError(f"{label}需为{maximum}字以内的文本")
    return clean(value.strip())


def identifier(value, label="标识"):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise ValueError(label + "需为1–80位字母、数字、下划线或短横线")
    return value


def phase_id(run, value=None):
    phase = value or run.get("phase")
    phases = run.get("phases", [])
    if phase is None:
        phase = phases[0].get("id") if phases else "execute"
    if phases and phase not in {p.get("id") for p in phases}:
        raise ValueError("工作项阶段不属于当前任务")
    return identifier(phase, "阶段")


def _phase_state(value):
    if value in {"running", "cancelling"}:
        return "in_progress"
    if value in {"failed", "paused", "interrupted", "cancelled"}:
        return "blocked"
    return value if value in STEP_STATES else "pending"


def ensure_work(run):
    work = run.get("creativeWork")
    if not isinstance(work, dict) or work.get("schemaVersion") != 1:
        work = {"schemaVersion": 1, "goal": str(run.get("prompt", ""))[:600],
                "title": "创作任务", "planSource": "phases", "steps": [],
                "currentStep": None, "artifacts": [], "checks": [], "updatedAt": run.get("createdAt")}
        run["creativeWork"] = work
    if work.get("planSource") == "phases":
        previous = {s["id"]: s for s in work.get("steps", [])}
        work["steps"] = [{"id": p["id"], "title": p.get("title", p["id"]),
                          "status": _phase_state(p.get("status")), "phaseId": p["id"],
                          "verification": previous.get(p["id"], {}).get("verification", []),
                          "verificationStatus": "unverified", "note": ""}
                         for p in run.get("phases", [])]
        work["currentStep"] = run.get("phase")
    work["status"] = run.get("status", "queued")
    refresh_verification(work)
    return work


def refresh_verification(work):
    checks = {c["id"]: c for c in work.get("checks", [])}
    for entry in [*work.get("steps", []), *work.get("artifacts", [])]:
        ids = entry.get("verification", entry.get("checkIds", []))
        states = [checks.get(i, {}).get("status") for i in ids]
        # A passed check for a different file or an earlier file version cannot
        # certify this artifact. Reports retain their own factual status.
        if "checkIds" in entry:
            states = [checks.get(i, {}).get("status") if checks.get(i, {}).get("artifactId") == entry["id"]
                      and checks.get(i, {}).get("artifactSha256") == entry.get("sha256") else "unverified" for i in ids]
        entry["verificationStatus"] = ("failed" if "failed" in states else
            "verified" if states and all(s == "passed" for s in states) else "unverified")


def public_work(run):
    # Snapshot callers need not mutate historical run files just to show a card.
    scratch = {k: v for k, v in run.items() if k != "creativeWork"}
    scratch["creativeWork"] = copy.deepcopy(run.get("creativeWork"))
    work = ensure_work(scratch)
    result = copy.deepcopy(work)
    result["projectId"] = run.get("projectId")
    result["counts"] = {key: len(result.get(key, [])) for key in ("steps", "artifacts", "checks")}
    result["steps"] = result.get("steps", [])[:60]
    result["artifacts"] = result.get("artifacts", [])[-40:]
    result["checks"] = result.get("checks", [])[-40:]
    result["evidence"] = copy.deepcopy(run.get("_creativeEvidence", [])[-30:])
    return result


def update_plan(run, args, *, clean=str):
    work = copy.deepcopy(ensure_work(run))
    if "goal" in args:
        work["goal"] = text(args["goal"], "目标", 600, clean=clean)
    if "title" in args:
        work["title"] = text(args["title"], "任务名称", 100, clean=clean)
    if "steps" in args:
        supplied = args["steps"]
        if not isinstance(supplied, list) or not 1 <= len(supplied) <= 60:
            raise ValueError("计划需包含1–60个工作项")
        existing = {s["id"]: s for s in work["steps"]} if work.get("planSource") == "model" else {}
        check_ids = {c["id"] for c in work["checks"]}
        seen = set()
        for item in supplied:
            if not isinstance(item, dict):
                raise ValueError("工作项需为对象")
            ident = identifier(item.get("id"), "工作项标识")
            if ident in seen:
                raise ValueError("工作项标识重复")
            seen.add(ident)
            prior = existing.get(ident, {})
            state = item.get("status", prior.get("status", "pending"))
            if state not in STEP_STATES:
                raise ValueError("工作项状态无效")
            refs = item.get("verification", prior.get("verification", []))
            refs = references(refs, check_ids, "检查")
            existing[ident] = {"id": ident, "title": text(item.get("title", prior.get("title")), "工作项名称", 140, clean=clean),
                "status": state, "phaseId": phase_id(run, item.get("phaseId", prior.get("phaseId"))),
                "verification": refs, "verificationStatus": "unverified",
                "note": text(item.get("note", prior.get("note", "")), "说明", 1000, optional=True, clean=clean)}
        if len(existing) > 60:
            raise ValueError("工作板最多60个工作项；请更新已有项")
        work["steps"] = list(existing.values())
        work["planSource"] = "model"
    if "currentStep" in args:
        current = args["currentStep"]
        if current is not None and current not in {s["id"] for s in work["steps"]}:
            raise ValueError("当前工作项需在计划内")
        work["currentStep"] = current
    elif work.get("currentStep") not in {s["id"] for s in work["steps"]}:
        work["currentStep"] = next((s["id"] for s in work["steps"] if s["status"] == "in_progress"), None)
    refresh_verification(work)
    work["updatedAt"] = timestamp()
    run["creativeWork"] = work
    return {"saved": True, "creativeWork": public_work(run)}


def references(values, known, label):
    if not isinstance(values, list) or len(values) > 80 or any(not isinstance(x, str) or x not in known for x in values):
        raise ValueError(label + "引用必须来自当前任务的真实记录")
    return list(dict.fromkeys(values))


def observe_tool(run, name, args, value, *, clean=str):
    """Called only after a tool returned. No model-provided evidence is accepted."""
    if not isinstance(value, dict):
        return value
    evidence = None
    if name == "run_process" and isinstance(value.get("exitCode"), int):
        evidence = {"kind": "process", "exitCode": value["exitCode"], "program": args.get("program"),
                    "command": clean(" ".join([str(args.get("program", "")), *args.get("args", [])]))[:1000],
                    "cwd": str(args.get("cwd") or "."), "log": value.get("log"),
                    "scope": "仅证明该命令实际执行及退出码；检查范围由命令和日志决定"}
    elif name == "inspect_frame" and value.get("imageAttached"):
        evidence = {"kind": "frame", "path": value.get("projectPath", value.get("path")), "timeSec": value.get("timeSec"),
                    "fingerprint": value.get("sourceFingerprint"),
                    "scope": "只检查该时间点的一帧，不代表完整观看或试听"}
    elif name == "project_memory_image" and value.get("imageAttached"):
        evidence = {"kind": "historical_frame", "recordId": value.get("recordId"),
                    "scope": "历史截图，只能用于参考，不能验证当前成片"}
    elif name in {"write_file", "replace_text"} and value.get("written"):
        evidence = {"kind": "file_write", "path": value["written"], "sha256": value.get("sha256"),
                    "scope": "源码/文案已写入，不代表执行、渲染或验收通过"}
    elif name == "project_job" and value.get("status") in {"completed", "failed"}:
        evidence = {"kind": "media_job", "jobId": value.get("id", args.get("id")), "status": value["status"],
                    "path": (value.get("output") or {}).get("relativePath"), "scope": "后台任务实际状态；不等于画面验收或试听"}
    if evidence is None:
        return value
    ledger = run.setdefault("_creativeEvidence", [])
    evidence.update(id="evidence-" + str(len(ledger) + 1), tool=name, phaseId=phase_id(run),
                    projectId=run.get("projectId"), createdAt=timestamp())
    if run.get("versionWorkspace"):
        evidence["workspace"] = "version" if name in {"run_process", "write_file", "replace_text"} else "project_or_version"
    ledger.append(evidence)
    return {**value, "evidenceId": evidence["id"]}


def import_legacy_evidence(run, *, clean=str):
    if run.get("_creativeEvidenceImported"):
        return
    # Saved tool_result events are server-written. Only migrate old records;
    # newer results already carry evidenceId and must not be counted twice.
    for event in run.get("events", []):
        if event.get("type") != "tool_result":
            continue
        try:
            result = json.loads(event.get("message", ""))
        except (ValueError, TypeError):
            continue
        if not isinstance(result, dict) or result.get("evidenceId"):
            continue
        name = event.get("tool")
        if name not in {"inspect_frame", "project_memory_image", "write_file", "replace_text", "project_job", "run_process"}:
            continue
        # Legacy events don't retain the full argv; their log remains authoritative.
        observed = observe_tool(run, name, {"program": "历史命令（详见日志）"}, result, clean=clean)
        if observed.get("evidenceId"):
            evidence = run["_creativeEvidence"][-1]
            if event.get("phase") in {p.get("id") for p in run.get("phases", [])}:
                evidence["phaseId"] = event["phase"]
            evidence["createdAt"] = event.get("time", evidence["createdAt"])
    written = {e.get("sha256") for e in run.get("_creativeEvidence", []) if e.get("kind") == "file_write"}
    for change in run.get("changedFiles", []):
        if change.get("path") and change.get("sha256") and change["sha256"] not in written:
            observe_tool(run, "write_file", {}, {"written": change["path"], "sha256": change["sha256"]}, clean=clean)
            written.add(change["sha256"])
    run["_creativeEvidenceImported"] = True


def record_check(run, args, *, clean=str):
    work = ensure_work(run)
    import_legacy_evidence(run, clean=clean)
    kind, claim = args.get("kind"), args.get("status")
    if kind not in CHECK_KINDS or claim not in {"passed", "failed", "not_run"}:
        raise ValueError("检查类型或结果无效")
    title = text(args.get("title"), "检查名称", 160, clean=clean)
    ledger = {e["id"]: e for e in run.get("_creativeEvidence", [])}
    ids = references(args.get("evidenceIds", []), ledger, "工具证据")
    facts = [ledger[i] for i in ids]
    step = next((s for s in work["steps"] if s["id"] == args.get("stepId")), None)
    artifact = next((a for a in work["artifacts"] if a["id"] == args.get("artifactId")), None)
    if args.get("stepId") and step is None:
        raise ValueError("工作项不属于当前任务")
    if args.get("artifactId") and artifact is None:
        raise ValueError("产物不属于当前任务")
    status, source = "unverified", "model_report"
    limit = "模型文字记录，尚无匹配的实际验证证据"
    if claim == "not_run":
        status, limit = "not_run", "尚未执行"
    elif kind == "automatic" and facts and all(f["kind"] in {"process", "media_job"} for f in facts):
        actual = "failed" if any(f.get("exitCode", 0) != 0 or f.get("status") == "failed" for f in facts) else "passed"
        if actual == claim:
            status, source = actual, "tool_evidence"
            limit = "只确认所引命令退出结果/后台任务状态；不代表未执行的视觉或听感检查"
    elif kind in {"sampled_frames", "model_review"} and facts and all(f["kind"] == "frame" for f in facts):
        status, source = claim, "model_review"
        limit = "模型依据真实抽帧作出的视觉判断，仅覆盖列出的帧；不代表全片、转场全程或试听"
    elif kind == "listening":
        limit = "当前工具未提供实际试听证据；音频文件存在或命令成功不等于听过"
    elif kind == "manual":
        limit = "模型不能替用户确认手动验收；此记录为待核对说明"
    if artifact and status == "passed":
        # Only an actual observation of this file version can certify its image.
        # A general process result remains a useful check, but not artifact QA.
        matched = facts and all(f.get("kind") == "frame" and f.get("path") == artifact["path"]
                    and f.get("fingerprint") == artifact.get("fingerprint") for f in facts)
        if not matched:
            status = "unverified"
            limit = "检查已记录，但证据未对应此产物的当前文件版本；尚不能确认该产物通过验收"
    item = {"id": "check-" + str(len(work["checks"]) + 1), "title": title, "kind": kind,
            "claim": claim, "status": status, "source": source, "evidenceIds": ids,
            "scope": text(args.get("scope", ""), "检查范围", 600, optional=True, clean=clean),
            "note": text(args.get("note", ""), "检查说明", 1200, optional=True, clean=clean),
            "reviewLimit": limit, "phaseId": phase_id(run), "createdAt": timestamp()}
    if artifact:
        item.update(artifactId=artifact["id"], artifactSha256=artifact["sha256"])
    if step:
        item["stepId"] = step["id"]
    work["checks"].append(item)
    if step:
        step.setdefault("verification", []).append(item["id"])
    if artifact:
        artifact.setdefault("checkIds", []).append(item["id"])
    work["updatedAt"] = item["createdAt"]
    refresh_verification(work)
    return {"check": copy.deepcopy(item), "creativeWork": public_work(run)}


def report_artifact(run, project_root, args, safe_path, *, clean=str):
    work = ensure_work(run)
    kind, stage = args.get("kind"), args.get("stage", "preview")
    if kind not in KINDS or stage not in {"draft", "preview", "final"}:
        raise ValueError("产物类型或阶段无效")
    title = text(args.get("title"), "产物名称", 160, clean=clean)
    relative = args.get("path")
    original = safe_path(project_root, relative)
    path, workspace = original, "project"
    if run.get("versionWorkspace"):
        version_root = Path(run["versionWorkspace"])
        if not version_root.resolve().is_relative_to(project_root.resolve()):
            raise ValueError("版本工作区不属于当前工程")
        # Recheck parent junctions from the project root as well.
        safe_path(project_root, version_root.relative_to(project_root).as_posix())
        staged = safe_path(version_root, relative)
        if staged.is_file():
            path, workspace = staged, "version"
    if not path.is_file() or path.suffix.lower() not in KINDS[kind]:
        raise ValueError("产物必须是当前工程内已存在、且扩展名与类型一致的文件")
    before = path.stat()
    if before.st_size == 0:
        raise ValueError("空文件不能登记为产物")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("产物仍在写入，请等待生成完成后登记")
    check_ids = references(args.get("checkIds", []), {c["id"] for c in work["checks"]}, "检查")
    canonical = path.relative_to(project_root).as_posix()
    previous = next((a for a in work["artifacts"] if a["path"] == canonical), None)
    item = {"id": previous["id"] if previous else "artifact-" + str(len(work["artifacts"]) + 1),
            "title": title, "path": canonical, "kind": kind, "stage": stage,
            "phaseId": phase_id(run), "projectId": run.get("projectId"), "workspace": workspace,
            "bytes": after.st_size, "sha256": digest.hexdigest(), "exists": True,
            "fingerprint": {"bytes": after.st_size, "mtimeNs": after.st_mtime_ns},
            "modifiedAt": dt.datetime.fromtimestamp(after.st_mtime, dt.timezone.utc).isoformat(),
            "createdAt": timestamp(), "checkIds": check_ids, "verificationStatus": "unverified",
            "reviewLimit": "已确认文件存在；final为申报用途，不等于验收通过"}
    if previous:
        work["artifacts"][work["artifacts"].index(previous)] = item
    else:
        work["artifacts"].append(item)
    work["updatedAt"] = item["createdAt"]
    refresh_verification(work)
    return {"artifact": copy.deepcopy(item), "creativeWork": public_work(run)}
