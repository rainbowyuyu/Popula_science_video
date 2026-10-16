import pathlib,json,re,hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.basePen import BasePen
root=pathlib.Path('.')
texts=(root/'src/WorldTypography.ts').read_text(encoding='utf-8')+(root/'data/series36.json').read_text(encoding='utf-8')+''.join(chr(i) for i in range(32,127))
chars=sorted(set(texts))
fontpath=pathlib.Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
font=TTFont(fontpath);font=instantiateVariableFont(font,{'wght':680},inplace=True)
gs=font.getGlyphSet();cm=font.getBestCmap();scale=1000/font['head'].unitsPerEm
class Pen(BasePen):
 def __init__(self):super().__init__(gs);self.tokens=[]
 def xy(self,p):return [str(round(p[0]*scale,3)),str(round(p[1]*scale,3))]
 def _moveTo(self,p):self.tokens+=['m']+self.xy(p)
 def _lineTo(self,p):self.tokens+=['l']+self.xy(p)
 def _curveToOne(self,p1,p2,p3):self.tokens+=['b']+self.xy(p3)+self.xy(p1)+self.xy(p2)
 def _qCurveToOne(self,p1,p2):self.tokens+=['q']+self.xy(p2)+self.xy(p1)
 def _closePath(self):pass
 def _endPath(self):pass
glyphs={}
for c in chars:
 if ord(c) not in cm:continue
 n=cm[ord(c)];pen=Pen();gs[n].draw(pen)
 glyphs[c]={'ha':round(font['hmtx'][n][0]*scale,3),'x_min':0,'x_max':1000,'o':' '.join(pen.tokens)}
out={'glyphs':glyphs,'familyName':'Noto Sans SC Marine Subset','ascender':1160,'descender':-288,'underlinePosition':-100,'underlineThickness':50,'boundingBox':{'yMin':-288,'xMin':0,'yMax':1160,'xMax':1000},'resolution':1000,'original_font_information':{'source':'NotoSansSC-VF.ttf','weight':680,'license':'SIL Open Font License 1.1','sourceSha256':hashlib.sha256(fontpath.read_bytes()).hexdigest()}}
(root/'public/fonts/marine-display.typeface.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('font glyphs',len(glyphs))
