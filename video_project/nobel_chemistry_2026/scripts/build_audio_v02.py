"""Personal TTS, real Whisper word timestamps, preserved tails, restrained Dawn."""
from __future__ import annotations
import argparse,ctypes,difflib,gc,hashlib,json,math,os,re,shutil,subprocess,sys,time
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.ndimage import maximum_filter1d,gaussian_filter1d
ROOT=Path(__file__).resolve().parents[1];TTS_ROOT=Path('D:/python_project/tts')
PATCH=ROOT/'docs/v02/narration-v02.json';OUT=ROOT/'audio/v02';RAW=OUT/'raw';CLEAN=OUT/'clean';ASR=OUT/'asr';PUBLIC=ROOT/'public/audio-v02'
REF=TTS_ROOT/'work/clone-reference.wav';REF_META=TTS_ROOT/'work/clone-reference.json';MUSIC=OUT/'music-source.m4a'
PAUSE=.50;FPS=30;TAIL=.36;LOGO=3.;SR=48000
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,x):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(a):return subprocess.run(a,cwd=ROOT,check=True,text=True,encoding='utf8',capture_output=True)
def spoken(t):return t
def reading(row):return row.get('ttsText',row['spoken'])
def simplified(s):
 if os.name!='nt':return s
 b=ctypes.create_unicode_buffer(len(s)*2+10);ctypes.windll.kernel32.LCMapStringW(0x0804,0x02000000,s,len(s),b,len(b));return b.value
def chars(t):return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',simplified(t).lower())
def width(t):return sum(.52 if ord(c)<128 else 1 for c in t)
def percent_values(t):
 # Compare meaning while keeping real ASR text untouched in its transcript.
 digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
 def number(s):
  if re.fullmatch(r'[0-9.]+',s):return float(s)
  a,_,b=s.partition('点');value=0;last=0
  for c in a:
   if c in digits:last=digits[c]
   elif c in '十百千':value+=(last or 1)*{'十':10,'百':100,'千':1000}[c];last=0
  value+=last
  if b:value+=float('0.'+''.join(str(digits.get(c,c)) for c in b))
  return float(value)
 out=[]
 for m in re.finditer(r'百分之([零〇一二两三四五六七八九十百千点0-9.]+)|([0-9]+(?:\.[0-9]+)?)\s*[%％]',t):
  try:out.append(number(m.group(1) or m.group(2)))
  except ValueError:pass
 return out
def comparison_chars(t):
 # Only ASR comparison normalizes number formatting; subtitle text never does.
 def convert(m):
  values=percent_values(m.group(0));return format(values[0],'.8f').rstrip('0').rstrip('.') if values else m.group(0)
 return chars(re.sub(r'百分之[零〇一二两三四五六七八九十百千点0-9.]+',convert,t))
def generation_spec(row,index,attempt=0):
 params={'temperature':row.get('ttsTemperature',.42),'top_p':.85,'repetition_penalty':1.05,'max_new_tokens':700,'non_streaming_mode':True}
 spec={'text':reading(row),'referenceSha256':sha(REF),'model':'Qwen3-TTS-0.6B','seed':20261008+index+attempt*100,'parameters':params}
 return spec,hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def carry_unchanged(rows):
 """Copy only matching sentence inputs and exact untouched audio; protect V01."""
 prior=read(ROOT/'docs/v01/narration-v01.json');by={r['id']:r for r in prior['clips']};source_ledger=read(ROOT/'audio/v01/tts-generation-v01.json');dest=OUT/'tts-generation-v02.json';ledger=read(dest) if dest.exists() else {};carry=[]
 for i,row in enumerate(rows):
  rid=row['id'];prev=by.get(rid,{});old=source_ledger.get(rid,{})
  # Never overwrite an already prepared V02 take (native-name edits may have
  # been applied after this cache was first populated). V01 is only a source
  # for a missing V02 raw file.
  if row['spoken']!=prev.get('spoken') or reading(row)!=old.get('text') or rid in ledger or (RAW/f'{rid}.wav').exists():continue
  src=ROOT/f'audio/v01/raw/{rid}.wav';target=RAW/f'{rid}.wav';shutil.copy2(src,target);ledger[rid]=dict(old);carry.append({'id':rid,'source':src.relative_to(ROOT).as_posix(),'target':target.relative_to(ROOT).as_posix(),'sha256':sha(target),'textMatchesV01':True})
  clean_source=ROOT/'audio/v01/clean'
  for suffix in ('.wav','-tail.json','-broadcast.json','-broadcast.wav','-with-tail.wav'):
   p=clean_source/f'{rid}{suffix}'
   if p.exists():shutil.copy2(p,CLEAN/p.name)
  a=ROOT/f'audio/v01/asr/{rid}.json'
  if a.exists():shutil.copy2(a,ASR/a.name)
 if carry:save(dest,ledger)
 save(OUT/'carried-v01-sources.json',{'carried':carry,'policy':'V01 files read-only; physical V02 copies of matching individual takes, never old master'})
