from pathlib import Path
import requests,bs4,json
root=Path('research/v02/audio');root.mkdir(parents=True,exist_ok=True)
s=requests.Session();s.trust_env=False
urls=['https://help.aliyun.com/zh/model-studio/qwen-omni','https://help.aliyun.com/zh/model-studio/use-qwen-omni-with-the-openai-compatible-api','https://help.aliyun.com/zh/model-studio/qwen-omni-api']
for i,url in enumerate(urls):
 try:
  r=s.get(url,timeout=25);txt=bs4.BeautifulSoup(r.text,'html.parser').get_text('\n',strip=True);(root/f'omni-doc-{i}.txt').write_text(txt,encoding='utf8');print(r.status_code,url,txt[:200]);print('audio examples:',[txt[max(0,p-100):p+260] for p in [txt.find('input_audio'),txt.find('qwen3-omni-flash')] if p>=0])
 except Exception as e:print(type(e).__name__)
