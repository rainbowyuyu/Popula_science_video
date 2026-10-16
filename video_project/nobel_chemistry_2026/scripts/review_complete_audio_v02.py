"""Second independent audio-comprehension screen of complete edited sentences."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import json
import build_audio_v02 as b
from audio_understanding_v02 import inspect_audio
ROOT=b.ROOT;OUT=b.OUT/'whole-sentence-review';OUT.mkdir(parents=True,exist_ok=True)
PROMPT='这是中文科普旁白，其中可能夹有法语、日语或英语名字。请听实际音频，不要猜人物身份，也不要把不清楚的发音自动规范成你熟悉的姓名。先逐字转录全部内容，外文按实际听到的音节记录。再用简短条目说明：是否有漏词、明显重复、句尾截断、突然的语音拼接或点击噪声；没有明确证据就写未发现，不要编造。这里只检查这一段音频，不讨论背景画面。'
def one(row):
 path=b.CLEAN/f"{row['id']}.wav";out=OUT/f"{row['id']}.json"
 if out.exists() and b.read(out).get('audioSha256')==b.sha(path):return row['id'],'cached'
 result=inspect_audio(path,PROMPT,out,'qwen3.8-omni-flash');return row['id'],result['response']
with ThreadPoolExecutor(max_workers=2) as ex:
 jobs={ex.submit(one,row):row['id'] for row in b.read(b.PATCH)['clips']}
 results=[]
 for future in as_completed(jobs):
  try:rid,response=future.result();results.append({'id':rid,'response':response,'status':'screened'});print('COMPLETE_SENTENCE',rid,flush=True)
  except Exception as e:results.append({'id':jobs[future],'status':'error','errorType':type(e).__name__});print('SCREEN_ERROR',jobs[future],type(e).__name__,flush=True)
b.save(OUT/'index.json',{'records':sorted(results,key=lambda x:x['id']),'humanListeningChecked':False,'scope':'Full final sentence sources after native-term insertion and cleanup, independent audio-comprehension screen. Results need comparison against actual script; they are not human listening.'})
