import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
caps=json.loads((root/'src'/'beso-captions-compact.json').read_text(encoding='utf-8'))
def stamp(ms):
    ms=max(0,int(ms)); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
lines=[]
for i,c in enumerate(caps,1):
    lines += [str(i),f"{stamp(c['startMs'])} --> {stamp(c['endMs'])}",c['text'],'']
out=root/'delivery'/'AI-Engineer-Research-compact-120.zh.srt'
out.write_text('\ufeff'+'\n'.join(lines),encoding='utf-8')
print(out)
