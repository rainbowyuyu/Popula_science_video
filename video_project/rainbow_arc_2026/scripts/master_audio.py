from pathlib import Path
import json, importlib.util, numpy as np,soundfile as sf
ROOT=Path(__file__).resolve().parents[1]; spec=importlib.util.spec_from_file_location('broadcast_voice',Path('D:/python_project/tts/broadcast_voice.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
print('Mastering natural raw clips with length-preserving rainbow broadcast profile')
for p in sorted((ROOT/'research/audio/raw').glob('r*-raw.wav')):
 cid=p.stem.replace('-raw',''); clean=ROOT/'public/audio'/f'{cid}.wav';rp=ROOT/'research/audio/takes'/f'{cid}.json'; report=c.master_voice(p,clean); meta=json.loads(rp.read_text(encoding='utf8'));meta['processing']=report;meta['sha256']=c.sha(clean);meta['duration']=sf.info(clean).duration;rp.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8');print(cid,meta['duration'],report['output']['activeRmsDb'],flush=True)
