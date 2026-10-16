"""Lightweight, sampled review of a completed V19Repair encode.

This tool never changes the source video, audited inputs, render records, or
master audio. All extraction is written to a new run under persistent C: QA.
Numerical results are deliberately distinct from human/agent visual listening.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

PROJECT=Path(__file__).resolve().parents[1]
FISH_FRAMES=[449,450,810,940,1018,1110,4990,5018,5075,5140,5618,
             6499,7087,7247,7441,7565,7710,8081,8580,8650,8677,8730,
             8900,8911,8975,9050,10020,10402,10551,10552]
BRIDGE_NEIGHBOURS=[298,299,300,301,448,449,450,451,10400,10401,10402,10403,10550,10551,10552,10553]
REVIEW_FRAMES=sorted(set(FISH_FRAMES+BRIDGE_NEIGHBOURS))


def digest(file:Path)->str:
    h=hashlib.sha256()
    with file.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()


def invoke(argv:list[str],label:str,*,binary=False):
    result=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if result.returncode:
        raise RuntimeError(f'{label} failed ({result.returncode}): '+result.stderr.decode('utf-8','replace')[-5000:])
    return result.stdout if binary else result.stdout.decode('utf-8','replace')


def probe(file:Path,ffprobe:str)->dict:
    return json.loads(invoke([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(file)],'ffprobe'))


def rate(text:str)->float:
    if '/' in text:
        a,b=text.split('/');return float(a)/float(b)
    return float(text)


def decode_audio(file:Path,ffmpeg:str,sample_rate:int)->np.ndarray:
    # first_pts=0 preserves leading silence when an MP4's audio stream begins
    # later than video time zero. AAC skip-sample/priming metadata is respected
    # by FFmpeg's decoder instead of treating raw packet PTS as audible onset.
    raw=invoke([ffmpeg,'-hide_banner','-loglevel','error','-threads','2','-i',str(file),
        '-map','0:a:0','-vn','-ac','1','-af',f'aresample={sample_rate}:async=1:first_pts=0',
        '-ar',str(sample_rate),'-f','f32le','pipe:1'],f'decode audio {file.name}',binary=True)
    return np.frombuffer(raw,dtype='<f4').astype(np.float64)


def correlation_window(reference:np.ndarray,encoded:np.ndarray,start:int,length:int,radius:int,sr:int)->dict:
    needle=encoded[start:start+length]
    search=reference[start-radius:start+length+radius]
    if len(needle)!=length or len(search)!=length+2*radius:
        raise ValueError('Audio correlation window outside decoded audio duration')
    y=needle-needle.mean();energy=float(np.dot(y,y))
    if energy<1e-9:return {'startSeconds':start/sr,'status':'insufficient_audio_energy','passed':False}
    # Exact normalized cross-correlation for every possible sample offset,
    # computed with FFT convolution and cumulative window energy in O(NlogN).
    fft_size=1<<(len(search)+len(y)-2).bit_length()
    convolution=np.fft.irfft(np.fft.rfft(search,fft_size)*np.fft.rfft(y[::-1],fft_size),fft_size)
    dots=convolution[length-1:length+2*radius]
    sums=np.r_[0.,np.cumsum(search)];squares=np.r_[0.,np.cumsum(search*search)]
    window_sum=sums[length:]-sums[:-length]
    variance=(squares[length:]-squares[:-length])-window_sum*window_sum/length
    normalized=dots/np.sqrt(np.maximum(variance,1e-16)*energy)
    k=int(np.argmax(normalized));score=float(normalized[k])
    # Positive lag means the encoded narration is heard later than the master.
    lag_ms=(radius-k)*1000/sr
    gain=float(dots[k]/max(variance[k],1e-16))
    passed=abs(lag_ms)<=50 and score>=.85
    return {'startSeconds':start/sr,'windowSeconds':length/sr,'searchRadiusSeconds':radius/sr,
            'status':'measured','bestCorrelation':score,'encodedLagMilliseconds':lag_ms,
            'estimatedLinearGain':gain,'encodedRMS':float(np.sqrt(np.mean(needle*needle))),
            'passed':bool(passed),'criteria':{'maximumAbsoluteLagMilliseconds':50,'minimumCorrelation':.85}}


def make_contact_sheets(frames_dir:Path,records:list[dict],out:Path)->list[Path]:
    candidates=[Path('C:/Windows/Fonts/arial.ttf'),Path('C:/Windows/Fonts/msyh.ttc')]
    fontpath=next((p for p in candidates if p.exists()),None)
    font=ImageFont.truetype(str(fontpath),21) if fontpath else ImageFont.load_default()
    sheets=[]
    for batch_start in range(0,len(records),9):
        batch=records[batch_start:batch_start+9]
        sheet=Image.new('RGB',(1920,1176),'#14282b');draw=ImageDraw.Draw(sheet)
        for k,row in enumerate(batch):
            x=(k%3)*640;y=(k//3)*392
            with Image.open(frames_dir/row['file']) as image:
                assert image.size==(640,360),image.size
                sheet.paste(image.convert('RGB'),(x,y))
            draw.text((x+12,y+363),f"Frame {row['frame']:05d}  |  {row['seconds']:.3f}s",font=font,fill='#eef5ed')
        file=out/f'contact-{batch_start//9+1:02d}.jpg';sheet.save(file,quality=93,subsampling=0);sheets.append(file)
    return sheets


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video',type=Path,help='Existing completed final MP4; never a render-in-progress file.')
    parser.add_argument('--master',type=Path,default=PROJECT/'public/audio_v18/master-v18.wav')
    parser.add_argument('--qa-root',type=Path,default=Path('C:/Users/zju/.codex/outputs/rainbow-v19-repair/encoded-qa'))
    parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
    parser.add_argument('--ffprobe',default=shutil.which('ffprobe'))
    args=parser.parse_args()
    if not args.video.is_file():parser.error(f'Final MP4 does not exist: {args.video}')
    if not args.master.is_file():parser.error(f'Master audio does not exist: {args.master}')
    if not args.ffmpeg or not args.ffprobe:parser.error('ffmpeg and ffprobe must be installed or explicitly supplied')
    # New directories only: no deletion or overwriting prior QA runs.
    run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    out=args.qa_root.resolve()/run_id;out.mkdir(parents=True,exist_ok=False)
    frames_dir=out/'frames';frames_dir.mkdir();clips_dir=out/'clips';clips_dir.mkdir()
    print(f'QA output: {out}',flush=True)
    source_info=probe(args.video,args.ffprobe);video=next(s for s in source_info['streams'] if s['codec_type']=='video')
    audio=next((s for s in source_info['streams'] if s['codec_type']=='audio'),None)
    fps=rate(video.get('avg_frame_rate','30/1'))
    if abs(fps-30)>1e-5:raise ValueError(f'Expected final 30 fps film, received {fps}')
    duration=float(source_info['format']['duration'])
    count=int(video.get('nb_frames',round(duration*fps)))
    if max(REVIEW_FRAMES)>=count:raise ValueError(f'Review frames exceed completed film: {count} frames')
    stat_before=args.video.stat();video_sha=digest(args.video)
    report={'version':'V19Repair','runId':run_id,'status':'in_progress','source':str(args.video.resolve()),
            'sourceSHA256':video_sha,'sourceProbe':source_info,'master':str(args.master.resolve()),'masterSHA256':digest(args.master),
            'scope':'Numerical and sampled review only. No full-video viewing or listening is claimed.',
            'frameSelection':{'fishAuditFrames':FISH_FRAMES,'bridgeNeighbourFrames':BRIDGE_NEIGHBOURS,'uniqueFrames':REVIEW_FRAMES},
            'outputDirectory':str(out),'visualReview':{'status':'not_yet_reviewed','notes':'Contact sheets and native-speed preview clips are prepared for inspection.'},
            'audioListening':{'status':'not_performed','notes':'Audio analysis is numerical cross-correlation, not listening.'}}
    report_file=out/'review.json'
    def save():report_file.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    save()
    try:
        expression='+'.join(f'eq(n\\,{frame})' for frame in REVIEW_FRAMES)
        vf=f'select={expression},scale=640:360:flags=lanczos'
        # One decode pass extracts all sampled frames. Consecutive output
        # numbers map explicitly to the requested original frame numbers.
        invoke([args.ffmpeg,'-hide_banner','-loglevel','error','-threads','2','-i',str(args.video),
            '-map','0:v:0','-vf',vf,'-fps_mode','vfr','-frames:v',str(len(REVIEW_FRAMES)),
            '-an','-q:v','3',str(frames_dir/'sample-%03d.jpg')],'one-pass sampled frame extraction')
        extracted=sorted(frames_dir.glob('sample-*.jpg'))
        if len(extracted)!=len(REVIEW_FRAMES):raise ValueError(f'Expected {len(REVIEW_FRAMES)} sampled frames, got {len(extracted)}')
        records=[{'frame':frame,'seconds':frame/fps,'file':file.name,'sha256':digest(file)} for frame,file in zip(REVIEW_FRAMES,extracted)]
        report['sampledFrames']=records
        sheets=make_contact_sheets(frames_dir,records,out)
        report['contactSheets']=[str(p) for p in sheets]
        print(f'Extracted {len(records)} source frames in one pass; {len(sheets)} contact sheets.',flush=True)
        report['clips']=[]
        for name,start,end in [('entry-bridge',240,509),('water',10020,10110),('ending-bridge',10400,10580)]:
            file=clips_dir/f'{name}-{start}-{end}.mp4';n=end-start+1
            command=[args.ffmpeg,'-hide_banner','-loglevel','error','-threads','2','-ss',f'{start/fps:.9f}',
                '-i',str(args.video),'-t',f'{n/fps:.9f}','-frames:v',str(n),'-map','0:v:0','-map','0:a:0?',
                '-vf','scale=960:540:flags=lanczos','-c:v','libx264','-preset','veryfast','-crf','21',
                '-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',str(file)]
            invoke(command,f'native-speed preview {name}')
            info=probe(file,args.ffprobe);vs=next(s for s in info['streams'] if s['codec_type']=='video')
            report['clips'].append({'name':name,'file':str(file),'sourceFrameRangeInclusive':[start,end],
                'sourceStartSeconds':start/fps,'expectedFrames':n,'encodedFrames':int(vs.get('nb_frames',0)),
                'fps':rate(vs['avg_frame_rate']),'audioPresent':any(s['codec_type']=='audio' for s in info['streams']),
                'speed':1.0,'processing':'Spatial resize and preview re-encode only; no time stretching, frame interpolation, or source modification.',
                'sha256':digest(file)})
            print(f'Prepared native-speed {name}: {n} frames.',flush=True)
        if audio:
            sr=16000;reference=decode_audio(args.master,args.ffmpeg,sr);encoded=decode_audio(args.video,args.ffmpeg,sr)
            available=min(len(reference),len(encoded));window=8*sr;radius=int(.75*sr)
            if available<3*(window+radius):raise ValueError('Final audio too short for beginning/middle/tail correlation')
            positions=[max(2*sr,radius),available//2-window//2,available-window-radius-int(.25*sr)]
            labels=['beginning','middle','tail'];measurements=[]
            for label,start in zip(labels,positions):
                result=correlation_window(reference,encoded,start,window,radius,sr);result['section']=label;measurements.append(result)
            report['audioCorrelation']={'status':'measured','sampleRate':sr,'channels':'mono downmix','referenceDecodedSamples':len(reference),
                'encodedDecodedSamples':len(encoded),'referenceDecodedSeconds':len(reference)/sr,'encodedDecodedSeconds':len(encoded)/sr,
                'lagSign':'Positive means final AAC narration is later than master audio.',
                'method':'Decoded playback-timeline PCM (AAC priming and leading timestamps respected), FFT normalized cross-correlation; 8-second beginning/middle/tail windows, +/-750 ms search.',
                'windows':measurements,'allWindowsWithinTolerance':all(r['passed'] for r in measurements)}
            print('Audio lag ms: '+', '.join(f"{r['section']}={r.get('encodedLagMilliseconds','unknown')} (r={r.get('bestCorrelation',0):.5f})" for r in measurements),flush=True)
        else:
            report['audioCorrelation']={'status':'missing_encoded_audio','allWindowsWithinTolerance':False}
        stat_after=args.video.stat()
        if stat_before.st_size!=stat_after.st_size or stat_before.st_mtime_ns!=stat_after.st_mtime_ns:
            raise ValueError('Source video changed during review; results must not be accepted as final.')
        report['clipFrameCountsMatch']=all(r['expectedFrames']==r['encodedFrames'] for r in report['clips'])
        report['status']='completed_numerical_and_sampled_only';report['completedUTC']=datetime.now(timezone.utc).isoformat()
        save()
        print(json.dumps({'report':str(report_file),'status':report['status'],'clipFrameCountsMatch':report['clipFrameCountsMatch'],
            'audioCorrelationWithinTolerance':report['audioCorrelation']['allWindowsWithinTolerance']},ensure_ascii=False,indent=2),flush=True)
        return 0 if report['clipFrameCountsMatch'] and report['audioCorrelation']['allWindowsWithinTolerance'] else 2
    except Exception as error:
        report['status']='failed';report['error']=str(error);save();raise


if __name__=='__main__':sys.exit(main())
