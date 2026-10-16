from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
P=Path('public/episode2'); P.mkdir(exist_ok=True)
try: font=ImageFont.truetype('C:/Windows/Fonts/georgia.ttf',28); small=ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf',18); tiny=ImageFont.truetype('C:/Windows/Fonts/georgia.ttf',14)
except: font=ImageFont.load_default();small=font;tiny=font

def make(path,title,authors,journal,doi):
 im=Image.new('RGB',(900,1100),(253,251,244));d=ImageDraw.Draw(im)
 d.rectangle((60,54,840,75),fill=(45,65,69));d.text((70,98),'OPTICS / RAINBOW GEOMETRY',font=tiny,fill=(79,116,119))
 d.text((75,190),title,font=font,fill=(28,52,60));d.text((75,258),authors,font=small,fill=(55,70,73));d.text((75,310),journal,font=small,fill=(55,70,73));d.line((75,370,825,370),fill=(165,177,170),width=2)
 abstract='A bibliographic visualisation of the published record.\nThe source is used here to identify the question,\nnot as a substitute for the optical calculation.'
 y=430
 for line in abstract.split('\n'): d.text((75,y),line,font=tiny,fill=(85,93,88));y+=32
 for col in [75,465]:
  for j in range(9):
   yy=610+j*30; d.line((col,yy,col+315-(j%3)*35,yy),fill=(175,178,167),width=2)
 d.rectangle((75,930,825,1005),fill=(239,241,234));d.text((92,950),'DOI  '+doi,font=tiny,fill=(67,87,88));d.text((92,980),'Metadata checked 2026-10-03 · visualised source page',font=tiny,fill=(93,105,100))
 im.save(P/path,quality=95)
make('paper-nussenzveig.png','The Theory of the Rainbow','H. M. Nussenzveig','Scientific American · 1977','10.1038/scientificamerican0477-116')
make('paper-khare.png','Theory of the Rainbow','V. Khare · H. Nussenzveig','Physical Review Letters 33 · 1974','10.1103/PhysRevLett.33.976')
print('created')
