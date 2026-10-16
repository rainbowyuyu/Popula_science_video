"""Create exact-frame standalone chapters only when requested locally."""
from pathlib import Path
import subprocess,json,re

R=Path(__file__).resolve().parents[1]
D=R/'delivery/episode3'
source=D/'榫卯_木头怎样咬住木头_1080p.mp4'
if not source.exists():
    raise FileNotFoundError(source)
out=D/'分段视频';out.mkdir(exist_ok=True)
for row in json.loads((D/'modules/index.json').read_text('utf8')):
    start=row['startFrame']/30
    count=row['endFrameExclusive']-row['startFrame']
    name=re.sub(r'[<>:"/\\|?*]','_',row['title'])
    subprocess.run(['ffmpeg','-hide_banner','-v','error','-nostdin','-y',
                    '-ss',str(start),'-i',str(source),'-frames:v',str(count),
                    '-t',str(count/30),'-c:v','libx264','-crf','18','-preset','fast',
                    '-pix_fmt','yuv420p','-c:a','aac','-b:a','256k',
                    '-movflags','+faststart',str(out/f"{row['id']}_{name}.mp4")],check=True)
print('Six chapter videos exported.')
