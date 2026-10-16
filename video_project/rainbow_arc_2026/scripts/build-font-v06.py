from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
import json
ROOT=Path(__file__).resolve().parents[1]
text=''.join(p.read_text('utf8') for p in (ROOT/'src').glob('*.ts*'))+(ROOT/'research/story.json').read_text('utf8')
text+='rainbow鱼彩虹为什么是弧形每天5分钟·彩虹近水滴远水滴42°51°SnellGettelman2023GMD'
font=TTFont('C:/Windows/Fonts/NotoSansSC-VF.ttf')
opts=subset.Options();opts.flavor='woff2';opts.name_IDs=[0,1,2,3,4,5,6,13,14];opts.name_legacy=True
sub=subset.Subsetter(options=opts);sub.populate(text=text);sub.subset(font);font.flavor='woff2'
out=ROOT/'public/fonts/unified.woff2';font.save(out)
cm=font.getBestCmap();missing=sorted({c for c in text if '\u4e00'<=c<='\u9fff' and ord(c) not in cm})
report={'family':'Noto Sans SC','source':'C:/Windows/Fonts/NotoSansSC-VF.ttf','output':str(out.relative_to(ROOT)),'bytes':out.stat().st_size,'glyphs':len(cm),'missingChinese':missing}
(ROOT/'research/qa/font-v06.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print({'bytes':report['bytes'],'glyphs':report['glyphs'],'missingCount':len(missing)})
assert not missing
