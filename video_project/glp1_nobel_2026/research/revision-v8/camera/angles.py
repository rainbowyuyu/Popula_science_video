from pathlib import Path
p=Path('research/revision-v8/camera/preview.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("const root=process.cwd(),stage=", "const qaYaw=Number(process.env.QA_YAW??0);\nconst root=process.cwd(),stage=")
s=s.replace('w.update(s);if(0){', 'w.update(s);if(${qaYaw}){').replace('applyAxisAngle(new T.Vector3(0,1,0),0)', 'applyAxisAngle(new T.Vector3(0,1,0),${qaYaw})')
p.write_text(s,encoding='utf-8')
