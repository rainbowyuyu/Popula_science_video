"""Insert same-reference native-language names at measured acoustic boundaries.

Original takes are retained. Display names remain official spellings. This does
not claim native-speaker listening; independent transcript and Omni screens are
stored separately from the expected-text alignment used for edit boundaries.
"""
from pathlib import Path
import gc,os,json,re,shutil
import numpy as np,soundfile as sf
import build_audio_v02 as b
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio,pad_or_trim
from faster_whisper.tokenizer import Tokenizer
ROOT=b.ROOT;OUT=b.OUT;NATIVE=OUT/'pronunciation';BASE=OUT/'before-pronunciation';BASE.mkdir(parents=True,exist_ok=True)
TERMS={
 'Henri B. Kagan':('kagan-native-short',0.,1.40,'Henri Kagan','French-name carrier; middle initial omitted in speech, retained as official display metadata'),
 'Kenso Soai':('soai-native-katakana',0.,1.12,'ケンソー・ソアイ','Japanese katakana; independent Japanese recognition ケンソーソアイ'),
 'Louis Pasteur':('pasteur-native-short',0.,1.44,'Louis Pasteur','French-language carrier'),
 'Charles Frank':('frank-english-native',0.,.90,'Charles Frank','English-language carrier'),
 'Kagan':('kagan-native-short',.60,1.40,'Kagan','Native carrier surname; short vowel, not English kay-gan'),
 'Soai':('soai-native-katakana',.70,1.12,'ソアイ','Native carrier surname with three Japanese vowel mora'),
}
pattern=re.compile('|'.join(map(re.escape,TERMS)))

def active_rms(a):
 threshold=max(.001,float(np.max(np.abs(a)))*.10);x=a[np.abs(a)>threshold]
 return max(1e-5,float(np.sqrt(np.mean(x*x)))) if len(x) else 1e-5

def join(a,c,sr):
 n=min(round(.012*sr),len(a),len(c));u=np.linspace(0,1,n);u=u*u*(3-2*u)
 return np.concatenate((a[:-n],a[-n:]*(1-u)+c[:n]*u,c[n:]))

def main():
 rows=b.read(b.PATCH)['clips'];ledger=b.read(OUT/'tts-generation-v02.json');report={};model=None
 for row in rows:
  rid=row['id'];matches=list(pattern.finditer(row['spoken']))
  if not matches:continue
  raw=b.RAW/f'{rid}.wav';original=BASE/f'{rid}.wav';meta=BASE/f'{rid}.json';dest=OUT/'pronunciation-edits'/f'{rid}.json'
  if not original.exists():shutil.copy2(raw,original);b.save(meta,{'originalSha256':b.sha(raw),'generation':ledger[rid]})
  prior=b.read(dest) if dest.exists() else {};source_key={'raw':b.sha(original),'text':row['spoken'],'names':{m.group():b.sha(NATIVE/(TERMS[m.group()][0]+'.wav')) for m in matches},'version':'native-boundaries-v2'}
  if prior.get('input')==source_key and prior.get('outputSha256')==b.sha(raw):report[rid]=prior;continue
  wave,sr=sf.read(original,dtype='float64');align=BASE/f'{rid}-alignment.json'
  if align.exists() and b.read(align).get('sourceSha256')==b.sha(original):words=b.read(align)['words']
  else:
   if model is None:model=WhisperModel(str(b.TTS_ROOT/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=4)
   tok=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language='zh');a=decode_audio(str(original),sampling_rate=16000);features=model.feature_extractor(a);encoded=model.encode(pad_or_trim(features));aligned=model.find_alignment(tok,[tok.encode(row['spoken'])],encoded,num_frames=features.shape[-1])[0]
   words=[{'text':w['word'],'start':float(w['start']),'end':float(w['end']),'probability':float(w['probability'])} for w in aligned];b.save(align,{'sourceSha256':b.sha(original),'words':words})
  mapping,_=b.map_words(row['spoken'],words,len(wave)/sr);edits=[]
  for match in matches:
   label=match.group();name,begin,end,reading,note=TERMS[label];first=len(b.chars(row['spoken'][:match.start()]));last=first+len(b.chars(label))-1;start=mapping[first][0];stop=mapping[last][1]
   carrier,csr=sf.read(NATIVE/(name+'.wav'),dtype='float64');assert csr==sr
   piece=carrier[round(begin*sr):min(len(carrier),round(end*sr))].copy();local=wave[round(start*sr):round(stop*sr)];gain=float(np.clip(active_rms(local)/active_rms(piece),.65,1.45));piece*=gain
   # Brief padding protects first/last consonants from the overlap itself.
   piece=np.pad(piece,(round(.025*sr),round(.035*sr)))
   edits.append({'label':label,'start':start,'end':stop,'nativeSource':name+'.wav','nativeStart':begin,'nativeEnd':min(end,len(carrier)/sr),'actualReading':reading,'note':note,'gain':gain,'crossfadeMs':12,'replacementSeconds':len(piece)/sr,'piece':piece})
  result=wave.copy()
  for e in reversed(edits):result=join(join(result[:round(e['start']*sr)],e['piece'],sr),result[round(e['end']*sr):],sr)
  sf.write(raw,result,sr,subtype='PCM_24')
  for e in edits:del e['piece']
  record={'input':source_key,'outputSha256':b.sha(raw),'originalSeconds':len(wave)/sr,'editedSeconds':len(result)/sr,'edits':edits,'sameReferenceVoice':True,'originalPitchAndSpeed':True,'humanListeningChecked':False,'requiresFullSentenceReview':True};b.save(dest,record);report[rid]=record
  ledger[rid].update(sha256=b.sha(raw),seconds=len(result)/sr,pronunciationEdits=edits,prePronunciationSha256=b.sha(original));b.save(OUT/'tts-generation-v02.json',ledger)
  row['ttsPronunciationMap']=[{'display':e['label'],'spoken':e['actualReading'],'method':'same-reference native-language term at Whisper acoustic boundaries, level matched, 12 ms crossfade','notes':e['note']} for e in edits]
  print('PRONUNCIATION',rid,len(result)/sr,[(e['label'],e['start'],e['end']) for e in edits],flush=True)
 patch=b.read(b.PATCH);patch['clips']=rows;b.save(b.PATCH,patch);b.save(OUT/'pronunciation-substitution-v02.json',report)
if __name__=='__main__':main()
