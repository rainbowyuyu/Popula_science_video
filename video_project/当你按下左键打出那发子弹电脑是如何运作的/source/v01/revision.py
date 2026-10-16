"""Single source of truth for version paths, so scene/render/verify stay in sync."""
from pathlib import Path
REV='v02'
ROOT=Path(__file__).resolve().parents[2]
FPS=24
FRAME_COUNT=576
FRAMES=ROOT/f'work/v01/frames_{REV}'
ANCHORS=ROOT/f'work/v01/anchors_{REV}.json'
BLEND=ROOT/f'assets/v01/mechanism_scene_{REV}.blend'
VIDEO=ROOT/f'output/v01/mechanism_preview_{REV}.mp4'
SUBTITLES=ROOT/f'subtitles/v01/preview_{REV}.ass'
PREVIOUS_VIDEO=ROOT/'output/v01/mechanism_preview_v01.mp4'
