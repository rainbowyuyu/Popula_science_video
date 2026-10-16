from pathlib import Path
p=Path('research/revision-v8/camera/preview.mjs');s=p.read_text(encoding='utf-8')
s=s.replace('window.ready=true;',"window.audit=()=>{const a=tl.clips.find(c=>c.id==='h026'),b=tl.clips.find(c=>c.id==='h027'),c=tl.clips.find(c=>c.id==='h028');let peak=0,peakFrame=0;for(let f=b.start;f<c.end;f++){const v=Math.abs(Math.log10(w.cameraPath.sample(f+1).distance/w.cameraPath.sample(f).distance))*tl.fps;if(v>peak){peak=v;peakFrame=f;}}return{duration:tl.duration,clips:[a,b,c],knots:w.cameraPath.knots.filter(k=>k.frame>a.start-600&&k.frame<c.end+150).map(k=>({...k,focus:k.focus.toArray()})),exitPeakDecadesPerSecond:peak,exitPeakFrame:peakFrame};};window.ready=true;")
s=s.replace('JSON.stringify({source,samples},null,2)','JSON.stringify({source,timelineSHA256:sha(path.resolve(\'src/timeline.json\')),audit:await page.evaluate(()=>window.audit()),samples},null,2)')
p.write_text(s,encoding='utf-8')
