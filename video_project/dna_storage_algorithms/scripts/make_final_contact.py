from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
out=root/'delivery'/'final_contact.jpg'
ids=['hook','encode','constraint','fountain','read','decode','llm','return','references']
thumb_w,thumb_h=640,360
label_h=34
sheet=Image.new('RGB',(thumb_w*3, (thumb_h+label_h)*3),(243,240,231))
font=None
try:
    font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',20)
except Exception:
    pass
for i,sid in enumerate(ids):
    p=root/'delivery'/f'{sid}.jpg'
    if not p.exists():
        continue
    im=Image.open(p).convert('RGB'); im.thumbnail((thumb_w,thumb_h),Image.Resampling.LANCZOS)
    x=(i%3)*thumb_w; y=(i//3)*(thumb_h+label_h)
    sheet.paste(im,(x,y+label_h))
    d=ImageDraw.Draw(sheet)
    d.rectangle((x,y,x+thumb_w,y+label_h),fill=(20,42,53))
    d.text((x+14,y+7),sid,fill=(248,251,247),font=font)
sheet.save(out,quality=93,optimize=True)
print(out)
