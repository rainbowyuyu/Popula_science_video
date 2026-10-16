"""Acoustic alignment for same-speaker foreign-language name carriers."""
from pathlib import Path
import json,os
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio,pad_or_trim
from faster_whisper.tokenizer import Tokenizer
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'audio/v02/pronunciation'
items=[('kagan-native-short','Henri Kagan.','fr'),('soai-native-katakana','ケンソー・ソアイ。','ja'),('soai-japanese-native','けんそう そあい。この研究について説明します。','ja'),('pasteur-native-short','Louis Pasteur.','fr'),('frank-english-native','Charles Frank. Let us explore the research.','en')]
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
for name,text,lang in items:
 path=OUT/(name+'.wav');dest=OUT/(name+'-alignment.json')
 if dest.exists():continue
 tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language=lang)
 wave=decode_audio(str(path),sampling_rate=16000);feat=model.feature_extractor(wave);encoded=model.encode(pad_or_trim(feat))
 aligned=model.find_alignment(tokenizer,[tokenizer.encode(text)],encoded,num_frames=feat.shape[-1])[0]
 segs,_=model.transcribe(str(path),language=lang,word_timestamps=True,beam_size=5,vad_filter=False)
 segs=list(segs);record={'text':text,'language':lang,'forcedWordTimings':aligned,'independentTranscript':''.join(s.text for s in segs),'independentWords':[{'word':w.word,'start':w.start,'end':w.end} for s in segs for w in s.words or []],'humanListeningChecked':False}
 dest.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8');print(name,record,flush=True)
