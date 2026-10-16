"""Contact sheets from actual v4 frames, with the correct launch timeline."""
from pathlib import Path
import json, sys
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1])
timeline=json.loads((root/'src/launch-story.json').read_text(encoding='utf-8-sig'))
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
frames=sorted((out/'stills').glob('frame-*.jpg'))
for start in range(0,len(frames),12):
    group=frames[start:start+12]
    sheet=Image.new('RGB',(1920,386*((len(group)+2)//3)),'#e7eff0')
    draw=ImageDraw.Draw(sheet)
    for index,filepath in enumerate(group):
        frame=int(filepath.stem.split('-')[-1])
        scene=max((s for s in timeline['scenes'] if s['start']<=frame),key=lambda s:s['start'])
        x=index%3*640;y=index//3*386
        with Image.open(filepath) as im:
            im.thumbnail((640,360));sheet.paste(im,(x,y))
        draw.text((x+8,y+363),f'{frame} | {scene["id"]} +{(frame-scene["start"])/60:.2f}s',font=font,fill='#194556')
    sheet.save(out/f'contact-{start//12+1:02}.jpg',quality=94)
print(out)
