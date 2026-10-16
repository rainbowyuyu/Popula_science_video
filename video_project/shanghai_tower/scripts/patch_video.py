"""Replace exact frame intervals, retaining the original full master audio.

Patch ranges are inclusive. Original video is only replaced after the new file
has passed stream metadata checks; final full decode/visual QA follows separately.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, hashlib, subprocess, shutil

ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads(p.read_text('utf-8-sig'))
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def validate_marker(marker,video,total):
    if marker.get('success') is not True:raise ValueError('Final render marker is not successful')
    if not marker.get('outputLocation') or (ROOT/marker['outputLocation']).resolve()!=video:raise ValueError('Final render marker outputLocation does not match --video')
    if marker.get('frames')!=[0,total-1]:raise ValueError('Final render marker frame range does not match timeline')
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video',required=True,help='Finished target MP4 to patch in place')
    parser.add_argument('--patch-report','--renders',dest='patch_report',required=True,help='Complete patch render report')
    parser.add_argument('--report',help='New merge report; defaults to a name scoped to the selected video')
    parser.add_argument('--marker',default='tmp/final-render.json')
    parser.add_argument('--temp-output',help='New staging MP4; never the target video')
    parser.add_argument('--log',help='New FFmpeg log; defaults to the merge report with .log suffix')
    args_cli=parser.parse_args()
    video=(ROOT/args_cli.video).resolve()
    report_path=(ROOT/(args_cli.report or f'research/qa/patch-merge-{video.stem}.json')).resolve()
    dest=(ROOT/(args_cli.temp_output or f'tmp/{video.stem}.patched.pending.mp4')).resolve()
    log=(ROOT/args_cli.log).resolve() if args_cli.log else report_path.with_suffix('.log')
    marker_path=(ROOT/args_cli.marker).resolve()
    renders_path=(ROOT/args_cli.patch_report).resolve()
    outputs={dest,log,report_path}
    if len(outputs)!=3 or outputs&{video,marker_path,renders_path,(ROOT/'public/master.wav').resolve()}:raise ValueError('Output paths must be distinct from each other and inputs')
    for p in outputs:
        if p.exists():raise FileExistsError('Refusing to overwrite existing QA or staging output: '+str(p))
    renders=load(renders_path)
    if not renders['complete']:raise RuntimeError('Patches are not complete')
    timeline=load(ROOT/'src/timeline.json');total=timeline['duration'];fps=timeline['fps']
    marker_bytes=marker_path.read_bytes();marker=json.loads(marker_bytes.decode('utf-8-sig'))
    validate_marker(marker,video,total)
    if not renders.get('video') or (ROOT/renders['video']).resolve()!=video:raise ValueError('Patch report video does not match --video')
    if renders.get('timelineFrames')!=total or renders.get('fps')!=fps:raise ValueError('Patch report timeline mismatch')
    patches=sorted(renders['patches'],key=lambda p:p['start'])
    if not patches:raise ValueError('Patch report is empty')
    ffmpeg=shutil.which('ffmpeg');ffprobe=shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:raise RuntimeError('FFmpeg is required')
    def probe(p):return json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(p)]))
    def check(p,expected):
        streams=probe(p)['streams'];v=next(s for s in streams if s['codec_type']=='video')
        if (v['width'],v['height'],v['avg_frame_rate'],int(v['nb_frames']))!=(1920,1080,'30/1',expected):raise ValueError('Unexpected video metadata: '+str(p))
        return streams
    source_stat=video.stat();check(video,total)
    master=ROOT/'public/master.wav';master_probe=probe(master)
    master_audio=next(s for s in master_probe['streams'] if s['codec_type']=='audio')
    if not master_audio['codec_name'].startswith('pcm_'):raise ValueError('Master audio must be PCM')
    if abs(float(master_audio.get('duration',master_probe['format']['duration']))-total/fps)>1/fps:raise ValueError('Full master audio duration does not match timeline')
    pieces=[];previous=0
    for i,p in enumerate(patches,1):
        start,end=p['start'],p['end']
        if type(start) is not int or type(end) is not int or start<previous or end<start or end>=total:raise ValueError('Overlapping or invalid patch range')
        check(ROOT/p['file'],end-start+1)
        if start>previous:pieces.append(dict(input=0,start=previous,end=start))
        pieces.append(dict(input=i,start=0,end=end-start+1))
        previous=end+1
    if previous<total:pieces.append(dict(input=0,start=previous,end=total))
    originals=[i for i,p in enumerate(pieces) if p['input']==0]
    filters=[]
    if len(originals)>1:filters.append('[0:v]split='+str(len(originals))+''.join(f'[o{i}]' for i in originals))
    for i,p in enumerate(pieces):
        label=f'o{i}' if p['input']==0 and len(originals)>1 else f"{p['input']}:v"
        filters.append(f"[{label}]trim=start_frame={p['start']}:end_frame={p['end']},setpts=PTS-STARTPTS[v{i}]")
    filters.append(''.join(f'[v{i}]' for i in range(len(pieces)))+f'concat=n={len(pieces)}:v=1:a=0[outv]')
    args=[ffmpeg,'-n','-hide_banner','-nostdin','-i',str(video)]
    for p in patches:args+=['-i',str(ROOT/p['file'])]
    args+=['-i',str(ROOT/'public/master.wav'),'-filter_complex',';'.join(filters),'-map','[outv]','-map',f'{len(patches)+1}:a:0',
           '-c:v','libx264','-preset','fast','-crf','17','-threads','6','-pix_fmt','yuv420p','-r',str(fps),'-fps_mode','cfr',
           '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','320k','-ar','48000','-ac','2',
           '-t',str(total/fps),'-frames:v',str(total),'-movflags','+faststart','-metadata','title=上海中心 · 拆解与搭建',
           '-progress','pipe:1','-nostats',str(dest)]
    before=sha(video);master_sha=sha(master)
    for p in outputs:p.parent.mkdir(parents=True,exist_ok=True)
    print('PATCH_MERGE_STARTED',flush=True)
    with log.open('x',encoding='utf8') as f:
        result=subprocess.run(args,stdout=f,stderr=subprocess.STDOUT)
    if result.returncode:raise RuntimeError('Merge failed; see '+str(log))
    streams=check(dest,total);audio=next(s for s in streams if s['codec_type']=='audio')
    if abs(float(audio['duration'])-total/fps)>.15:raise ValueError('Audio duration mismatch')
    after=sha(dest);current_stat=video.stat()
    if (source_stat.st_size,source_stat.st_mtime_ns)!=(current_stat.st_size,current_stat.st_mtime_ns) or sha(video)!=before:raise RuntimeError('Target video changed during merge; staging output was not committed')
    if marker_path.read_bytes()!=marker_bytes or sha(master)!=master_sha:raise RuntimeError('Render marker or master audio changed during merge; staging output was not committed')
    validate_marker(load(marker_path),video,total)
    dest.replace(video)
    marker['patchedAt']=datetime.now(timezone.utc).isoformat();marker['videoSHA256']=after
    marker['patches']=[*marker.get('patches',[]),*({'start':p['start'],'end':p['end'],'reason':p['reason']} for p in patches)]
    marker_path.write_text(json.dumps(marker,ensure_ascii=False,indent=2),'utf8')
    report=dict(success=True,video=str(video),patchRenderReport=str(renders_path),originalVideoSHA256=before,finalVideoSHA256=after,masterAudioSHA256=master_sha,
                patches=patches,pieces=pieces,frames=total,fps=fps,command=args,
                note='Exact frame trims, high-quality H.264 re-encode; complete original PCM master encoded to AAC once. Full final QA is separate.')
    with report_path.open('x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps(dict(success=True,frames=total,videoSHA256=after)),flush=True)
if __name__=='__main__':main()
