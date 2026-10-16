"""Sample-accurate raw/clean/timeline/master audit. No listening certification."""
from pathlib import Path
import json,hashlib,subprocess,re
import numpy as np
import soundfile as sf
from scipy.signal import correlate,correlation_lags
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rms(x):return float(np.sqrt(np.mean(x.astype(np.float64)**2)))
def db(x):return 20*np.log10(max(x,1e-12))
def main():
 tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'));story=json.loads((ROOT/'research/story.json').read_text('utf8'))
 results=[];all_ok=len(story['clips'])==len(tl['clips']);reference_sha=sha(Path('D:/python_project/tts/work/clone-reference.wav'))
 for row,c in zip(story['clips'],tl['clips']):
  cid=row['id'];raw_path=ROOT/f'research/audio/raw/{cid}-raw.wav';clean_path=ROOT/f'public/audio/{cid}.wav';raw,sr=sf.read(raw_path,dtype='float64');clean,s2=sf.read(clean_path,dtype='float64');mr=json.loads((ROOT/f'research/audio/takes/{cid}-master.json').read_text('utf8'));take=json.loads((ROOT/f'research/audio/takes/{cid}.json').read_text('utf8'))
  protected=np.pad(raw,(round(.08*sr),round(.16*sr)));expected=round(c['duration']*sr)
  identity_ok=(take['version']=='V06-protected-broadcast' and take['text']==row['spoken'] and take['referenceSHA256']==reference_sha and take['sha256']==sha(clean_path)==c['audioSHA256']==mr['outputSha256'] and take['rawSHA256']==sha(raw_path) and c['id']==cid)
  ok=identity_ok and sr==s2==48000 and len(clean)==len(protected)==expected and c['spoken']==row['spoken'] and np.isfinite(clean).all() and abs(clean).max()<.99 and mr['preservedLengthSamples']
  # Segment-level source synchronization includes explicitly protected lead/tail.
  stride=12;cor=correlate(clean[::stride],protected[::stride],mode='full',method='fft');lags=correlation_lags(len(clean[::stride]),len(protected[::stride]));m=(lags>=-24)&(lags<=24);lag=int(lags[m][np.argmax(cor[m])]*stride)
  core=clean[round(.08*sr):len(clean)-round(.16*sr)];rowr={'id':cid,'passed':bool(ok and abs(lag)<=24),'seconds':len(clean)/sr,'protectedStartSeconds':.08,'protectedEndSeconds':.16,'rawFullLengthPreserved':len(clean)==len(raw)+round(.24*sr),'syncResidualSamples':lag,'filterMeasuredLatencySamples':mr['measuredLatencySamples'],'peakDbFS':db(float(abs(clean).max())),'last160msRmsDbFS':db(rms(clean[-round(.16*sr):])),'lastSpeech100msRmsDbFS':db(rms(core[-round(.1*sr):])),'cleanSHA256':sha(ROOT/f'public/audio/{cid}.wav'),'subjectiveListeningChecked':False}
  rowr['currentTextAudioAndVoiceIdentityPassed']=bool(identity_ok);results.append(rowr);all_ok=all_ok and rowr['passed']
 master=ROOT/'public/audio/master.wav';x,sr=sf.read(master,dtype='float64');n=round(tl['duration']/tl['fps']*sr);all_ok=all_ok and len(x)==n
 cmd=['ffmpeg','-hide_banner','-i',str(master),'-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'];r=subprocess.run(cmd,capture_output=True,text=True,encoding='utf8',errors='replace',check=True);loud=json.loads(re.findall(r'\{\s*"input_i".*?\}',r.stderr,re.S)[-1]);all_ok=all_ok and abs(float(loud['input_i'])+16)<.4 and float(loud['input_tp'])<=-1.35
 # Validate the AAC codec now; the MP4's encoded AAC is checked again by root.
 aac=ROOT/'delivery/V06_audio_QA.m4a';subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','192k',str(aac)],check=True)
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(aac),'-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True);aac_loud=json.loads(re.findall(r'\{\s*"input_i".*?\}',r.stderr,re.S)[-1]);all_ok=all_ok and float(aac_loud['input_tp'])<=-1.5
 captions=tl['captions'];cap_ok=all(len(c['text'])<=22 and c['start']<c['end']<=tl['seconds']+.05 for c in captions) and all(a['end']<=b['start']+.005 for a,b in zip(captions,captions[1:]));all_ok=all_ok and cap_ok
 report={'technicalPassed':bool(all_ok),'humanListeningChecked':False,'clips':results,'masterSeconds':len(x)/sr,'frameDurationSeconds':tl['duration']/tl['fps'],'masterSHA256':sha(master),'masterLoudness':loud,'aacLoudness':aac_loud,'tail5sRmsDbFS':db(rms(x[-5*sr:])),'tailIsIntentionalMusicalCoda':True,'captionsPassed':bool(cap_ok),'captionCount':len(captions),'captionMethod':tl['audio']['captionAlignment']}
 (ROOT/'research/qa/audio-v06.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8');print(json.dumps({k:v for k,v in report.items() if k!='clips'},ensure_ascii=False,indent=2),flush=True)
 if not all_ok:raise SystemExit('Audio technical review requires repair')
if __name__=='__main__':main()
