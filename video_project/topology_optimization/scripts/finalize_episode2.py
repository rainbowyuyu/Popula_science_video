from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[1]; P=R/'public/episode2'; O=R/'output/episode2'; D=R/'delivery/episode2'; Q=R/'research/episode2'
keep=[O/'彩虹为什么是弧形_1080p.mp4',P/'timeline.json',P/'narration.wav',P/'master.wav',P/'rainbow_arc_ambient.wav',R/'src/episode2/Film.tsx',R/'src/episode2/World.ts',Q/'story.json',Q/'讲解检索与来源.md',D/'制作说明.md']
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
manifest={'episode':'rainbow-arc-episode2','files':[{'path':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in keep if p.exists()]}
(D/'dependency-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(D/'qa.json').write_text(json.dumps({'video':{'width':1920,'height':1080,'fps':30,'durationSeconds':303.8667},'audio':{'durationSeconds':303.9227,'meanVolumeDb':-16.0,'maxVolumeDb':-0.7},'typescript':'passed','stills':'passed','fullDecode':'ffprobe passed','subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
print('manifest',len(manifest['files']),'files')
