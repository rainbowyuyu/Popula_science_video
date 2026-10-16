"""Assemble selected full V8 takes and measured timing; never install production.

Old source captions retain exact relative timing. Changed takes are word-aligned
from independent, unprompted and no-VAD ASR. Raw fragments are not trimmed.
"""
from pathlib import Path
from copy import deepcopy
import json,hashlib,math,sys,shutil,argparse
import numpy as np
import soundfile as sf
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[2];OUT=BASE/'staged'
sys.path.insert(0,str(ROOT/'scripts'))
from qc_v5 import build_captions,srt_time
import qc_v5
# V5's module function contains an ID-based legacy pronunciation override. V8
# explicitly freezes its spoken text in the story; only this process uses it.
qc_v5.spoken=lambda row:row.get('ttsText',row['text'])
_typography_chars=qc_v5.chars
def alignment_chars(text):
 # Display keeps the abbreviation; speech deliberately uses its full name.
 # Expand it only in the alignment layer, never in recorded recognition.
 value=_typography_chars(text)
 return value.replace('低密度脂蛋白ldl','低密度脂蛋白').replace('ldl','低密度脂蛋白')
qc_v5.chars=alignment_chars
SR=48000;FPS=30;SPF=1600
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def save(p,x):p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--preserve-shot-slots',action='store_true');options=ap.parse_args()
 storypath=ROOT/'docs/story-v9.json';story=read(storypath);storysha=sha(storypath)
 baseline=read(ROOT/'src/timeline.json');oldclips={c['id']:c for c in baseline['clips']};audit={c['id']:c for c in read(BASE/'source-boundary-audit.json')['rows']}
 selection=read(BASE/'selected-parts-v9.json');assert selection['storySHA256']==storysha
 OUT.mkdir(exist_ok=True);(OUT/'voice').mkdir(exist_ok=True);(OUT/'takes').mkdir(exist_ok=True)
 clips=[];takes=[];captions=[];asrs={};placements=[];sections=[];cursor=12
 pauses={'h001':1.2,'h007':3.,'h020':5.,'h025':3.,'h027':4.,'h037':2.}
 for row in story['shots']:
  sid=row['id'];old=oldclips[sid];dest=OUT/'voice'/f'{sid}.wav';part_records=[]
  if sid in selection['sentences']:
   wanted=selection['sentences'][sid];parts=[read(BASE/p) for p in wanted['parts']]
   assert ''.join(p['ttsText'] for p in parts)==row.get('ttsText',row['text'])
   waveparts=[];words=[];heard=[];offset=0;part_places=[]
   for p,record_path in zip(parts,wanted['parts']):
    path=Path(p['processed']);assert sha(path)==p['sha256'];x,rate=sf.read(path,dtype='float64');assert rate==SR and x.ndim==1
    ar=read((BASE/record_path).parent.parent/'asr'/Path(record_path).name);assert ar['sourceSHA256']==p['sha256']
    words.extend(dict(w,start=w['start']+offset/SR,end=w['end']+offset/SR) for w in ar['words']);heard.append(ar['heard'])
    part_places.append({'partIndex':p['partIndex'],'startSample':offset,'endSample':offset+len(x),'rawSpeechStartSample':offset+3840,'ttsText':p['ttsText'],'partRecord':record_path,'sha256':p['sha256']})
    offset+=len(x);waveparts.append(x);part_records.append(p)
   data=np.concatenate(waveparts);sf.write(dest,data,SR,subtype='PCM_24')
   take={'id':sid,'text':row['text'],'ttsText':row.get('ttsText',row['text']),'storySHA256':storysha,'processed':str(dest),'sha256':sha(dest),'samples':len(data),'durationSeconds':len(data)/SR,'sampleRate':SR,'parts':parts,'placements':part_places,'trimmed':False,'timeStretch':False,'voiceSpeedFactor':1,'subjectiveListeningChecked':False}
   asrs[sid]={'sourceSHA256':take['sha256'],'storySHA256':storysha,'passKind':'first','expected':take['ttsText'],'heard':''.join(heard),'words':words,'cacheKey':hashlib.sha256(json.dumps(wanted,sort_keys=True).encode()).hexdigest(),'vad_filter':False,'initial_prompt':None}
  else:
   source=ROOT/old['audioSource'];assert sha(source)==old['audioSHA256'], f'baseline source hash mismatch for {sid}';shutil.copyfile(source,dest)
   take={'id':sid,'text':row['text'],'ttsText':row.get('ttsText',row['text']),'storySHA256':storysha,'processed':str(dest),'sha256':sha(dest),'source':str(source),'sourceTakeRecord':audit[sid]['takeRecord'],'sourceRaw':audit[sid]['raw'],'sourceRawSHA256':audit[sid]['rawSHA256'],'unchangedSource':True,'trimmed':False,'timeStretch':False,'subjectiveListeningChecked':False}
  info=sf.info(dest);assert info.samplerate==SR and info.channels==1
  take.update(samples=info.frames,durationSeconds=info.duration,sampleRate=SR);takepath=OUT/'takes'/f'{sid}.json';save(takepath,take);takes.append(take)
  extra=pauses.get(sid,0.);effective=row.get('pauseAfterSeconds',.2)+extra;end=cursor+math.ceil(info.frames/SPF)+round(effective*FPS)
  absorbed_frames=0
  if options.preserve_shot_slots:
   assert cursor==old['start'],'Earlier shot slot drift'
   absorbed_frames=end-old['end'];end=old['end'];gap=end-cursor-math.ceil(info.frames/SPF)
   assert gap>=0,'New voice exceeds the entire existing shot slot'
   effective=gap/FPS;extra=effective-row.get('pauseAfterSeconds',.2)
   assert extra>=-1e-9,'New voice exceeds its approved observation hold'
   extra=max(0.,extra);pauses[sid]=extra
  clip=deepcopy(row);clip.update(start=cursor,end=end,duration=end-cursor,startSeconds=cursor/FPS,endSeconds=end/FPS,voiceEndSeconds=cursor/FPS+info.duration,spokenEndSeconds=cursor/FPS+info.duration,voiceDurationSeconds=info.duration,audioSHA256=take['sha256'],audio=f'voice/{sid}.wav',audioSource=dest.relative_to(ROOT).as_posix(),takeSHA256=sha(takepath),additionalPauseAfterSeconds=extra,effectivePauseAfterSeconds=effective)
  if 'placements' in take:
   clip['voiceParts']=[{'partIndex':p['partIndex'],'startSeconds':cursor/FPS+p['startSample']/SR,'endSeconds':cursor/FPS+p['endSample']/SR,'ttsText':p['ttsText']} for p in take['placements']]
  if absorbed_frames:
   clip['voiceBoundaryRevision']={'shotSlotsPreserved':True,'observationHoldAbsorbedFrames':absorbed_frames,'previousVoiceDurationSeconds':old['voiceDurationSeconds'],'newVoiceDurationSeconds':info.duration}
  clips.append(clip);placements.append({'id':sid,'startSample':cursor*SPF,'endSample':cursor*SPF+info.frames,'sourceSHA256':take['sha256'],'placementErrorSamples':0})
  if sid not in selection['sentences']:
   shift=cursor-old['start']
   captions.extend(dict(c,start=c['start']+shift,end=c['end']+shift) for c in baseline['captions'] if c['clipId']==sid)
  if sections and sections[-1]['id']==row['section']:sections[-1]['end']=end
  else:sections.append({'id':row['section'],'start':cursor,'end':end})
  cursor=end
 duration=cursor+360;sections.append({'id':'references','start':cursor,'end':duration})
 tl=deepcopy({k:v for k,v in story.items() if k!='shots'});tl.update(fps=FPS,duration=duration,durationFrames=duration,durationSeconds=duration/FPS,clips=clips,captions=captions,sections=sections,draft=False,voiceSpeedFactor=1,storySHA256=storysha,storySource=str(storypath),outro={'start':cursor,'end':duration,'duration':360},rhythmOverrides={'path':(BASE/'selected-parts.json').relative_to(ROOT).as_posix(),'h027Policy':'four additional seconds replace the prior three seconds; added exactly once','additionalPauseAfterSeconds':pauses,'totalAddedSeconds':sum(pauses.values())})
 cap,warnings=build_captions(tl,asrs,{r['id']:r for r in story['shots']},storysha,only=list(selection['sentences']))
 for c in cap:
  if c['clipId'] in selection['sentences']:c['timingSource']='V8 immutable fragment unprompted no-VAD CPU Whisper word alignment; standard display text'
 tl['captions']=cap;save(OUT/'timeline.json',tl);save(OUT/'caption-warnings.json',warnings);save(OUT/'caption-asr.json',asrs)
 if options.preserve_shot_slots:
  assert tl['durationFrames']==baseline['durationFrames']
  assert all((c['start'],c['end'])==(oldclips[c['id']]['start'],oldclips[c['id']]['end']) for c in clips)
 srt='\n\n'.join(f"{i+1}\n{srt_time(c['start'],FPS)} --> {srt_time(c['end'],FPS)}\n{c['text']}" for i,c in enumerate(cap))+'\n';(OUT/'captions.srt').write_text(srt,encoding='utf8')
 narration=OUT/'narration.wav'
 with sf.SoundFile(narration,'w',samplerate=SR,channels=1,subtype='PCM_24') as writer:
  position=0
  for take,p in zip(takes,placements):
   writer.write(np.zeros(p['startSample']-position,dtype=np.float32));x,_=sf.read(take['processed'],dtype='float32');writer.write(x);position=p['endSample']
  writer.write(np.zeros(duration*SPF-position,dtype=np.float32))
 with sf.SoundFile(narration) as stream:
  for take,p in zip(takes,placements):
   stream.seek(p['startSample']);x=stream.read(take['samples'],dtype='float64');y,_=sf.read(take['processed'],dtype='float64');p['maximumPCMError']=float(np.max(np.abs(x-y)));assert p['maximumPCMError']==0
 save(OUT/'placements.json',{'storySHA256':storysha,'timelineSHA256':sha(OUT/'timeline.json'),'narrationSHA256':sha(narration),'totalSamples':duration*SPF,'allSourcePCMPlacementsExact':True,'sentences':placements,'subjectiveListeningChecked':False})
 save(OUT/'selected-takes.json',{'storySHA256':storysha,'count':len(takes),'changedSentenceCount':len(selection['sentences']),'takes':takes})
 print(json.dumps({'durationSeconds':tl['durationSeconds'],'durationFrames':duration,'timeline':str(OUT/'timeline.json'),'changed':len(selection['sentences']),'captionCount':len(cap),'captionWarnings':warnings,'GLP':[c for c in clips if c['id'] in ['h026','h027','h028']]},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
