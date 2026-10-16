from pathlib import Path
import json
from render_covers import render
R=Path(__file__).resolve().parents[1]
if __name__=='__main__':
 render(json.loads((R/'delivery/v3/covers/layout.json').read_text('utf8')),R/'delivery/v3/covers/cover-bg-topology.jpg',R/'public/v3/logo.png',R/'delivery/v3/covers')
 print('Four independent sRGB JPG covers ready')
