"""Create all-frame QA sheets and exact endpoint comparisons, without API calls."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(json.loads((ROOT/'work/output-root-v10.json').read_text('utf8'))['outputRoot'])
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf8')

def main():
    p=argparse.ArgumentParser();p.add_argument('--only',required=True);args=p.parse_args()
    for name in args.only.split(','):
        if not name.replace('_','').isalnum():raise RuntimeError('Bounded shot ID required')
        folder=OUTPUT/'work/qwen-v10/generated'/name
        row=json.loads((folder/'provenance.json').read_text('utf8'))
        if row['status']!='processed':raise RuntimeError('Need actual decoded video')
        files=sorted((folder/'frames').glob('frame_*.jpg'))
        if len(files)!=150:raise RuntimeError('Must inspect150actual native frames')
        target=folder/('all-frame-qa-'+row['providerSHA256'][:12]);target.mkdir(exist_ok=True)
        for page in range(5):
            sheet=Image.new('RGB',(1920,1000),'#e8eeea');draw=ImageDraw.Draw(sheet)
            for j,index in enumerate(range(page*30,(page+1)*30)):
                with Image.open(files[index]) as image:sheet.paste(image.resize((320,180)),((j%6)*320,(j//6)*200))
                draw.text(((j%6)*320+10,(j//6)*200+182),f'{name} frame{index+1}',fill='#183b40')
            sheet.save(target/f'page-{page+1}.jpg',quality=95)
        sheet=Image.new('RGB',(1920,1120),'#e8eeea');draw=ImageDraw.Draw(sheet)
        for j,(label,file) in enumerate([('first reference',folder/'reference-first.png'),('generated first',files[0]),('last reference',folder/'reference-last.png'),('generated last',files[-1])]):
            with Image.open(file) as image:sheet.paste(image.resize((960,540)),((j%2)*960,(j//2)*560))
            draw.text(((j%2)*960+14,(j//2)*560+542),label,fill='#183b40')
        sheet.save(target/'endpoints.jpg',quality=96)
        print(json.dumps({'id':name,'providerSHA256':row['providerSHA256'],'pages':5,'actualFrames':150,'directory':str(target)},ensure_ascii=False))

if __name__=='__main__':main()
