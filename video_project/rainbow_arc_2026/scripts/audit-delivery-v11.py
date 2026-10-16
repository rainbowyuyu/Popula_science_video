from pathlib import Path
import subprocess,json,hashlib, numpy as np
import soundfile as sf
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(r'C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v11')
video=OUT/'delivery/彩虹为什么是弧形_V11_1080p.mp4'
def run(args): return subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace',check=True).stdout
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video'); a=next(s for s in probe['streams'] if s['codec_type']=='audio')
frames=int(run(['ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','default=nk=1:nw=1',str(video)]).strip())
raw=subprocess.run(['ffmpeg','-v','error','-i',str(video),'-vf','fps=1,scale=320:180','-f','image2pipe','-vcodec','mjpeg','pipe:1'],capture_output=True,check=True).stdout
black=[]
import io
for i in range(int(float(probe['format']['duration']))):
    pass
# decode via temporary contact stills for deterministic black checks at chapter boundaries
times=[0,4,20,38,65,90,118,150,184,220,256,292,328,344,351,356]
st=ROOT/'work/qa-v11-delivery'; st.mkdir(parents=True,exist_ok=True)
for t in times:
    p=st/f'{t:03d}.jpg'; subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1','-q:v','3',str(p)],check=True)
    im=np.asarray(Image.open(p).convert('RGB'),dtype=np.uint8); black.append({'seconds':t,'mean':float(im.mean()),'darkFraction':float((im.mean(axis=2)<4).mean())})
audio=ROOT/'public/audio_v11/master-v11.wav'; data,sr=sf.read(audio,dtype='float64');
audioPeak=float(20*np.log10(max(np.max(np.abs(data)),1e-12))); duration=float(len(data)/sr)
report={'version':'V11','video':str(video),'videoSHA256':hashlib.sha256(video.read_bytes()).hexdigest(),'frames':frames,'width':int(v['width']),'height':int(v['height']),'fps':v['r_frame_rate'],'videoDuration':float(v['duration']),'audioCodec':a['codec_name'],'audioSampleRate':a['sample_rate'],'audioChannels':a['channels'],'audioDuration':float(a['duration']),'sourceMasterDuration':duration,'sourceMasterPeakDbTPApprox':audioPeak,'sampleFrames':black,'blackSamplePass':all(x['darkFraction']<.985 for x in black),'qwenAudit':'research/qa-v11/qwen-transition-audit-v11.json','audioAudit':'research/qa-v11/audio-v11-tail-repair.json','humanListeningChecked':False}
(ROOT/'research/qa-v11/delivery-qa-v11.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
