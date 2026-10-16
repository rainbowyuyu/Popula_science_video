"""Source-preservation, subtitle coverage and duration QA for V6 working audio.

This checks measurable properties only. It never turns ASR agreement into a
claim that voice timbre, stress, tone or music taste has been listened to.
"""
import json, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import correlate, correlation_lags
from audio_v6_common import ROOT, OUT, SR, FPS, sha, save


def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    captions=json.loads((OUT/'captions.json').read_text(encoding='utf8'))
    ledger=json.loads((OUT/'voice-generation-v6.json').read_text(encoding='utf8'))
    voice,sr=sf.read(OUT/'narration.wav',dtype='float32',always_2d=True)
    expected=round(narr['durationFrames']/FPS*SR)
    errors=[];rows=[];captionErrors=[];protectedSamples=0
    if sr!=SR or len(voice)!=expected or voice.shape[1]!=2:errors.append('narration sample format/count')
    if not np.isfinite(voice).all():errors.append('nonfinite narration samples')
    if not np.array_equal(voice[:,0],voice[:,1]):errors.append('unexpected source stereo change')
    for i,cap in enumerate(captions):
        if not 0<=cap['startFrame']<cap['endFrame']<=narr['durationFrames']:
            captionErrors.append({'id':cap['id'],'problem':'frame bounds'})
        if len(cap['text'])>23:captionErrors.append({'id':cap['id'],'problem':'over 23 characters'})
        if i and cap['startFrame']<captions[i-1]['endFrame']:
            captionErrors.append({'id':cap['id'],'problem':'overlapping captions'})
    if captionErrors:errors.append('caption contract')
    for cue in narr['cues']:
        path=ROOT/cue['workingAudioFile'];x,cs=sf.read(path,dtype='float32')
        a=round(cue['startSec']*SR);b=a+len(x);protectedSamples+=len(x)
        diff=float(np.max(np.abs(voice[a:b,0]-x)))
        source=ROOT/ledger[cue['id']]['file']
        sourceInfo=sf.info(source)
        if sha(source)!=ledger[cue['id']]['sha256']:errors.append(cue['id']+': raw hash changed')
        if ledger[cue['id']]['text']!=cue['spokenText']:errors.append(cue['id']+': source text mismatch')
        if ledger[cue['id']]['actualProvider']!='local-user-tts-project':errors.append(cue['id']+': nonlocal source')
        if cs!=SR or abs(len(x)/SR-(sourceInfo.duration+.24))>1/SR:
            errors.append(cue['id']+': altered clip length/format')
        if diff>1/(2**23):errors.append(cue['id']+': source not completely preserved in narration')
        mask=np.zeros(len(x),dtype=bool)
        for cap in captions:
            if cap['cueId']==cue['id']:
                ca=max(0,round(cap['startFrame']/FPS*SR)-a)
                cb=min(len(x),round(cap['endFrame']/FPS*SR)-a)
                if cb>ca:mask[ca:cb]=True
        block=480;length=len(x)//block*block
        energy=np.sqrt(np.mean(x[:length].reshape(-1,block)**2,axis=1))
        active=np.repeat(energy>max(.002,float(energy.max())*.07),block)
        activeSamples=int(active.sum());covered=int(np.sum(active&mask[:length]))
        coverage=covered/max(1,activeSamples)
        if coverage<.95:errors.append(cue['id']+': subtitle speech-energy coverage below 95%')
        proc=json.loads((OUT/'processing'/f"{cue['id']}.json").read_text(encoding='utf8'))
        rows.append({'id':cue['id'],'rawSec':sourceInfo.duration,'completeProtectedSec':len(x)/SR,
            'maxCleanToNarrationAbsDifference':diff,'sourceSampleStart':a,'sourceSampleEndExclusive':b,
            'activeSpeechSamples':activeSamples,'coveredSpeechSamples':covered,
            'subtitleSpeechEnergyCoveragePercent':round(coverage*100,4),
            'rawEdges':proc.get('originalRawEdges',{}),'subjectiveListeningChecked':False})
    gaps=[round(b['startSec']-a['endSec'],6) for a,b in zip(narr['cues'],narr['cues'][1:])]
    if any(not .199999<=v<=.500001 for v in gaps):errors.append('unbounded clip gap')
    if any(a['endFrame']!=b['startFrame'] for a,b in zip(narr['groups'],narr['groups'][1:])):
        errors.append('chapter frames not contiguous')
    master=sf.info(OUT/'master.wav')
    if master.frames!=expected or master.samplerate!=SR or master.channels!=2:errors.append('master format/count mismatch')
    # Matching length alone cannot detect filter buffering or a shifted voice.
    # Voice dominates the mix; compare several separated excerpts at 4x stride.
    mixed,_=sf.read(OUT/'master.wav',dtype='float32',always_2d=True)
    delays=[]
    for cue in (narr['cues'][0],narr['cues'][len(narr['cues'])//2],narr['cues'][-1]):
        begin=round(cue['startSec']*SR);end=min(len(voice),begin+4*SR)
        source=voice[begin:end:4,0];destination=mixed[begin:end:4].mean(axis=1)
        corr=correlate(destination,source,method='fft',mode='full')
        lag=correlation_lags(len(destination),len(source),mode='full')
        valid=np.abs(lag)<=SR*.1/4
        samples=int(lag[valid][np.argmax(corr[valid])]*4)
        delays.append({'cueId':cue['id'],'delaySamplesAt48k':samples,'delayMs':samples/SR*1000})
        if abs(samples)>SR/FPS:errors.append(cue['id']+': mix voice alignment changed by over one frame')
    probe=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(OUT/'master-preview.m4a')],
        check=True,capture_output=True,text=True,encoding='utf8')
    aac=json.loads(probe.stdout);audio=next(x for x in aac['streams'] if x['codec_type']=='audio')
    if int(audio['sample_rate'])!=SR or audio['channels']!=2:errors.append('AAC sample rate/channel mismatch')
    if abs(float(audio['duration'])-expected/SR)>1/FPS:errors.append('AAC/narration duration differs by more than one frame')
    mix=json.loads((OUT/'audio-mix-v6.json').read_text(encoding='utf8'))
    for row in mix['inputs']+mix['files']:
        if sha(ROOT/row['path'])!=row['sha256']:errors.append('mix manifest SHA mismatch: '+row['path'])
    if not -17<=float(mix['wav']['input_i'])<=-14:errors.append('master loudness')
    if float(mix['aac']['input_tp'])>-1:errors.append('AAC true peak')
    if any('silence_start' in line for line in mix['silenceDetect']):
        # Do not fail on intended final music decay; report its position for review.
        silenceReview=mix['silenceDetect']
    else:silenceReview=[]
    edgeReview=[r['id'] for r in rows if r['rawEdges'].get('end20msRmsDb',-120)>-35]
    report={'status':'pass' if not errors else 'fail','errors':errors,
        'durationSec':expected/SR,'durationFrames':narr['durationFrames'],'samples':expected,
        'cueCount':len(rows),'captionCount':len(captions),'maxCaptionCharacters':max(len(c['text']) for c in captions),
        'captionErrors':captionErrors,'clipGapMinSec':min(gaps),'clipGapMaxSec':max(gaps),
        'allProtectedSourcesFullyInserted':all(r['maxCleanToNarrationAbsDifference']<=1/(2**23) for r in rows),
        'meanSubtitleEnergyCoveragePercent':sum(r['subtitleSpeechEnergyCoveragePercent'] for r in rows)/len(rows),
        'minSubtitleEnergyCoveragePercent':min(r['subtitleSpeechEnergyCoveragePercent'] for r in rows),
        'weightedSubtitleEnergyCoveragePercent':100*sum(r['coveredSpeechSamples'] for r in rows)/sum(r['activeSpeechSamples'] for r in rows),
        'rawEndingEnergyReview':edgeReview,'rawEndingEnergyInterpretation':'High final energy is a review flag, not proof of a truncated word.',
        'longMasterSilenceReview':silenceReview,'wavLUFS':float(mix['wav']['input_i']),
        'measuredMixVoiceDelays':delays,
        'wavTruePeakDbTP':float(mix['wav']['input_tp']),'aacLUFS':float(mix['aac']['input_i']),
        'aacTruePeakDbTP':float(mix['aac']['input_tp']),'aacDurationSec':float(audio['duration']),
        'subjectiveListeningChecked':False,'rows':rows,
        'inputs':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in
            (OUT/'narration.json',OUT/'captions.json',OUT/'voice-generation-v6.json',OUT/'narration.wav',OUT/'master.wav',OUT/'master-preview.m4a')]}
    save(OUT/'qa-audio-v6.json',report)
    print(json.dumps({k:v for k,v in report.items() if k not in ('rows','inputs')},ensure_ascii=False,indent=2))
    if errors:raise RuntimeError('V6 measurable audio QA did not pass')


if __name__=='__main__':main()
