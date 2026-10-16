from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
R=Path(__file__).resolve().parents[1];S=Path('C:/Users/zju/.codex/skills/rainbow-science-short');A=S/'assets'
font=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',n)
bold=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
logo=Image.open(A/'logo.png').convert('RGBA')
im=Image.new('RGB',(1920,1080),'#f1f1ed');d=ImageDraw.Draw(im)
mark=logo.resize((76,90));im.paste(mark,(64,48),mark)
d.text((160,93),'rainbow鱼',font=bold(44),fill='#193643',anchor='lm')
d.text((110,210),'一个问题，\n一个焦点。',font=bold(88),fill='#20313b',spacing=12)
# A shape, rather than paragraph text, owns the largest visual region.
d.rounded_rectangle((710,305,1690,720),radius=40,fill='#354b59')
d.polygon([(850,390),(1520,390),(1185,635)],fill='#f1f1ed')
d.line([(780,760),(1620,760)],fill='#aeb7b7',width=4)
d.rounded_rectangle((420,936,1500,1020),radius=16,fill='#20313b');d.text((450,948),'短字幕，字号要能在手机上读清楚',font=font(48),fill='white')
d.text((1090,120),'图片 Logo ＋ rainbow鱼',font=font(42),fill='#20313b')
im.save(A/'visual-layout.png')
scenes=['room','strip','optimize','compare'];sheet=Image.new('RGB',(1920,1200),'#e8ecee');d=ImageDraw.Draw(sheet)
for i,name in enumerate(scenes):
 p=R/'output/v3'/f'{name}.jpg'
 if p.exists():sheet.paste(Image.open(p).resize((960,540)),((i%2)*960,(i//2)*600))
 labels=['从日常物体提出问题','动作直接呈现后果','形状来自真实计算','同条件比较，数值放大']
 d.text(((i%2)*960+38,(i//2)*600+548),labels[i],font=font(34),fill='#20313b')
sheet.save(A/'visual-motion.png')
print('Skill visual references ready')
