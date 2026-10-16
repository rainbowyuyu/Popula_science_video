from pathlib import Path
import requests,json
q='''[out:json][timeout:25];(way[building](31.228,121.499,31.239,121.511);way[highway](31.228,121.499,31.239,121.511););out tags geom;'''
for base in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']:
 try:
  r=requests.get(base,params={'data':q},headers={'User-Agent':'RainbowScienceResearch/1.0 (educational architectural visualization)'},timeout=45);r.raise_for_status();d=r.json();Path('research/visual-v4/city-context/overpass.json').write_text(json.dumps(d,ensure_ascii=False),encoding='utf-8');print(base,len(d['elements']));break
 except Exception as e: print(type(e).__name__,str(e)[:120])
