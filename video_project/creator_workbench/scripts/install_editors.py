"""Install pinned, official portable editors inside this workbench only."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import os
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
TARGETS=[('minipaint','https://codeload.github.com/viliusle/miniPaint/zip/refs/tags/v4.14.3','miniPaint-4.14.3/'),
         ('shotcut','https://github.com/mltframework/shotcut/releases/download/v26.9.27/shotcut-win64-26.9.27.zip','')]

def install(item):
    name,url,prefix=item
    download=ROOT/'work/editor-downloads'/f'{name}.zip'
    download.parent.mkdir(parents=True,exist_ok=True)
    result={'id':name,'source':url}
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'RainbowWorkbench/2.0'})
        with urllib.request.urlopen(request,timeout=35) as response, download.open('wb') as out:
            while chunk:=response.read(1024*1024):out.write(chunk)
        result['sha256']=hashlib.sha256(download.read_bytes()).hexdigest()
        destination=(ROOT/'tools'/name).resolve()
        with zipfile.ZipFile(download) as archive:
            for member in archive.infolist():
                relative=member.filename[len(prefix):] if prefix and member.filename.startswith(prefix) else member.filename
                if not relative:continue
                path=(destination/relative).resolve()
                if not path.is_relative_to(destination):raise ValueError('Archive path outside editor')
                if member.is_dir():path.mkdir(parents=True,exist_ok=True);continue
                path.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(member) as src,path.open('wb') as dst:
                    while chunk:=src.read(1024*1024):dst.write(chunk)
        result.update({'status':'installed','path':str(destination),'bytes':download.stat().st_size})
    except Exception as error:result.update({'status':'failed','error':str(error)[:250]})
    print(json.dumps(result,ensure_ascii=True),flush=True)
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(install,TARGETS))
(ROOT/'output').mkdir(exist_ok=True)
(ROOT/'output/editor-sources.json').write_text(json.dumps(results,indent=2),encoding='utf8')
