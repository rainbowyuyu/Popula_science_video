"""Optional workstation tools, configured without project credentials."""
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
TTS_ROOT = Path(os.getenv("RAINBOW_TTS_ROOT", "D:/python_project/tts")).expanduser()
BLENDER_PATH = os.getenv("BLENDER_PATH") or shutil.which("blender") or "D:/blender/blender.exe"
LOGO_ROOT = Path(os.getenv("RAINBOW_LOGO_ROOT", str(ROOT / "web/assets"))).expanduser()
MUSIC_ROOT = Path(os.getenv("RAINBOW_MUSIC_ROOT", str(Path.home() / "Music"))).expanduser()

def python_executable(*, prefer_tts=True):
    configured = os.getenv("RAINBOW_PYTHON")
    if configured:
        return configured
    voice_python = TTS_ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
    return str(voice_python) if prefer_tts and voice_python.is_file() else shutil.which("python") or (None if getattr(sys, "frozen", False) else sys.executable)
