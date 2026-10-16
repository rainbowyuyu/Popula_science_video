"""Loudness-matched source/clean excerpts for honest optional auditory review."""
import argparse,json,subprocess
from pathlib import Path
from audio_common import OUT,ROOT,SR,sha,save,measure

def main():
    p=argparse.ArgumentParser();p.add_argument('--ids',default='s01,s12,s19,s28');a=p.parse_args()
    dest=OUT/'ab-previews';dest.mkdir(parents=True,exist_ok=True);items=[]
    for cueid in a.ids.split(','):
        for kind in ('raw','clean'):
            source=OUT/kind/f'{cueid}.wav'
            if not source.exists():continue
            stats=measure(source);target=-20;gain=target-float(stats['input_i'])
            path=dest/f'{cueid}-{kind}.wav'
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-af',f'volume={gain}dB',
                            '-ar',str(SR),'-ac','1','-c:a','pcm_s24le',str(path)],check=True)
            items.append({'id':cueid,'kind':kind,'source':source.relative_to(ROOT).as_posix(),'sourceSha256':sha(source),
                'output':path.relative_to(ROOT).as_posix(),'outputSha256':sha(path),'gainDb':gain,'targetLUFS':target,
                'sourceMeasuredLUFS':float(stats['input_i']),'subjectiveListeningChecked':False})
    save(dest/'manifest.json',{'purpose':'Optional equal-loudness A/B; not an auditory approval','subjectiveListeningChecked':False,'files':items})
    print('A/B previews:',len(items))

if __name__=='__main__':main()
