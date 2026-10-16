"""Reuse unaffected encoded segments for the narrowly scoped late-title repair.

Only LaunchV7.tsx changed: a multiplier returns human headings/Logo to dark ink
from 76 to 77 seconds. Every potentially affected frame lies in segment 5.
The camera, geometry, overlays outside that branch, media and audio are equal.
"""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / "output/launch-v7-render-b6a150fc6370"
NEW = ROOT / "output/launch-v7-render-102a8d052bb7"


def read(path):
    return json.loads(path.read_text(encoding="utf8"))


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    old = read(OLD / "render-manifest.json")
    new = read(NEW / "render-manifest.json")
    before = {r["file"]: r["sha256"] for r in old["sourceAssets"]}
    after = {r["file"]: r["sha256"] for r in new["sourceAssets"]}
    changed = [k for k in sorted(set(before) | set(after)) if before.get(k) != after.get(k)]
    if changed != ["src/LaunchV7.tsx"]:
        raise RuntimeError("Unexpected changed render inputs: " + repr(changed))
    source = (ROOT / "src/LaunchV7.tsx").read_text(encoding="utf8")
    if "ease((s.local-.6)/.4)*(1-ease((s.local-11)/1))" not in source:
        raise RuntimeError("Scoped colour function differs from reviewed repair")
    reused = []
    for index in [0, 1, 2, 3, 4, 6]:
        file = OLD / f"segment-{index:03d}.mp4"
        sidecar = read(file.with_suffix(".mp4.json"))
        if not (sidecar["revision"] == old["revision"] and sidecar["frames"] == 900
                and sha(file) == sidecar["sha256"]
                and (sidecar["end"] < 4561 or sidecar["start"] > 4739)):
            raise RuntimeError("Source segment is invalid or intersects the colour repair")
        dest = NEW / file.name
        if dest.exists():
            raise RuntimeError("Refusing to replace existing segment " + str(dest))
        shutil.copy2(file, dest)
        if sha(dest) != sidecar["sha256"]:
            raise RuntimeError("Copied segment hash mismatch")
        record = {**sidecar, "revision": new["revision"], "file": str(dest),
                  "reusedFromRevision": old["revision"],
                  "reuseReason": "Only late toolchain title/Logo colour changed in frames 4561-4739; this segment is outside that interval. All other frozen input hashes match."}
        dest.with_suffix(".mp4.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf8")
        reused.append({"index": index, "sha256": record["sha256"], "start": record["start"], "end": record["end"]})
    evidence = {"schema": "launch-v7-scoped-colour-patch-v1", "oldRevision": old["revision"],
                "newRevision": new["revision"], "changedInputs": changed,
                "sourceBeforeSHA256": before[changed[0]], "sourceAfterSHA256": after[changed[0]],
                "possibleChangedFrames": [4561, 4739], "rerenderedFrames": [4500, 5399],
                "unchangedEncodedSegments": reused, "finalDecodeAndSeamReview": "Required after remux"}
    report = ROOT / "research/qa/launch-v7-colour-patch.json"
    report.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"reusedSegments": len(reused), "report": str(report)}))


if __name__ == "__main__":
    main()
