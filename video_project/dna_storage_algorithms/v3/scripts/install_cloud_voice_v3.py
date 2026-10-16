"""Install only confirmed cloud clips, preserving the three local test sources."""
from pathlib import Path
import json,hashlib,shutil
V3=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 rows=json.loads((V3/'research/voice-generation-cloud.json').read_text(encoding='utf8'))
 raw=V3/'public/audio/raw';raw.mkdir(parents=True,exist_ok=True)
 fallback=V3/'public/audio/local-fallback';fallback.mkdir(parents=True,exist_ok=True)
 count=0
 for cid,row in rows.items():
  if row['status']!='saved':continue
  source=V3/row['file'];dest=raw/source.name
  if dest.exists()and sha(dest)!=sha(source)and not (fallback/source.name).exists():shutil.copy2(dest,fallback/source.name)
  shutil.copy2(source,dest);count+=1
 print('Installed confirmed cloud raw clips',count)
if __name__=='__main__':main()
