"""Read-only alignment of finished original takes while TTS continues."""
import shutil
from pathlib import Path
import build_audio_v02 as b
from apply_pronunciation_v02 import pattern,BASE
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio,pad_or_trim
from faster_whisper.tokenizer import Tokenizer
model=WhisperModel(str(b.TTS_ROOT/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=3)
tok=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language='zh')
for row in b.read(b.PATCH)['clips']:
 rid=row['id'];raw=b.RAW/f'{rid}.wav';original=BASE/f'{rid}.wav';dest=BASE/f'{rid}-alignment.json'
 if not pattern.search(row['spoken']) or not raw.exists() or dest.exists():continue
 if not original.exists():
  shutil.copy2(raw,original);b.save(BASE/f'{rid}.json',{'originalSha256':b.sha(raw),'generation':b.read(b.OUT/'tts-generation-v02.json')[rid]})
 wave=decode_audio(str(original),sampling_rate=16000);feat=model.feature_extractor(wave);encoded=model.encode(pad_or_trim(feat));al=model.find_alignment(tok,[tok.encode(row['spoken'])],encoded,num_frames=feat.shape[-1])[0]
 words=[{'text':w['word'],'start':float(w['start']),'end':float(w['end']),'probability':float(w['probability'])} for w in al]
 b.save(dest,{'sourceSha256':b.sha(original),'words':words});print('BASE_ALIGNED',rid,flush=True)
