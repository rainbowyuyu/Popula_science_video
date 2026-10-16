"""Natural-length narration, smooth phrase ducking, measured -16 LUFS master."""
import json,subprocess,re,shutil
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from audio_common import ROOT,OUT,SR,FPS,save,sha,measure

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'));length=narr['durationFrames']*(SR//FPS)
    pub=ROOT/'public/audio';pub.mkdir(parents=True,exist_ok=True)
    voice,sr=sf.read(OUT/'narration.wav',dtype='float32');score,msr=sf.read(pub/'score.wav',dtype='float32')
    assert sr==msr==SR and len(voice)==len(score)==length
    narration_info=measure(OUT/'narration.wav');voice_gain=10**((-18-float(narration_info['input_i']))/20)
    # Entire phrases, not syllables, drive ducking. Anticipation avoids clipping a word onset.
    control_sr=100;cn=int(np.ceil(length/SR*control_sr))+1;gain_db=np.zeros(cn,np.float32)
    for c in narr['cues']:
        a=max(0,int((c['startSec']-.18)*control_sr));b=min(cn,int((c['endSec']+.10)*control_sr))
        gain_db[a:b]=-8.0
    gain_db=gaussian_filter1d(gain_db,12,mode='nearest')
    env=np.interp(np.arange(length,dtype=np.float64)/SR,np.arange(cn)/control_sr,gain_db)
    duck=10**(env/20);score_ducked=score*duck[:,None]
    voice_stereo=np.repeat((voice*voice_gain)[:,None],2,axis=1)
    raw=OUT/'mix-premaster.wav';sf.write(raw,voice_stereo+score_ducked,SR,subtype='PCM_24')
    measured=measure(raw)
    filt=(f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={measured['input_i']}:"
          f"measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:"
          f"measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:"
          'linear=true:print_format=json')
    final=pub/'master.wav'
    r=subprocess.run(['ffmpeg','-y','-hide_banner','-i',str(raw),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(final)],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    x,sr=sf.read(final,dtype='float32');assert len(x)==length,'Master filter changed duration'
    shutil.copy2(OUT/'narration.wav',pub/'narration.wav')
    sf.write(OUT/'score-ducked.wav',score_ducked,SR,subtype='PCM_24')
    loudness=measure(final)
    assert abs(float(loudness['input_i'])+16)<.5,loudness
    assert float(loudness['input_tp'])<=-1.4,loudness
    assert all(c['endSample']<=length for c in narr['cues'])
    caption=json.loads((ROOT/'src/captions-data.json').read_text(encoding='utf8'))['cues']
    assert all(0<=c['startFrame']<c['endFrame']<=narr['durationFrames'] for c in caption)
    assert all(len(c['text'])<=22 for c in caption)
    assert all(a['endFrame']<=b['startFrame'] for a,b in zip(caption,caption[1:])), 'Overlapping captions'
    cue_coverage=[]
    for c in narr['cues']:
        caps=[z for z in caption if z['cueId']==c['id']]
        coverage=sum(max(0,min(z['endFrame'],c['endFrame'])-max(z['startFrame'],c['startFrame'])) for z in caps)/(c['endFrame']-c['startFrame'])
        assert coverage>=.95,(c['id'],coverage)
        cue_coverage.append({'id':c['id'],'coverage':round(coverage,6)})
    def rms_db(data):return float(20*np.log10(max(1e-9,np.sqrt(np.mean(np.asarray(data,dtype=np.float64)**2)))))
    balances=[]
    for c in narr['cues']:
        a,b=c['startSample'],c['endSample'];v=rms_db(voice_stereo[a:b]);m=rms_db(score_ducked[a:b]);balances.append({'id':c['id'],'voiceRmsDbFS':round(v,2),'musicRmsDbFS':round(m,2),'voiceAboveMusicDb':round(v-m,2)})
    music_ducked_loudness=measure(OUT/'score-ducked.wav')
    report={'durationSec':length/SR,'durationFrames':narr['durationFrames'],'sampleRate':SR,'channels':2,'sourceNarrationSha256':sha(OUT/'narration.wav'),'sourceScoreSha256':sha(pub/'score.wav'),'masterSha256':sha(final),'narrationGainDb':round(20*np.log10(voice_gain),3),'musicDuckingDb':8,'duckAttackAnticipationSec':.18,'duckSmoothingSec':.12,'voiceNormalizedTargetLUFS':-18,'voiceSourceLoudness':narration_info,'musicDuckedLoudness':music_ducked_loudness,'voiceMusicBalanceByCue':balances,'minimumVoiceAboveMusicRmsDb':min(c['voiceAboveMusicDb'] for c in balances),'meanVoiceAboveMusicRmsDb':round(sum(c['voiceAboveMusicDb'] for c in balances)/len(balances),2),'masterLoudness':loudness,'samplePeakDbFS':float(20*np.log10(np.max(np.abs(x)))),'truncatedSpeech':False,'timeStretch':False,'captionCount':len(caption),'captionMaxLength':max(map(lambda x:len(x['text']),caption)),'captionCoverage':cue_coverage,'subjectiveListeningChecked':False,'aacTruePeakPending':True}
    save(OUT/'mix-report.json',report);print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
