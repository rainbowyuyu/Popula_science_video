from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
edit=root/'audio/v02/pronunciation-edits';before=root/'audio/v02/before-pronunciation';raw=root/'audio/v02/raw'
for p in edit.glob('*.json'):
 rid=p.stem; src=before/f'{rid}.wav'
 if src.exists(): shutil.copy2(src,raw/f'{rid}.wav')
 p.unlink()
(root/'audio/v02/pronunciation-substitution-v02.json').unlink(missing_ok=True)
print('RESET',len(list(before.glob('*.wav'))))
