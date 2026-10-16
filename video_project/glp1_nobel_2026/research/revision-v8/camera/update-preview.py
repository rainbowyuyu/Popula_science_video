from pathlib import Path
p=Path('research/revision-v8/camera/preview.mjs');s=p.read_text(encoding='utf-8')
s=s.replace('w.update(s);renderer.render(scene,camera);',"w.update(s);if("+str(0)+"){camera.position.sub(w.cameraPath.sample(f).focus).applyAxisAngle(new T.Vector3(0,1,0),0).add(w.cameraPath.sample(f).focus);camera.lookAt(w.cameraPath.sample(f).target);camera.updateMatrixWorld();}renderer.render(scene,camera);")
s=s.replace('delete s.png;s.image=',"delete s.png;if(process.env.DENSE){for(const key of ['rays','person','anchors','registration','cardio','kidney','clot','labels'])delete s[key];}s.image=")
p.write_text(s,encoding='utf-8')
