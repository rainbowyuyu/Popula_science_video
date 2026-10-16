"""Build OFL Noto SC subsets covering this film's source and narration.

Run with Python containing fonttools and brotli. The source font files are kept
outside public; public receives only this film's portable WOFF2 subsets/license.
"""
from pathlib import Path
import argparse,hashlib,json,urllib.request
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'audio/font-sources'
OUTPUT=ROOT/'public/fonts'
REPORT=ROOT/'research/audio-font-coverage.json'
FONTS=[('sans','NotoSansSC-VF.ttf','NotoSansSC-OFL.txt','Rainbow Tower Sans'),
       ('serif','NotoSerifSC-VF.ttf','NotoSerifSC-OFL.txt','Rainbow Tower Serif')]
URLS={
 'NotoSansSC-VF.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
 'NotoSerifSC-VF.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
 'NotoSansSC-OFL.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt',
 'NotoSerifSC-OFL.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt',
}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def cjk(n):return 0x3400<=n<=0x9fff or 0xf900<=n<=0xfaff or 0x20000<=n<=0x2fa1f
def source_inputs():
    paths=[ROOT/'docs/story.json']+[p for p in (ROOT/'src').rglob('*') if p.is_file() and p.suffix in {'.json','.ts','.tsx','.css','.md'}]
    text=''.join(p.read_text('utf-8-sig') for p in paths)
    # Include all printable source characters; ASCII ensures numeric labels and
    # future dynamic counters never need a system font. Controls aren't glyphs.
    required={ord(c) for c in text if c.isprintable()}|set(range(32,127))
    return sorted(paths),required
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');a=ap.parse_args()
    SOURCE.mkdir(parents=True,exist_ok=True);OUTPUT.mkdir(parents=True,exist_ok=True)
    paths,required=source_inputs();han={n for n in required if cjk(n)}
    prior=json.loads(REPORT.read_text('utf-8-sig')) if REPORT.exists() else {}
    if not a.check:
        manifest=SOURCE/'manifest.json';existing=json.loads(manifest.read_text('utf-8-sig')) if manifest.exists() else {}
        for filename,url in URLS.items():
            path=SOURCE/filename
            if not path.exists():
                with urllib.request.urlopen(url,timeout=120) as stream:path.write_bytes(stream.read())
            record=next((x for x in existing.get('files',[]) if x.get('filename')==filename),None)
            if record and sha(path)!=record['sha256']:raise ValueError('Font source changed: '+filename)
        manifest.write_text(json.dumps(dict(repository='https://github.com/google/fonts',license='OFL-1.1',
            files=[dict(filename=n,url=u,sha256=sha(SOURCE/n),bytes=(SOURCE/n).stat().st_size) for n,u in URLS.items()]),indent=2)+'\n','utf8')
    fonts=[]
    for kind,source,license,family in FONTS:
        dest=OUTPUT/f'{kind}.woff2';before=set(TTFont(dest).getBestCmap()) if dest.exists() else set()
        firstmissing=next((x.get('initialMissingHanCount') for x in prior.get('fonts',[]) if x['kind']==kind),len(han-before))
        if not a.check:
            font=TTFont(SOURCE/source);available=set(font.getBestCmap());missing=required-available
            if missing:raise ValueError('Source lacks required characters '+repr(''.join(chr(n) for n in sorted(missing))))
            options=subset.Options();options.flavor='woff2';options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
            sub=subset.Subsetter(options=options);sub.populate(unicodes=required);sub.subset(font)
            # Rename the derivative while retaining source copyright and OFL.
            for platform,encoding,language in [(3,1,0x409),(1,0,0)]:
                for ident,value in [(1,family),(4,family),(6,family.replace(' ','')),(16,family),(3,f'RainbowTower-20261008-{kind}')]:
                    font['name'].setName(value,ident,platform,encoding,language)
            font.flavor='woff2';font.save(dest)
            (OUTPUT/license).write_bytes((SOURCE/license).read_bytes())
        generated=TTFont(dest);covered=set(generated.getBestCmap());missing=sorted(required-covered)
        axes={x.axisTag:[x.minValue,x.defaultValue,x.maxValue] for x in generated['fvar'].axes} if 'fvar' in generated else {}
        fonts.append(dict(kind=kind,family=family,source=source,sourceSHA256=sha(SOURCE/source),
            file=dest.relative_to(ROOT).as_posix(),sha256=sha(dest),bytes=dest.stat().st_size,
            requiredHanCount=len(han),initialMissingHanCount=firstmissing,missingHanCount=len(han-covered),
            missingCharacters=''.join(chr(n) for n in missing),requiredAllCount=len(required),coverageComplete=not missing,axes=axes,license='OFL-1.1'))
    report=dict(passed=all(x['coverageComplete'] for x in fonts),fonts=fonts,
        inputs=[dict(file=p.relative_to(ROOT).as_posix(),sha256=sha(p)) for p in paths],
        requiredUnicodeSHA256=hashlib.sha256(','.join(str(n) for n in sorted(required)).encode()).hexdigest(),
        usage="FontFace('Rainbow Sans', url, {weight:'100 900'}); same descriptor for Rainbow Serif",
        sourceLocation='audio/font-sources; official OFL originals retained locally',systemFontsRequired=False)
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(dict(passed=report['passed'],fonts=[{k:x[k] for k in ['kind','bytes','requiredHanCount','missingHanCount','missingCharacters']} for x in fonts]),ensure_ascii=False))
    if not report['passed']:raise SystemExit(1)
if __name__=='__main__':main()
