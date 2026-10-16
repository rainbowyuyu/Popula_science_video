from pathlib import Path
import requests
u='https://api.openstreetmap.org/api/0.6/map?bbox=121.501,31.231,121.510,31.239'
r=requests.get(u,headers={'User-Agent':'RainbowScienceResearch/1.0'},timeout=45);print(r.status_code,len(r.content));r.raise_for_status();Path('research/visual-v4/city-context/osm-map.xml').write_bytes(r.content)
