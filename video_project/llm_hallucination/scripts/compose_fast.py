"""Compose Remotion-rendered overlays and Manim clips using FFmpeg/NVENC."""
from pathlib import Path
import json,subprocess,wave
ROOT=Path(__file__).resolve().parents[1]
t=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf-8'))
OUT=ROOT/'output'; FPS=t['fps']; RATE=48000

def stamp(ms):
    cs=round(ms/10)
    return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'

def make_ass(c):
    header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,35,&H00FDF5F1,&H00FDF5F1,&H0020120B,&H0020120B,0,0,0,0,100,100,0,0,1,1.2,0,2,100,100,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    start=c['start']/FPS*1000; end=(c['start']+c['frames'])/FPS*1000
    for a in t['captions']:
        if start<=a['startMs']<end:
            text=a['text'].replace('{','').replace('}','').replace('\n',r'\N')
            header+=f'Dialogue: 0,{stamp(a["startMs"]-start)},{stamp(a["endMs"]-start)},Default,,0,0,0,,{text}\n'
    p=OUT/f'captions_{c["id"]:02d}.ass';p.write_text(header,encoding='utf-8');return p

def make_audio():
    cursor=0
    with wave.open(str(OUT/'narration.wav'),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(RATE)
        for c in t['chapters']:
            for s in c['segments']:
                target=(c['start']+s['from'])*RATE//FPS
                assert target>=cursor
                wav.writeframesraw(bytes((target-cursor)*2));cursor=target
                pcm=subprocess.check_output(['ffmpeg','-hide_banner','-loglevel','error','-i',str(ROOT/'public'/s['file']),'-f','s16le','-ac','1','-ar',str(RATE),'-'])
                wav.writeframesraw(pcm);cursor+=len(pcm)//2
        target=t['frames']*RATE//FPS
        assert target>=cursor
        wav.writeframesraw(bytes((target-cursor)*2))
    print('Audio assembled at exact frame offsets',flush=True)

def main():
    make_audio();files=[]
    for c in t['chapters']:
        i=c['id'];make_ass(c);dest=OUT/f'composed_{i:02d}.mp4';files.append(dest)
        duration=c['frames']/FPS
        if dest.exists():
            try:
                dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(dest)],text=True))
                if abs(dur-duration)<.04:print('SKIP chapter',i,flush=True);continue
            except subprocess.CalledProcessError:pass
        filt=(f'[0:v]tpad=stop_mode=clone:stop_duration=0.1,pad=1920:1080:160:137:color=0x0B1220[base];'
              f'[1:v]format=rgba,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st={duration-.4}:d=0.4:alpha=1[head];'
              f'[base][head]overlay=0:0:format=auto,subtitles=filename=output/captions_{i:02d}.ass[sub];'
              f'color=c=0x56DDD3:s=1920x4:r=30[bar];'
              f'[sub][bar]overlay=x=\'-1920+1920*(t+{c["start"]/FPS})/{t["frames"]/FPS}\':y=1076:shortest=1,format=yuv420p[v]')
        cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-threads','2','-i',str(ROOT/'public'/c['clip']),'-loop','1','-framerate','30','-i',str(ROOT/f'public/headers/{i:02d}.png'),'-filter_complex_threads','2','-filter_complex',filt,'-map','[v]','-an','-frames:v',str(c['frames']),'-r','30','-c:v','h264_nvenc','-preset','p4','-cq','20','-b:v','0','-g','60','-video_track_timescale','90000',str(dest)]
        with (OUT/f'compose_{i:02d}.log').open('w',encoding='utf-8') as log:
            r=subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        if r.returncode:raise RuntimeError((OUT/f'compose_{i:02d}.log').read_text(encoding='utf-8'))
        print(f'Composed chapter {i+1}/18: {duration:.1f}s',flush=True)
    (OUT/'concat.txt').write_text('\n'.join(f"file '{p.name}'" for p in files),encoding='utf-8')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','concat','-safe','0','-i',str(OUT/'concat.txt'),'-i',str(OUT/'narration.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',str(OUT/'master.mp4')],check=True)
    print('Master assembled',flush=True)

if __name__=='__main__':main()
