from pathlib import Path
import re,json,hashlib,datetime,shutil
root=Path.cwd(); d=root/'src/v16'
d.mkdir(exist_ok=True)
s=(root/'src/World.ts').read_text(encoding='utf-8-sig').replace("from './","from '../")
s=s.replace("from '../SpatialEngineering'","from './SpatialEngineeringV16'")
s=s.replace('export class World{','export class WorldV16{\n cameraOverride?: (s:State)=>{target:T.Vector3};')
a=s.index('  const pose=openingCameraPose(t,this.path.at(t));');b=s.index('  const inventoryWeight=',a)
s=s[:a]+'''  let focus:T.Vector3;
  if(this.cameraOverride){focus=this.cameraOverride(s).target;}
  else {const pose=openingCameraPose(t,this.path.at(t));applyOpeningCameraPose(this.camera,pose);
   const follow=this.physics!.displacementAt(pose.target).multiplyScalar(pulse(33.3,34.7,38.1,39.1,u));
   focus=pose.target.clone().add(follow);this.camera.position.add(follow);this.camera.lookAt(focus);this.camera.rotateZ(pose.roll);this.camera.updateMatrixWorld();}
  this.environment.update(s,this.camera,focus);
'''+s[b:]
(d/'WorldV16.ts').write_text(s,encoding='utf-8')
s=(root/'src/SpatialEngineering.ts').read_text(encoding='utf-8-sig').replace("from './","from '../")
s=s.replace('  for(const a of annotations){','  const vertical=camera.aspect<1, H=vertical?1920:1080, W=vertical?1080:1920;\n  for(const a of annotations){')
s=s.replace('/1080;','/H;').replace("const side=a.side??(clip.x>.22?-1:1),width=a.value?420:360;","const side=a.side??([...a.id].reduce((v,c)=>v+c.charCodeAt(0),0)%2?-1:1),width=vertical?(a.value?440:390):(a.value?420:360);")
s=s.replace('(clip.x+1)*960,y=(1-clip.y)*540','(clip.x+1)*W/2,y=(1-clip.y)*H/2')
s=s.replace('1884-width*.5','W-36-width*.5').replace('travel(x-1820)','travel(x-(W-100))')
s=s.replace('a.maxLabelY??840','vertical?H-350:(a.maxLabelY??840)').replace('travel(y-900)','travel(y-(H-180))')
s=s.replace('(x>1920&&labelX-width/2>1920)','(x>W&&labelX-width/2>W)').replace('(y>1080&&labelY-80>1080)','(y>H&&labelY-80>H)')
(d/'SpatialEngineeringV16.ts').write_text(s,encoding='utf-8')
shutil.copyfile(root.parent/'ai_evolution_ch05_reasoning_agents_v05/scene/vendor/waterpro-local.js',root/'work/v16/vendor/waterpro-local.js')
shutil.copyfile(root.parent/'ai_evolution_ch05_reasoning_agents_v05/scene/vendor/WaterPro-LICENSE-LOCAL-ONLY.md',root/'work/v16/vendor/LICENSE.md')
(root/'work/v16/vendor/.gitignore').write_text('*\n!.gitignore\n',encoding='utf-8')
# Short provisional copy supports component compilation until fresh narration is written.
for src,dst in [('timeline-v15.json','audio-timeline.json'),('timeline-v15-vertical.json','audio-timeline-vertical.json')]:
 if not (d/dst).exists():
  t=json.loads((root/'src'/src).read_text());t['sceneSegments']=[];(d/dst).write_text(json.dumps(t,ensure_ascii=False),encoding='utf-8')
protected=[root/'delivery/ShanghaiTower_1080p_v14.mp4',root/'delivery/ShanghaiTower_1080p_v15.mp4',root/'delivery/ShanghaiTower_1080x1920_v15.mp4',root/'src/World.ts',root/'src/FilmV15.tsx',root/'src/FilmV15Vertical.tsx']
lock={'version':'V16','status':'in-production','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protected':{str(p.relative_to(root)).replace('\\','/'):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in protected}}
(root/'research/qa/v16/production-lock.json').write_text(json.dumps(lock,indent=2),encoding='utf-8')
print('V16 isolated scene, spatial label layer, local licensed water adapter and protection hashes created')
