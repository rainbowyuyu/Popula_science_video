"""Normalize voice, add MP4 chapter markers, validate the deliverable."""
from pathlib import Path
import json,subprocess
ROOT=Path(__file__).resolve().parents[1]
t=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf-8'))
out=ROOT/'output'
def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-show_chapters','-of','json',str(path)],text=True,encoding='utf-8'))
def esc(s):return s.replace('\\','\\\\').replace('=','\\=').replace(';','\\;').replace('#','\\#').replace('\n',' ')
meta=[';FFMETADATA1','title=从概率密度演化到大模型幻觉的首次越界','artist=Manim + Remotion','comment=中文合成旁白；教学仿真，不是 LLM 实测结果']
for c in t['chapters']:
    meta.extend(['[CHAPTER]','TIMEBASE=1/1000',f'START={round(c["start"]*1000/t["fps"])}',f'END={round((c["start"]+c["frames"])*1000/t["fps"])}','title='+esc(c['title'])])
(out/'chapters.ffmeta').write_text('\n'.join(meta)+'\n',encoding='utf-8')
dest=out/'大模型幻觉_概率密度演化与首次越界.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','warning','-y','-i',str(out/'master.mp4'),'-i',str(out/'chapters.ffmeta'),'-map','0:v:0','-map','0:a:0','-map_metadata','1','-map_chapters','1','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart',str(dest)],check=True)
p=probe(dest); video=next(s for s in p['streams'] if s['codec_type']=='video'); audio=next(s for s in p['streams'] if s['codec_type']=='audio')
assert (video['width'],video['height'])==(1920,1080)
assert video['r_frame_rate']=='30/1'
assert abs(float(video['duration'])-t['frames']/t['fps'])<.15
assert abs(float(audio['duration'])-float(video['duration']))<.2
assert len(p['chapters'])==18
clip_errors=[]
for c in t['chapters']:
    cp=probe(ROOT/'public'/c['clip']); duration=float(cp['format']['duration']);err=abs(duration-c['frames']/t['fps'])
    assert err<.12,(c['id'],err)
    clip_errors.append(err)
assert all(0<=c['startMs']<c['endMs']<=t['frames']/t['fps']*1000 for c in t['captions'])
assert all(t['captions'][i]['endMs']<=t['captions'][i+1]['startMs'] for i in range(len(t['captions'])-1))
report={'output':str(dest),'duration_seconds':float(video['duration']),'video_codec':video['codec_name'],'audio_codec':audio['codec_name'],'resolution':[1920,1080],'fps':30,'chapters':len(p['chapters']),'caption_segments':len(t['captions']),'max_manim_timing_error_seconds':max(clip_errors),'audio_video_duration_difference_seconds':abs(float(audio['duration'])-float(video['duration'])),'size_bytes':dest.stat().st_size,'voice':'zh-CN-YunxiNeural (synthetic)','caption_timing':'paragraph audio measured; intra-paragraph timing estimated','llm_experiment_performed':False}
(out/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
