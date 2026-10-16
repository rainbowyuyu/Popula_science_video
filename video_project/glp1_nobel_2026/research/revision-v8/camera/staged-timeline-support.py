from pathlib import Path
p=Path('research/revision-v8/camera/preview.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("const root=process.cwd(),stage=", "const root=process.cwd(),timelineFile=path.resolve(process.env.TIMELINE_PATH??'src/timeline.json'),timelineImport='./'+path.relative(root,timelineFile).replaceAll(path.sep,'/'),stage=")
s=s.replace("import tl from './src/timeline.json';", "import tl from ${JSON.stringify(timelineImport)};")
s=s.replace("sha(path.resolve('src/timeline.json'))", "sha(timelineFile)")
p.write_text(s,encoding='utf-8')
