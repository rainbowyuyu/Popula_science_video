"""One-time V3 -> V4 bootstrap. Reviewed V4 sources are the render inputs.

This script intentionally does not overwrite later visual/event refinements.
Use --overwrite-drafts only when deliberately rebuilding the initial draft.
"""
from pathlib import Path
import sys
r=Path(__file__).resolve().parents[1]
if '--overwrite-drafts' not in sys.argv and any((r/p).exists() for p in ['src/FilmV4.tsx','src/WorldV4.ts','src/scene/StationsV4.ts']):
    raise SystemExit('Reviewed V4 sources already exist; bootstrap refused to overwrite them.')
s=(r/'src/scene/Stations.ts').read_text(encoding='utf8')
s=s.replace("import narration from '../narration.json';", "import {sceneNarrationV4 as narration} from '../TimelineV4';")
s=s.replace("this.recovered.position.set(-30,3.35,0)","this.recovered.position.set(.3,16,0)")
s=s.replace("this.recoveredC.position.set(30,2.55,0)","this.recoveredC.position.set(.3,18,0)")
s=s.replace("this.rejected.position.set(lerp(-12,3.5,ease((t-2)/6)),lerp(4,2.8,ease((t-2)/6)),.8)","this.rejected.position.set(lerp(5.5,3.5,ease((t-2)/6)),lerp(16,2.8,ease((t-2)/6)),.8)")
s=s.replace("this.gcHighlight.position.x=lerp(-14,-1.1,q)","this.gcHighlight.position.set(-1.1,lerp(16,2.95,q),.4)")
s=s.replace("this.recovered.position.set(lerp(-30,.3,restoreB)*(1-leaveB)-70*leaveB,3.35,0);this.recoveredC.position.set(lerp(30,.3,restoreC)*(1-leaveC)+70*leaveC,2.55,0)","this.recovered.position.set(.3,lerp(16,3.35,restoreB)+16*leaveB,0);this.recoveredC.position.set(.3,lerp(18,2.55,restoreC)+18*leaveC,0)")
s=s.replace("s.position.x=lerp(-5.8,-2.8,ease((t-i)/8))-13*ease((t-(err-3))/6)","s.position.x=lerp(-5.8,-2.8,ease((t-i)/8));s.position.y=1.1-i*.64-14*ease((t-(err-3))/6)")
s=s.replace("this.errors.forEach((g,i)=>{g.position.x=lerp(15+i*.4,2.5,ease((t-err-i*2.4)/1.8));})", "this.errors.forEach((g,i)=>{const enter=ease((t-err-i*2.4)/3.2);g.position.x=2.5;g.position.y=lerp(10+i*.35,[1.4,.28,-.84][i],enter);})")
s=s.replace("this.candidates[2].position.x=lerp(3.95,16,ease((t-cue('n33',216))/4))", "const reject=ease((t-cue('n33',216))/4);this.candidates[2].position.set(3.95+3.2*reject,1.7-2*1.32+16*reject*reject,.3)")
(r/'src/scene/StationsV4.ts').write_text(s,encoding='utf8')
w=(r/'src/World.ts').read_text(encoding='utf8').replace("'./CameraPathV3'","'./CameraPathV4'").replace("'./scene/Stations'","'./scene/StationsV4'").replace('export class World {','export class WorldV4 {')
# Apply a restrained roll consistently to real scene and projected labels.
w=w.replace('this.camera.lookAt(...pose.target);','this.camera.lookAt(...pose.target);this.camera.rotateZ(T.MathUtils.degToRad(pose.rollDeg));')
w=w.replace('render(t:number){','render(t:number,draw=true){').replace('this.renderer.render(this.scene,this.camera);','if(draw)this.renderer.render(this.scene,this.camera);')
(r/'src/WorldV4.ts').write_text(w,encoding='utf8')
f=(r/'src/Film.tsx').read_text(encoding='utf8').replace("import {World} from './World';", "import {WorldV4 as World} from './WorldV4';\nimport {sceneTimeV4,sceneNarrationV4 as narration} from './TimelineV4';")
f=f.replace("'./CameraPathV3'","'./CameraPathV4'").replace("'./captions.json'","'./captions-v4.json'").replace("import narration from './narration.json';\n",'')
f=f.replace('camera.lookAt(...pose.target);camera.updateMatrixWorld(true);','camera.lookAt(...pose.target);camera.rotateZ(T.MathUtils.degToRad(pose.rollDeg));camera.updateMatrixWorld(true);')
f=f.replace('offset:[280,260]','offset:[340,-80]')
f=f.replace('export function Film(', 'export function FilmV4(').replace('t=frame/30;return<AbsoluteFill','t=sceneTimeV4(frame/30);return<AbsoluteFill')
f=f.replace('<Scene frame={frame}/>','<Scene frame={t*30}/>').replace("staticFile('audio/master.wav')","staticFile('audio/v4/master.wav')")
f=f.replace('world.current?.render(frame/30);','world.current?.render(frame/30,false);')
(r/'src/FilmV4.tsx').write_text(f,encoding='utf8')
print('Wrote independent V4 film, world, and stations; V3 preserved.')

