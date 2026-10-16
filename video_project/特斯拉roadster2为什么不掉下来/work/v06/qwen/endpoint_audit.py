"""Compare real generated endpoints; metrics supplement manual review only."""
from pathlib import Path
import json, math
import numpy as np
from PIL import Image, ImageDraw
from bridge_runner import HERE, PROJECT, sha

folder=HERE/'attempts/official-to-teaching-001'
row=json.loads((folder/'attempt.json').read_text(encoding='utf8'))
if row.get('status')!='inspected':raise RuntimeError('Run inspect first')
review=folder/'review';records=[]
sheet=Image.new('RGB',(1920,2*570),'#efece5');draw=ImageDraw.Draw(sheet)
for j,(kind,index) in enumerate([('first',0),('last',row['nativeFrames']-1)]):
    source=PROJECT/row[kind]['path'];generated=review/f'frame-{index:04}.png'
    a=Image.open(source).convert('RGB');b=Image.open(generated).convert('RGB')
    if a.size!=b.size:raise RuntimeError('Native endpoint resolution differs; do not resize metrics silently')
    aa=np.asarray(a,dtype=np.float32);bb=np.asarray(b,dtype=np.float32);mse=float(np.mean((aa-bb)**2))
    records.append({'endpoint':kind,'nativeFrame':index,'sourceSHA256':sha(source),'frameSHA256':sha(generated),
                    'meanAbsoluteRGBError0to255':float(np.abs(aa-bb).mean()),'psnrDB':float(10*math.log10(255**2/mse)) if mse else None,
                    'exactlyIdentical':mse==0,'width':a.width,'height':a.height})
    a.thumbnail((960,540));b.thumbnail((960,540));sheet.paste(a,(0,j*570));sheet.paste(b,(960,j*570));
    draw.text((12,j*570+543),f'{kind}: supplied reference',fill='#213c45');draw.text((972,j*570+543),f'{kind}: actual native generated frame {index}',fill='#213c45')
sheet.save(review/'endpoint-comparison.jpg',quality=95)
report={'providerSHA256':row['providerSHA256'],'purpose':'Endpoint pixel similarity only, not a visual quality or mechanism validation',
        'nativeFrames':row['nativeFrames'],'nativeFPS':row['nativeFPS'],'records':records}
(review/'endpoint-metrics.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
