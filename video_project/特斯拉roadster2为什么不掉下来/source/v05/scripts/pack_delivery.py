"""Record the actual current dependencies, outputs, source references and QA."""
from pathlib import Path
import hashlib,json,shutil,subprocess
R=Path(__file__).resolve().parents[1];P=R.parents[1];D=P/'output/v05';D.mkdir(parents=True,exist_ok=True)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
n=json.loads((R/'src/narration.json').read_text(encoding='utf8'))
movie=D/'Roadster_倒挂与飞行翻滚_1080p.mp4'
qa=json.loads((R/'work/qa/final-video.json').read_text(encoding='utf8'))
motion=json.loads((R/'work/motion-qa/report.json').read_text(encoding='utf8'))
assert qa['automaticChecksPassed'] and motion['passed'], 'Current master must pass objective QA before packaging'
render_inputs=json.loads((R/'work/qa/render-inputs.json').read_text(encoding='utf8'))
for row in render_inputs['inputs']:
 assert sha(R/row['path'])==row['sha256'], f"Render input changed: {row['path']}"
video=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)]))
v=next(s for s in video['streams'] if s['codec_type']=='video');a=next(s for s in video['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['r_frame_rate'])==(1920,1080,'30/1')
assert int(v['nb_frames'])==n['durationFrames']
assert abs(float(v['duration'])-n['durationSec'])<1/30
assert a['sample_rate']=='48000' and a['channels']==2
assets=P/'assets/v05';assets.mkdir(parents=True,exist_ok=True)
glb=R/'work/car-review/roadster_teaching.glb'
if glb.exists():shutil.copy2(glb,assets/glb.name)
files=[]
for p in [movie,R/'src/story.json',R/'src/narration.json',R/'src/captions-data.json',R/'public/audio/master.wav',R/'package-lock.json',R/'src/Car.ts',R/'src/World.ts',R/'src/Film.tsx']:
 files.append({'path':p.relative_to(P).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
manifest={'title':n['title'],'durationSec':n['durationSec'],'video':video,'files':files,'sources':'research/evidence.json','voice':'User rainbow鱼 reference + local Qwen3-TTS-0.6B; no reference audio copied','music':'User supplied 绿豆腐炒肉 - 莫问归期+辞九门回忆dj.mp3; beat/phrase matched loop, voice ducking; source rights unchanged','model':'Original procedural teaching car inspired by public 2026 Roadster silhouette, not official CAD','physics':'Pressure calculation checked; slowed kinematic illustration, not CFD or real-vehicle flight solver','verification':{'typeCheck':True,'subjectiveFullFilmListening':False,'subjectiveContinuousFullFilmViewing':False,'note':'See work/motion-qa and work/qa for performed technical checks and sampled visual review; automated tests do not certify subjective listening.'}}
manifest['verification'].update({'automaticEncodedVideoChecks':qa['automaticChecksPassed'],'motionFramesChecked':motion['framesChecked'],'renderInputHashesUnchanged':True,'factReview':'research/iterations/v05/fact-review.md','visualReview':'source/v05/work/qa/visual-review.json','fontCoverage':'source/v05/work/qa/font-coverage.json','musicRecord':'source/v05/work/audio/music-provenance.json'})
(D/'delivery.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
script=['# Roadster 为什么倒挂不掉，还能空中翻滚？','','片长按个人音色自然时长。官方演示与原理示意分开表述。','']
for c in n['cues']:script.extend([f"## {c['startSec']:.2f}–{c['endSec']:.2f} 秒 · {c['label']}",c['text'],''])
(D/'完整解说稿.md').write_text('\n'.join(script),encoding='utf8')
readme=f'''# Roadster：倒挂与空中翻滚

最新完整一期：[{movie.name}](output/v05/{movie.name})，{n['durationSec']:.2f}秒，1920×1080，30fps。

- [资料与官方原视频](research/sources.md)
- [完整解说稿](output/v05/完整解说稿.md)
- [带章节定位的预览页](output/v05/preview.html)
- [中文字幕](subtitles/v05/Roadster_中文字幕.srt)
- [交付台账](output/v05/delivery.json)

本片为原创三维机制解释：压差贴住表面；冷气喷射提供推力；偏心推力产生力矩；反向力矩刹住翻转。算例和喷嘴位置均为教学设定，不表示Tesla实测参数。真实专利首页用于来源展示。

源工程位于 source/v05，运行 `npm run check`、`npm run stills`、`npm run render`。引用已安装共享 node_modules（DNA项目），不复制共享依赖。私有参考音色仍在原TTS工程。

完整回退版本保留在 output/v04，其他工程不变。
'''
(P/'README.md').write_text(readme,encoding='utf8')
print('DELIVERY',movie,'seconds',n['durationSec'])
