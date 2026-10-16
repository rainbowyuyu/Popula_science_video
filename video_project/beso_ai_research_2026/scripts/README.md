# Production scripts

Run from the film project root. These commands operate on this film, not the original research repository.

| Task | Entry | Runtime |
|---|---|---|
| TypeScript / stills / film | `npm run typecheck`, `npm run qa`, `npm run render` | Node + locked Remotion 4.0.525 / Three.js 0.180.0 |
| Native BESO boundary export | `build_beso_surface_assets.py --source <beso_run> --out public/beso-research/geometry` | Python with NumPy; requires the original VTK files |
| Original data export | `export_zwind_visual_data.py` | Python with NumPy; reads original repository paths recorded in the script |
| Manuscript PDF / page text | `export_beso_paper_pages.py --source <manuscript.docx>` | Windows Microsoft Word, PyMuPDF and pywin32; read-only source, original page layout |
| Voice synthesis | `voice.py --story research/voice-story.json --batch-size 2` | User's `D:/python_project/tts/.venv/Scripts/python.exe`; local Qwen3-TTS |
| ASR check | `qc.py --story research/voice-story.json` | Same TTS venv; local faster-whisper small |
| Audio / measured timeline | `finalize_audio.py` | Same venv; NumPy, SciPy, soundfile, FFmpeg |
| Compact <=120 s sidecar audio | `build_compact_audio.py` | Same venv; reads `src/beso-story-compact.json`; never overwrites `public/audio/master.wav` |
| 105 s launch audio | `build_launch_audio.py` | Same venv; reuses checked takes and writes `public/audio/launch-105-master.wav` |
| 105 s launch render | `node scripts/render_launch_film.mjs` | `src/index-launch-film.tsx` / `AIEngineerLaunchFilm`; resumable H.264 segments; `.blend` files excluded |
| Qwen/WAN concept bridge | `media_bridge.py probe`, `submit`, `poll` | Python requests; API credentials only via environment. Do not resubmit a pending or uncertain task. |
| Covers | `render_covers.py` | Python with Pillow and NumPy; Windows Microsoft YaHei fonts |
| Formula assets | `render_formula_assets.py` | Python with Matplotlib |
| Final encoded verification | `verify_delivery.py` | Python standard library, FFmpeg / ffprobe |
| Source archive | `package_source.py` | Python standard library; explicit active asset allowlist |

The bundled desktop image runtime is `C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe` on the production machine. The reference voice is never archived. Re-running audio writes a measured timeline and therefore requires re-rendering the film.

For a newly extracted copy, install Node.js 22 or 24, run `npm ci` and `npx remotion browser ensure`, and put both `ffmpeg` and `ffprobe` on `PATH`; see the root README. The production checkout uses shared package links and should not be reinstalled or recursively cleaned. `BESO_CHROME_EXECUTABLE` can select an existing browser. Without it, scripts use the verified production browser if present, then Remotion's local default installation.

`renderer-options.mjs` requests the discrete Windows GPU only for the current Chromium process. It does not alter drivers, the registry or shared packages. Matching the production fonts and browser matters for exact image reproduction.

Re-rendering the delivered film uses the bundled assets and finished audio. Re-exporting research data requires the original research repository, which is not distributed. The BESO exporter accepts explicit source/output arguments; the Zwind exporter records its original source paths near its header. The manuscript exporter produces the PDF and text; the two selected manuscript PNGs are included as frozen assets. The existing BESO surface validation report is bundled at `research/qa/beso-surface-qa-v1.json`. `output/cover-source-beso.png` is the exact source used by the delivered cover layouts.

`cleanup_delivered.py` is a production-machine maintenance script, excluded from the source archive. Its cleanup plan contains paths from that machine. It is not a reproduction step and should not be run against another checkout.

Launch visual QA: `node scripts/render_launch_film.mjs --stills --frames=0,419,420,1139,1140,2039,2040,3119,3120,3899,3900,4679,4680,5639,5640,6299`.
Full launch render after QA: `node scripts/render_launch_film.mjs --chunk=900 --concurrency=3`.
Render only selected segment indices: append `--segments=0,3`. Re-running the same source/media revision resumes validated segment sidecars, then muxes `output/ai_engineer_launch_1080p60.mp4` with the 105-second master.
