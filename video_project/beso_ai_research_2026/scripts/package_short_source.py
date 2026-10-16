"""Package only the <=120 s AI Engineer research short; preserve the older film package."""
from pathlib import Path
import hashlib,json,zipfile

R=Path(__file__).resolve().parents[1]
D=R/"delivery";D.mkdir(exist_ok=True)
files=[]
def add(path):
    p=R/path
    if p.is_dir():
        for f in p.rglob("*"):
            if f.is_file() and "__pycache__" not in f.parts: files.append(f)
    elif p.exists(): files.append(p)
for path in ["README.md","package.json","package-lock.json","tsconfig.json","src/index-beso-short.tsx","src/beso","src/en/zju-paths.json","src/beso-story-compact.json","src/beso-captions-compact.json","public/beso-research","public/screens","public/generated","public/brand/zju-horizontal-mark.svg","public/audio/compact-120-master.wav","public/audio/compact-120-narration.wav","public/audio/compact-120-music.wav","delivery/AI-Engineer-Research-compact-120.zh.srt","research/compact-120-plan.md","research/compact-120-manifest.json","research/qa/compact-audio.json","scripts/render_beso_short.mjs","scripts/mix_short_audio.py","scripts/remap_compact_captions.py","scripts/export_compact_srt.py","scripts/package_short_source.py"]:
    add(path)
files=sorted(set(files))
records=[]
for p in files:
    records.append({"file":p.relative_to(R).as_posix(),"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
manifest={"files":records,"durationSeconds":116.666667,"fps":60,"composition":"BesoAIEngineerShortZH","waterBoundary":"OVOW WaterProCompat-style controlled display; not native commercial FFT/SSR/WebGPU or a new load truth","sourceRepositoryCopied":False,"apiSecretsIncluded":False}
m=D/"short-120-source-manifest.json";m.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
out=D/"AI-Engineer-Research-compact-120-source.zip"
with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=2) as z:
    for p in files:z.write(p,p.relative_to(R).as_posix())
    z.write(m,"delivery/short-120-source-manifest.json")
with zipfile.ZipFile(out) as z: assert z.testzip() is None
print(f"Packaged {len(files)} files -> {out} ({out.stat().st_size} bytes)")
