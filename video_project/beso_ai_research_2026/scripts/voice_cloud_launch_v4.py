"""Qwen3-TTS realtime, using one public cloud voice for this complete film.

Uses the exact installed DashScope SDK interface. Credentials stay in runtime
environment; old local takes are preserved. No personal reference is uploaded.
"""
from pathlib import Path
import argparse,base64,hashlib,importlib.util,json,os,sys,tempfile,threading,time
import numpy as np
import soundfile as sf
import dashscope
from dashscope.audio.qwen_tts_realtime import QwenTtsRealtime,QwenTtsRealtimeCallback,AudioFormat
from voice import read,save,sha,ROOT,GUARDS

MODEL='qwen3-tts-flash-realtime'
SETTINGS=dict(mode='server_commit',responseFormat='pcm',sampleRate=24000,languageType='auto',speechRate=1.04,
    instructions='自然、清晰、有节奏的工程发布片解说，音色温暖稳定，英文名称用英文读，不夸张，不播音腔。')

class Capture(QwenTtsRealtimeCallback):
    def __init__(self):self.done=threading.Event();self.audio=bytearray();self.events=[];self.error=None
    def on_event(self,event):
        kind=event.get('type')
        if kind=='response.audio.delta':self.audio.extend(base64.b64decode(event['delta']))
        else:
            self.events.append(event)
            if kind=='error':self.error=event;self.done.set()
            elif kind=='session.finished':self.done.set()
    def on_close(self,code,msg):
        self.events.append(dict(type='transport.close',code=code,message=msg));self.done.set()

def main():
    sys.stdout.reconfigure(encoding='utf8')
    parser=argparse.ArgumentParser();parser.add_argument('--only',default='');parser.add_argument('--voice',default='Ethan');args=parser.parse_args()
    plan=read(ROOT/'research/launch-v4-voice-plan.json')
    voice_id=args.voice
    dashscope.api_key=os.environ['QWEN_API_KEY_BACKUP']
    spec=importlib.util.spec_from_file_location('broadcast_voice',Path('D:/python_project/tts/broadcast_voice.py'))
    cleaner=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleaner)
    rows=[r for r in plan['shots'] if not args.only or r['id'] in args.only.split(',')]
    for row in rows:
        text=row.get('ttsText',row['text'])
        segments=row.get('ttsSegments',[dict(text=text,language='auto')])
        sig=hashlib.sha256(json.dumps([MODEL,voice_id,text,segments,SETTINGS,GUARDS],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        legacy_sig=hashlib.sha256(json.dumps([MODEL,voice_id,text,SETTINGS,GUARDS],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        metadata=ROOT/'audio/takes'/f"{row['id']}.json"
        allowed_signatures=[sig]+([legacy_sig] if not row.get('ttsSegments') else [])
        if metadata.exists() and read(metadata).get('signature') in allowed_signatures and (ROOT/read(metadata)['processed']).exists():continue
        started=time.monotonic()
        captures=[];chunks=[]
        for segment in segments:
            callback=Capture();tts=QwenTtsRealtime(model=MODEL,callback=callback)
            tts.connect()
            tts.update_session(voice=voice_id,response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
                mode='server_commit',sample_rate=24000,language_type=segment['language'],speech_rate=SETTINGS['speechRate'],
                instructions=SETTINGS['instructions'],optimize_instructions=False)
            tts.append_text(segment['text']);tts.finish()
            if not callback.done.wait(90):
                tts.close();raise TimeoutError('Cloud sentence synthesis unfinished '+row['id'])
            tts.close();captures.append(dict(text=segment['text'],language=segment['language'],events=callback.events))
            if callback.error:break
            chunks.append(bytes(callback.audio))
        event_path=ROOT/'audio/cloud-runs'/f"{row['id']}.json"
        save(event_path,dict(id=row['id'],model=MODEL,voiceId=voice_id,text=text,settings=SETTINGS,
            elapsedSeconds=time.monotonic()-started,segments=captures,events=callback.events,credentialSource='QWEN_API_KEY_BACKUP',
            personalReferenceUploaded=False,voiceSource='Provider public voice; clone runtime unavailable'))
        if callback.error:raise RuntimeError('Provider error '+json.dumps(callback.error,ensure_ascii=False))
        audio=b'\x00\x00'*round(.04*24000)
        audio=audio.join(chunks)
        if len(audio)<2400:raise RuntimeError('No complete audio '+row['id'])
        wav=np.frombuffer(audio,dtype='<i2').astype(np.float64)/32768
        raw=ROOT/'audio/raw'/f"{row['id']}-{sig[:10]}.wav";raw.parent.mkdir(exist_ok=True)
        sf.write(raw,wav,24000,subtype='PCM_16')
        segment_sources=[]
        for index,chunk in enumerate(chunks):
            source=raw.with_name(raw.stem+f'-segment{index}.wav')
            sf.write(source,np.frombuffer(chunk,dtype='<i2'),24000,subtype='PCM_16')
            segment_sources.append(dict(file=source.relative_to(ROOT).as_posix(),sha256=sha(source),**segments[index]))
        processed=ROOT/'public/voice'/f"{row['id']}.wav"
        with tempfile.TemporaryDirectory(prefix='launch-v4-cloud-guard-') as folder:
            source=Path(folder)/'protected.wav'
            gain=min(1.,.34/max(float(np.abs(wav).max()),1e-9))
            protected=np.pad(wav*gain,(round(24000*GUARDS['leadSeconds']),round(24000*GUARDS['tailSeconds'])))
            sf.write(source,protected,24000,subtype='PCM_24')
            processing=cleaner.master_voice(source,processed)
        endpoint=float(20*np.log10(max(float(np.sqrt(np.mean(wav[-480:]**2))),1e-10)))
        save(metadata,dict(id=row['id'],text=row['text'],ttsText=text,signature=sig,raw=raw.relative_to(ROOT).as_posix(),
            processed=processed.relative_to(ROOT).as_posix(),rawDuration=len(wav)/24000,duration=sf.info(processed).duration,
            sha256=sha(processed),rawSHA256=sha(raw),model=MODEL,voiceId=voice_id,settings=SETTINGS,segments=segments,segmentSources=segment_sources,
            rawEndpointDB=endpoint,rawEndpointFlag=endpoint>-42,edgeGuards=GUARDS,processing=processing,
            sourceCandidateId=row.get('sourceCandidateId'),voiceSource='Provider public voice; not personal clone',
            personalReferenceUploaded=False,credentialSource='QWEN_API_KEY_BACKUP',subjectiveListeningChecked=False))
        print('CLOUD_READY',row['id'],round(sf.info(processed).duration,3),'s',round(time.monotonic()-started,2),'elapsed',flush=True)
    print('CLOUD_VOICE_COMPLETE',len(rows),flush=True)

if __name__=='__main__':main()
