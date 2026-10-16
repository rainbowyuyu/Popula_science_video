"""Build the small, deterministic GLP-1 publishing package from eight explicit files.

No rendering, cover regeneration, deletion, MP4, models, raw voice or source
assets are included. Rerun after final cover/document updates to refresh it.
"""
from pathlib import Path
import hashlib,json,os,zipfile

ROOT=Path(__file__).resolve().parents[1]
DELIVERY=ROOT/'delivery'
OUTPUT=DELIVERY/'封面与发布文案.zip'
MEMBERS=[
    ('covers/cardiometabolic-cover-16x9.jpg','covers/cardiometabolic-cover-16x9.jpg'),
    ('covers/cardiometabolic-cover-4x3.jpg','covers/cardiometabolic-cover-4x3.jpg'),
    ('covers/cardiometabolic-cover-3x4.jpg','covers/cardiometabolic-cover-3x4.jpg'),
    ('covers/cardiometabolic-cover-9x16.jpg','covers/cardiometabolic-cover-9x16.jpg'),
    ('发布文案.md','发布文案.md'),
    ('解说稿.md','解说稿.md'),
    ('GLP1.srt','GLP1.srt'),
    ('制作与来源.md','制作与来源.md'),
]

def digest(data):return hashlib.sha256(data).hexdigest()

def main():
    snapshots=[]
    for source,member in MEMBERS:
        path=(DELIVERY/source).resolve(strict=True)
        if not path.is_relative_to(DELIVERY.resolve()) or not path.is_file():
            raise ValueError('Invalid package input: '+str(path))
        if path.suffix.lower() not in {'.jpg','.md','.srt'}:raise ValueError('Unexpected input type')
        data=path.read_bytes()
        if not data:raise ValueError('Empty package input: '+str(path))
        snapshots.append((path,member,data,digest(data)))
    temporary=OUTPUT.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path,member,data,source_sha in snapshots:
            info=zipfile.ZipInfo(member,date_time=(1980,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3
            info.external_attr=(0o100644&0xFFFF)<<16
            archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    with zipfile.ZipFile(temporary,'r') as archive:
        assert archive.namelist()==[r[1] for r in snapshots]
        assert archive.testzip() is None,'ZIP integrity failure'
        for path,member,data,source_sha in snapshots:
            assert digest(archive.read(member))==source_sha,'Archived file mismatch'
            # A simultaneous cover or document update cannot silently leave a
            # package labeled current. Rebuild from the new source snapshot.
            if digest(path.read_bytes())!=source_sha:
                raise RuntimeError('Input changed while packaging; rerun: '+str(path))
    os.replace(temporary,OUTPUT)
    print(json.dumps(dict(output=str(OUTPUT),bytes=OUTPUT.stat().st_size,sha256=digest(OUTPUT.read_bytes()),
        memberCount=len(snapshots),files=[dict(path=m,bytes=len(data),sha256=h) for p,m,data,h in snapshots],
        includesVideo=False,includesSourceAssets=False,deterministicTimestamps='1980-01-01T00:00:00',
        state='Snapshot of current delivery files; rerun after subsequent cover, subtitle or document edits.'),
        ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
