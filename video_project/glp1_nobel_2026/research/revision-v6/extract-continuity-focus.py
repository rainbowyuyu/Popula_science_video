"""Run the frozen V6 extractor with only the explicitly recorded additional groups."""
from pathlib import Path
import hashlib
import json
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'scripts/qa_focus_v6.py'
PLAN = ROOT / 'research/revision-v6/continuity-focus.json'
BASE_SHA = 'b62530b6c15925228506240edb45d592f1b8ff8feaefda2104ff65df2d978717'
assert hashlib.sha256(BASE.read_bytes()).hexdigest() == BASE_SHA
plan = json.loads(PLAN.read_text(encoding='utf-8'))
assert plan['driverSHA256'] == hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
module = runpy.run_path(str(BASE), run_name='additional_continuity_focus')
original = module['build_groups']
globals_ = module['main'].__globals__
globals_['OUT'] = ROOT / 'research/qa/final-v5/focus-continuity-v6'
globals_['build_groups'] = lambda extra: original(extra)[8:]
sys.argv = [str(BASE), '--extra-plan=' + str(PLAN)]
module['main']()
assert plan['driverSHA256'] == hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
