"""Replace the speed HUD chapter by exact frame indices, keeping original AAC."""
from pathlib import Path
import argparse,hashlib,json,subprocess
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parents[1]
START,END,COUNT=6339,7088,9368
FFMPEG=Path('C:/ffmpeg/bin/ffmpeg.exe')
FFPROBE=Path('C:/ffmpeg/bin/ffprobe.exe')

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()

def probe(p):
    r=subprocess.run([str(FFPROBE),'-v','error','-show_streams','-of','json',str(p)],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reuse-encoded-video',action='store_true');args=parser.parse_args()
    movie=ROOT/'output/metro/metro_safety_1080p.mp4'
    segment=ROOT/f'output/metro/segment-{START}-{END-1}.mp4'
    tmp=ROOT/'tmp/metro';tmp.mkdir(parents=True,exist_ok=True)
    patched=tmp/'metro-patched.mp4'
    backup=tmp/'metro-before-speed-fix.mp4'
    if backup.exists():raise RuntimeError('Patch already applied or previous patch needs inspection')
    for p,frames in [(movie,COUNT),(segment,END-START)]:
        v=next(s for s in probe(p)['streams'] if s['codec_type']=='video')
        assert int(v['nb_frames'])==frames,(p,v.get('nb_frames'))
        assert (v['width'],v['height'])==(1920,1080)
    initial=sha(movie)
    filters=f'[0:v]split=2[pre][post];[pre]trim=end_frame={START},setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[post]trim=start_frame={END},setpts=PTS-STARTPTS[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]'
    command=[str(FFMPEG),'-hide_banner','-nostdin','-y','-threads','4','-i',str(movie),'-threads','4','-i',str(segment),'-filter_complex_threads','4','-filter_complex',filters,'-map','[v]','-map','0:a:0','-c:v','libx264','-preset','fast','-crf','18','-threads','8','-pix_fmt','yuv420p','-r','30','-frames:v',str(COUNT),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','copy','-movflags','+faststart','-progress','pipe:1','-nostats',str(patched)]
    if not args.reuse_encoded_video:
        with (tmp/'speed-patch-encode.log').open('w',encoding='utf-8') as log:
            subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
    v=next(s for s in probe(patched)['streams'] if s['codec_type']=='video')
    assert int(v['nb_frames'])==COUNT
    # A video frame limit can stop the muxer before it has drained all AAC
    # packets. Remux the verified video and the complete original audio without
    # a frame/time limit, then require bit-identical AAC packet payloads.
    remuxed=tmp/'metro-remuxed.mp4'
    subprocess.run([str(FFMPEG),'-hide_banner','-v','error','-nostdin','-y','-i',str(patched),'-i',str(movie),'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',str(remuxed)],check=True)
    remuxed.replace(patched)
    # Copy demuxed AAC packets and compare before replacing the finished movie.
    packet_hashes=[]
    for p in [movie,patched]:
        r=subprocess.run([str(FFMPEG),'-v','error','-i',str(p),'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-'],capture_output=True,text=True,check=True)
        packet_hashes.append(r.stdout.strip())
    assert packet_hashes[0]==packet_hashes[1],packet_hashes
    movie.replace(backup);patched.replace(movie)
    report={'createdUTC':datetime.now(timezone.utc).isoformat(),'reason':'HUD force multiplier now follows square of displayed relative wind-speed multiplier at intermediate frames, matching the physical relationship. Original scene/motion/audio unchanged.','replacedFramesInclusive':[START,END-1],'originalVideoSHA256':initial,'segmentSHA256':sha(segment),'videoSHA256':sha(movie),'frames':COUNT,'audioPacketsIdentical':True,'audioPacketSHA256':packet_hashes[0],'videoEncoding':'Exact frame trim and concatenation, single final libx264 CRF18 re-encode; original AAC stream copied.','filmSourceSHA256':sha(ROOT/'src/metro/Film.tsx')}
    (ROOT/'research/metro/speed-hud-patch.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
