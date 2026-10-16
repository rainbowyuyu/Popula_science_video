from pathlib import Path
from PIL import Image, ImageDraw
R=Path(__file__).resolve().parents[1]
im=Image.open(R/'tmp/cover-scene-290.jpg').convert('RGB')
d=ImageDraw.Draw(im)
paper=(231,236,238)
# Clear temporary film title/subtitle overlays while keeping the clean 3D shelf render.
d.rectangle((0,0,520,610),fill=paper)
# Subtitle removal: borrow the clean floor band immediately above it, avoiding a hard-edged patch.
band=im.crop((430,850,1510,920)).resize((1080,125))
im.paste(band,(430,920))
for y in range(1045,1080):
    t=(y-1045)/35
    c=tuple(round(paper[i]*(1-t)+242*t) for i in range(3))
    d.line((0,y,1920,y),fill=c)
out=R/'delivery/v3/covers/cover-bg-topology.jpg'
im.save(out,quality=95)
print(out)