def generate(rows,force_ids=()):
 lp=OUT/'tts-generation-v02.json';ledger=read(lp) if lp.exists() else {};needed=[]
 for i,r in enumerate(rows):
  prev=ledger.get(r['id'],{});attempt=prev.get('attempt',0) if prev.get('text')==reading(r) else 0;spec,req=generation_spec(r,i,attempt);target=RAW/f"{r['id']}.wav"
  carried=prev.get('text')==reading(r) and target.exists() and prev.get('sha256')==sha(target)
  if r['id'] in force_ids or not carried:needed.append((i,r))
 if not needed:return
 import torch
 from qwen_tts import Qwen3TTSModel
 os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false';torch.set_num_threads(4)
 model=Qwen3TTSModel.from_pretrained(str(TTS_ROOT/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
 prompt=model.create_voice_clone_prompt(ref_audio=str(REF),ref_text=read(REF_META)['text'])
 for i,r in needed:
  rid=r['id'];attempt=ledger.get(rid,{}).get('attempt',0)+(1 if rid in force_ids else 0);spec,req=generation_spec(r,i,attempt)
  torch.manual_seed(spec['seed']);t=time.time();waves,sr=model.generate_voice_clone(text=[spec['text']],language=['Auto'],voice_clone_prompt=prompt,**spec['parameters']);w=np.asarray(waves[0]).squeeze()
  if w.ndim!=1 or not np.isfinite(w).all() or len(w)<sr*.2:raise RuntimeError('invalid take '+rid)
  target=RAW/f'{rid}.wav';sf.write(target,w,sr,subtype='PCM_24');ledger[rid]={**spec,'attempt':attempt,'requestHash':req,'seconds':len(w)/sr,'sampleRate':sr,'sha256':sha(target),'elapsedSeconds':time.time()-t};save(lp,ledger);print('TTS',rid,len(w)/sr,flush=True)
 del prompt,model;gc.collect();torch.cuda.empty_cache()
def clean_rows(rows):
 sys.path.insert(0,str(TTS_ROOT));from broadcast_voice import master_voice
 results=[]
 for r in rows:
  rid=r['id'];raw=RAW/f'{rid}.wav';target=CLEAN/f'{rid}.wav';meta=CLEAN/f'{rid}-tail.json';inputsha=sha(raw);cache=read(meta) if meta.exists() else {}
  if cache.get('inputSha256')!=inputsha or cache.get('policy')!='tail-preserving-v2' or not target.exists():
   w,sr0=sf.read(raw,dtype='float64');w=w.mean(1) if w.ndim==2 else w;safe=CLEAN/f'{rid}-with-tail.wav';sf.write(safe,np.pad(w,(0,round(TAIL*sr0))),sr0,subtype='PCM_24')
   bc=CLEAN/f'{rid}-broadcast.wav';master_voice(safe,bc,CLEAN/f'{rid}-broadcast.json');x,sr=sf.read(bc,dtype='float64');x=np.stack((x,x),axis=1)
   total=math.ceil(len(x)/SR*FPS)*int(SR/FPS);x=np.pad(x,((0,total-len(x)),(0,0)));sf.write(target,x,SR,subtype='PCM_24')
   step=round(sr0*.02);rms=np.array([np.sqrt(np.mean(w[k:k+step]**2)) for k in range(0,len(w),step)]);active=np.flatnonzero(rms>max(.0015,float(np.max(rms))*.045));speech_end=min(len(w)/sr0,(active[-1]+1)*.02) if len(active) else 0
   cache={'policy':'tail-preserving-v2','inputSha256':inputsha,'outputSha256':sha(target),'rawSeconds':len(w)/sr0,'seconds':len(x)/SR,'speechEndEstimateSeconds':speech_end,'tailMarginSeconds':len(x)/SR-speech_end,'rawEndpointRmsDb':float(20*np.log10(max(np.sqrt(np.mean(w[-round(.06*sr0):]**2)),1e-12))),'humanListeningChecked':False};save(meta,cache)
  results.append({**r,'naturalSeconds':cache['seconds'],'audio':target.relative_to(ROOT).as_posix(),'tail':cache})
 return results
def map_words(text,words,duration):
 observed=[];times=[]
 for w in words:
  cs=chars(w['text'])
  for j,c in enumerate(cs):observed.append(c);times.append((w['start']+(w['end']-w['start'])*j/max(1,len(cs)),w['start']+(w['end']-w['start'])*(j+1)/max(1,len(cs))))
 target=chars(text);mapping={};m=difflib.SequenceMatcher(None,observed,list(target),autojunk=False)
 for tag,a,b,c,d in m.get_opcodes():
  if tag=='equal':
   for j in range(d-c):mapping[c+j]=times[a+j]
  elif tag=='replace' and b>a and d>c:
   left,right=times[a][0],times[b-1][1]
   for j in range(d-c):mapping[c+j]=(left+(right-left)*j/(d-c),left+(right-left)*(j+1)/(d-c))
 anchors=sorted(mapping)
 for j in range(len(target)):
  if j in mapping:continue
  before=[k for k in anchors if k<j];after=[k for k in anchors if k>j];l=before[-1] if before else -1;r=after[0] if after else len(target)
  left=mapping[l][1] if l>=0 else (words[0]['start'] if words else 0);right=mapping[r][0] if r<len(target) else duration-TAIL;n=r-l-1
  mapping[j]=(left+max(0,right-left)*(j-l-1)/max(1,n),left+max(0,right-left)*(j-l)/max(1,n))
 return mapping,m.ratio()
def captions(row,words):
 mapping,ratio=map_words(row['spoken'],words,row['naturalSeconds']);pieces=re.findall(r'[^，。！？；：]+[，。！？；：]?',row['spoken']);parts=[]
 for p in pieces:
  if parts and width(parts[-1])<7 and width(parts[-1]+p)<=29:parts[-1]+=p
  else:parts.append(p)
 assert ''.join(parts)==row['spoken'],'caption text changed'
 out=[];offset=0
 for i,p in enumerate(parts):
  n=len(chars(p));ts=[mapping[k] for k in range(offset,offset+n)];offset+=n;start=max(0,ts[0][0]-.055);end=min(row['naturalSeconds']-.15,ts[-1][1]+.14)
  out.append({'start':round(start,3),'end':round(max(start+.10,end),3),'text':p,'source':'Whisper-small word timestamps; unmatched tokens bounded by acoustic anchors','id':f"{row['id']}-c{i:02}"})
 for a,b in zip(out,out[1:]):
  if a['end']>b['start'] or b['start']-a['end']<.20:a['end']=b['start']
  if a['end']<=a['start']:a['end']=a['start']+.10;b['start']=max(b['start'],a['end'])
 return out,ratio
def transcribe(rows):
 from faster_whisper import WhisperModel
 from faster_whisper.audio import decode_audio,pad_or_trim
 from faster_whisper.tokenizer import Tokenizer
 model=WhisperModel(str(TTS_ROOT/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=4);records=[]
 tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language='zh')
 prompt='普通话化学讲解。Henri B. Kagan, Kenso Soai, Louis Pasteur, Charles Frank。对映体，手性，配体，二异丙基锌，嘧啶，醇，锌醇盐，非线性效应，自催化。'
 for row in rows:
  rid=row['id'];src=ROOT/row['audio'];dest=ASR/f'{rid}.json';h=sha(src);rec=read(dest) if dest.exists() else {}
  if rec.get('sourceSha256')!=h:
   segments,_=model.transcribe(str(src),language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,initial_prompt=prompt)
   words=[{'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segments for w in s.words or []]
   if not words:raise RuntimeError('ASR no words '+rid)
   heard=simplified(''.join(w['text'] for w in words));a,b=chars(row['spoken']),chars(heard);match=difflib.SequenceMatcher(None,a,b,autojunk=False)
   edits=[{'operation':tag,'expected':a[x:y],'heard':b[u:v],'position':x} for tag,x,y,u,v in match.get_opcodes() if tag!='equal'];flags=[]
   if match.ratio()<.80:flags.append('low_asr_match')
   if row['tail']['rawEndpointRmsDb']>-32:flags.append('non_silent_raw_endpoint_needs_review')
   if any(e['operation']=='delete' and len(e['expected'])>=3 and e['position']+len(e['expected'])>=len(a)-1 for e in edits):flags.append('possible_missing_tail')
   english=re.findall(r'\b(?:Henri B\. Kagan|Kenso Soai|Louis Pasteur|Charles Frank|Kagan|Soai|DNA)\b',row['spoken']);names=[{'expected':n,'recognizedLiterally':chars(n) in b,'note':'ASR spelling is not a human pronunciation verdict'} for n in english]
   expected_numbers=percent_values(row['spoken']);heard_numbers=percent_values(heard)
   number_checks=[{'expectedPercent':v,'recognized':any(abs(v-z)<max(1e-9,abs(v)*1e-6) for z in heard_numbers)} for v in expected_numbers]
   if rid=='011' and any(not n['recognized'] for n in number_checks):flags.append('critical_percentage_needs_review')
   rec={'id':rid,'sourceSha256':h,'expected':row['spoken'],'heard':heard,'words':words,'agreement':match.ratio(),'edits':edits,'flags':flags,'englishNames':names,'percentageChecks':number_checks,'recognizedPercentages':heard_numbers,'humanListeningChecked':False,'method':'faster-whisper small CPU int8; real word times'};save(dest,rec)
  rec['numericNormalizedAgreement']=difflib.SequenceMatcher(None,comparison_chars(row['spoken']),comparison_chars(rec['heard']),autojunk=False).ratio()
  if rec['numericNormalizedAgreement']>=.80:rec['flags']=[f for f in rec['flags'] if f!='low_asr_match']
  bare_values=[float(v) for v in re.findall(r'[0-9]+(?:\.[0-9]+)?',rec['heard'])]
  explicit=percent_values(rec['heard']);observed_values=explicit+bare_values
  rec['percentageChecks']=[{'expectedPercent':v,'numericValueRecognized':any(abs(v-z)<max(1e-9,abs(v)*1e-6) for z in observed_values),'percentUnitExplicitInTranscript':any(abs(v-z)<max(1e-9,abs(v)*1e-6) for z in explicit),'note':'ASR may format a spoken percentage as digits without the percent sign; no claim of human listening.'} for v in percent_values(row['spoken'])]
  if all(n['numericValueRecognized'] for n in rec['percentageChecks']):rec['flags']=[f for f in rec['flags'] if f!='critical_percentage_needs_review']
  save(dest,rec)
  if 'forcedWordTimings' not in rec and row['naturalSeconds']<29.5:
   waveform=decode_audio(str(src),sampling_rate=16000);features=model.feature_extractor(waveform);encoded=model.encode(pad_or_trim(features));aligned=model.find_alignment(tokenizer,[tokenizer.encode(row['spoken'])],encoded,num_frames=features.shape[-1])[0]
   rec['forcedWordTimings']=[{'text':w['word'],'start':float(w['start']),'end':float(w['end']),'probability':float(w['probability'])} for w in aligned];rec['captionAlignmentMethod']='Whisper cross-attention DTW forced alignment to complete spoken text, separate from independent ASR missing-word check';save(dest,rec)
  timing_words=rec.get('forcedWordTimings',rec['words']);row['subtitleParts'],ratio=captions(row,timing_words)
  for p in row['subtitleParts']:p['source']=rec.get('captionAlignmentMethod',p['source'])
  row['alignmentAgreement']=ratio;row['wordTimings']=timing_words;records.append(rec);print('ASR',rid,round(rec['agreement'],3),rec['flags'],rec['heard'],flush=True)
 save(OUT/'asr-screen-v02.json',{'records':records,'flagged':[r['id'] for r in records if r['flags']],'humanListeningChecked':False,'limitation':'Automated screen: names/numerals/homophones may be recognition errors; no claim of human-verified pronunciation.'});return records
def timeline(rows):
 clips=[];cursor=0
 for r in rows:
  frames=round(r['naturalSeconds']*FPS);c={k:v for k,v in r.items() if k not in {'naturalSeconds','subtitleTexts','tail'}};c.update(start=cursor,end=cursor+frames,audioSeconds=r['naturalSeconds'],tailMarginSeconds=r['tail']['tailMarginSeconds']);clips.append(c);cursor=c['end']+round(PAUSE*FPS)
 speech_end=clips[-1]['end'];end=speech_end+round(LOGO*FPS)
 tl={'version':'nobel-chemistry-2026-v02-corrected-word-aligned','fps':FPS,'duration':end,'seconds':end/FPS,'narrationEnd':speech_end,'logoHoldFrames':round(LOGO*FPS),'clips':clips,'editorial':{'voice':'Qwen3-TTS-0.6B rainbow鱼 personal clone','rate':'original natural speed; no time stretch','pauseSeconds':PAUSE,'tailPolicy':'raw preserved plus 0.36s PCM silence before cleanup','subtitlePolicy':'full spoken text with measured Whisper word timing; unmatched tokens use neighboring acoustic anchors'}}
 save(ROOT/'src/chemistry2026v02/timeline-v02.json',tl)
 def stamp(t):
  ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
 cues=[]
 for c in clips:
  for p in c['subtitleParts']:cues.append(f"{len(cues)+1}\n{stamp(c['start']/FPS+p['start'])} --> {stamp(c['start']/FPS+p['end'])}\n{p['text']}")
 (OUT/'narration-v02.srt').write_text('\n\n'.join(cues)+'\n',encoding='utf8');shutil.copy2(OUT/'narration-v02.srt',PUBLIC/'narration-v02.srt');print('TIMELINE_READY',tl['duration'],tl['seconds'],flush=True);return tl
def music_license():
 ch=ROOT.parent/'ai_evolution_ch04_space_time';candidate=next(x for x in read(ch/'research/music/v09/sources.json')['candidates'] if x['title']=='Dawn')
 if sha(MUSIC)!=candidate['sourceSHA256']:raise RuntimeError('Dawn source hash mismatch')
 dest=ROOT/'research/music';dest.mkdir(exist_ok=True,parents=True);shutil.copy2(ch/candidate['authorizationEvidence']['publicEvidenceFile'],dest/'Dawn-creator-page.html');candidate['localSource']='audio/v02/music-source.m4a';candidate['localEvidence']='research/music/Dawn-creator-page.html';save(dest/'Dawn-license.json',candidate)
 (ROOT/'docs/v02/music-attribution.md').write_text(candidate['attribution']+'\n\n原曲保持原调原速；乐句处交叉延展，轻微均衡和旁白闪避。\n作者页仅标记 CC-BY，未补写数字许可版本。\n',encoding='utf8');return candidate
def loudness(path):
 r=run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-14.5:TP=-1.8:LRA=8:print_format=json','-f','null','NUL']);return json.JSONDecoder().raw_decode(r.stderr[r.stderr.rfind('{'):])[0]
def assemble(rows,tl):
 total=round(tl['seconds']*SR);voice=np.zeros((total,2),np.float32)
 for c in tl['clips']:
  x,sr=sf.read(ROOT/c['audio'],dtype='float32',always_2d=True);start=round(c['start']/FPS*SR);voice[start:start+len(x)]=x
 sf.write(OUT/'narration.wav',voice,SR,subtype='PCM_24');source=OUT/'music-source-48k.wav';run(['ffmpeg','-v','error','-y','-i',str(MUSIC),'-af','highpass=f=70,lowpass=f=14000,equalizer=f=2700:t=o:w=1.8:g=-2.5','-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(source)]);w,_=sf.read(source,dtype='float32',always_2d=True)
 repeat=w[round(22*SR):round(min(202,len(w)/SR-5)*SR)];out=w.copy();seams=[];overlap=round(8*SR)
 while len(out)<total:
  n=min(overlap,len(out),len(repeat));u=np.linspace(0,1,n,dtype=np.float32);blend=(u*u*(3-2*u))[:,None];at=len(out)-n;out[-n:]=out[-n:]*(1-blend)+repeat[:n]*blend;out=np.concatenate((out,repeat[n:]),axis=0);seams.append({'startSeconds':at/SR,'durationSeconds':n/SR,'incomingSourceSeconds':22,'method':'smooth complementary crossfade, original pitch/speed'})
 music=out[:total];block=round(SR*.05);count=math.ceil(total/block);vr=np.array([np.sqrt(np.mean(voice[i*block:min(total,(i+1)*block)]**2)) for i in range(count)]);mr=np.array([np.sqrt(np.mean(music[i*block:min(total,(i+1)*block)]**2)) for i in range(count)]);active=vr>.009;mask=np.repeat(active,block)[:total]
 voice_active=float(np.sqrt(np.mean(voice[mask]**2)));music_active=float(np.sqrt(np.mean(music[mask]**2)));base=voice_active/max(music_active,1e-8)*10**(-15.5/20)
 hold=maximum_filter1d(active.astype(float),size=13,mode='nearest');env=gaussian_filter1d(hold,sigma=5);duck=10**((-3.0*env)/20);times=np.arange(count)*.05;contour=1+.07*np.sin(times*2*np.pi/87);gains=base*duck*contour;gain=np.interp(np.arange(total),np.arange(count)*block,gains).astype(np.float32);music*=gain[:,None]
 fade=round(2.5*SR);music[:fade]*=np.linspace(0,1,fade,dtype=np.float32)[:,None];fade=round(5*SR);music[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)[:,None];sf.write(OUT/'music.wav',music,SR,subtype='PCM_24');sf.write(OUT/'premaster.wav',voice+music,SR,subtype='PCM_24');measure=loudness(OUT/'premaster.wav')
 filt=f"loudnorm=I=-14.5:TP=-1.8:LRA=8:measured_I={measure['input_i']}:measured_TP={measure['input_tp']}:measured_LRA={measure['input_lra']}:measured_thresh={measure['input_thresh']}:offset={measure['target_offset']}:linear=true:print_format=json"
 run(['ffmpeg','-v','info','-y','-i',str(OUT/'premaster.wav'),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(OUT/'master.wav')]);final=loudness(OUT/'master.wav');gap=20*np.log10(np.sqrt(np.mean(voice[mask]**2))/max(np.sqrt(np.mean(music[mask]**2)),1e-12))
 for name in ('master.wav','narration.wav','music.wav'):shutil.copy2(OUT/name,PUBLIC/name)
 save(OUT/'mix-qa-v02.json',{'masterSha256':sha(OUT/'master.wav'),'durationSeconds':tl['seconds'],'finalPcm':final,'speechToMusicActiveRmsGapDb':float(gap),'musicCrossfades':seams,'humanListeningChecked':False,'targetLufs':-14.5,'targetTruePeakDbtp':-1.8,'oldAudioLayerCount':0,'note':'Only current narration stem plus Dawn stem; generated-video audio excluded.'});return final,float(gap)
def final_checks(tl):
 cues=[];issues=[]
 for c in tl['clips']:
  ps=c['subtitleParts'];assert ''.join(p['text'] for p in ps)==c['spoken']
  for a,b in zip(ps,ps[1:]):
   if a['end']>b['start']+.001:issues.append([c['id'],'caption_overlap'])
  for p in ps:
   cues.append(p)
   if p['start']<0 or p['end']>c['audioSeconds'] or p['end']<=p['start']:issues.append([c['id'],'caption_bounds'])
 hashes={n:sha(OUT/n) for n in ('master.wav','narration.wav','music.wav')}
 assert all(hashes[n]==sha(PUBLIC/n) for n in hashes),'public audio drift'
 assert not issues,issues
 aac=OUT/'master-aac-check.m4a'
 check=OUT/'aac-check-source.json';prior=read(check) if check.exists() else {}
 if not aac.exists() or prior.get('sourceSha256')!=hashes['master.wav']:
  run(['ffmpeg','-v','error','-y','-i',str(OUT/'master.wav'),'-c:a','aac','-b:a','320k','-ar',str(SR),str(aac)]);save(check,{'sourceSha256':hashes['master.wav'],'aacSha256':sha(aac),'codec':'AAC 320kbps 48kHz'})
 measurement=loudness(aac);records=read(OUT/'asr-screen-v02.json')['records']
 report={'sourceSha256':hashes['master.wav'],'stemHashes':hashes,'timelineSha256':sha(ROOT/'src/chemistry2026v02/timeline-v02.json'),'subtitleSha256':sha(OUT/'narration-v02.srt'),'durationSeconds':tl['seconds'],'captionCount':len(cues),'captionTextExact':True,'captionIssues':issues,'maxCaptionCharacterWidth':max(width(c['text']) for c in cues),'minimumCueSeconds':min(c['end']-c['start'] for c in cues),'aac320kMeasured':{'integratedLufs':float(measurement['input_i']),'truePeakDbtp':float(measurement['input_tp']),'lra':float(measurement['input_lra'])},'asrCriticalFlags':[r['id'] for r in records if r['flags']],'nameSpellingVariants':[{'id':r['id'],'expected':n['expected'],'transcript':r['heard']} for r in records for n in r['englishNames'] if not n['recognizedLiterally']],'humanListeningChecked':False,'limitation':'Automated ASR and technical QA only. The isolated Soai/SoA spelling variant does not establish wrong pronunciation.'}
 assert float(measurement['input_tp'])< -1.5,'AAC true peak exceeds target'
 save(OUT/'final-audio-qa-v02.json',report);return report
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--skip-generate',action='store_true');ap.add_argument('--force-ids',default='');args=ap.parse_args()
 for p in (OUT,RAW,CLEAN,ASR,PUBLIC):p.mkdir(parents=True,exist_ok=True)
 patch=read(PATCH);assert patch['version'].endswith('corrected'),'wait for corrected script';rows=patch['clips']
 carry_unchanged(rows)
 if not args.skip_generate:generate(rows,args.force_ids.split(',') if args.force_ids else ())
 rows=clean_rows(rows);records=transcribe(rows);tl=timeline(rows);license=music_license();final,gap=assemble(rows,tl)
 qa={'version':patch['version'],'sourceScriptSha256':sha(PATCH),'timeline':'src/chemistry2026v02/timeline-v02.json','durationSeconds':tl['seconds'],'sampleRate':SR,'referenceVoice':{'model':'Qwen3-TTS-0.6B','referenceFile':str(REF),'referenceSha256':sha(REF),'naturalSpeed':True},'music':{'title':'Dawn','author':'Sappheiros','source':'audio/v02/music-source.m4a','sourceSha256':sha(MUSIC),'license':license['authorizationEvidence']['license'],'attribution':license['attribution']},'masterSha256':sha(OUT/'master.wav'),'finalPcm':final,'speechToMusicActiveRmsGapDb':gap,'minTailMarginSeconds':min(r['tail']['tailMarginSeconds'] for r in rows),'captionTextExact':all(''.join(p['text'] for p in r['subtitleParts'])==r['spoken'] for r in rows),'asrFlagged':[r['id'] for r in records if r['flags']],'humanListeningChecked':False};save(OUT/'audio-manifest-v02.json',qa);save(OUT/'audio-qa-v02.json',qa);final_checks(tl);print('AUDIO_COMPLETE',json.dumps(qa,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
