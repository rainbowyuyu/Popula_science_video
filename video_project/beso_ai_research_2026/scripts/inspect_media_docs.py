from pathlib import Path
import re,json,requests,html,sys
sys.stdout.reconfigure(encoding='utf8')
R=Path(__file__).resolve().parents[1]/'research/web'
raw=(R/'wan-video.html').read_text('utf8')
links=re.findall(r'href="([^"]+)"[^>]*>([\s\S]*?)</a>',raw)
for url,label in links:
    label=re.sub('<[^>]+>',' ',label)
    if '2.7' in label or '尾帧' in label:
        print(json.dumps({'url':html.unescape(url),'label':html.unescape(label)[:200]},ensure_ascii=False))
for key in ['wan-text-video','wan-video']:
    text=(R/f'{key}.txt').read_text('utf8')
    for term in ['"model"','"parameters"','"duration"','"size"','wan2.7']:
        p=text.find(term)
        print(key,term,text[max(0,p-70):p+700])
