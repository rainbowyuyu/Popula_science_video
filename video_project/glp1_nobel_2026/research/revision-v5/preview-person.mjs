import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'person-preview');fs.mkdirSync(out,{recursive:true});
const entry=`
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';import {V5Person} from './src/V5Person';import {V5Measure} from './src/V5Measure';import {MealScene} from './src/MealScene';
const scene=new T.Scene();scene.background=new T.Color('#f2eee7');const camera=new T.PerspectiveCamera(33,16/9,.005,30),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,900);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);scene.environment=new T.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;scene.environmentIntensity=.40;
scene.add(new T.HemisphereLight('#fff8ed','#a1aaa9',1));const sun=new T.DirectionalLight('#fff6e8',2.5);sun.position.set(-2,4,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-2;sun.shadow.camera.right=2;sun.shadow.camera.top=3;sun.shadow.camera.bottom=-1;scene.add(sun);const rim=new T.DirectionalLight('#ecf6ff',1);rim.position.set(3,3,-3);scene.add(rim);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f2eee7',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.004;floor.receiveShadow=true;scene.add(floor);
const gltf=await new GLTFLoader().loadAsync('/public/models/body.glb');const body=gltf.scene;body.traverse(o=>{if(o instanceof T.Mesh){o.material=new T.MeshStandardMaterial({color:'#d6c3b1',roughness:.63});o.castShadow=true;o.receiveShadow=true}});scene.add(body);const person=new V5Person(body);scene.add(person.root);const meal=new MealScene('/public/');await meal.ready;meal.root.position.y=-.225;scene.add(meal.root);
const measure=new V5Measure(body);scene.add(measure.root);measure.root.visible=false;
window.shot=(o)=>{person.update(o);if(o.measurementWeight>0)measure.update(o.measurementWeight);else measure.root.visible=false;meal.update(o.time);meal.root.visible=o.action==='eat';const target=new T.Vector3(...(o.target??[0,.80,.07]));camera.position.set(...o.camera);camera.lookAt(target);renderer.render(scene,camera);person.wardrobe.traverse(o=>{if(o.isMesh)o.geometry.computeBoundingBox()});const garmentBox=new T.Box3().setFromObject(person.wardrobe);return {action:o.action,time:o.time,anchors:Object.fromEntries(Object.entries(person.anchors).map(([k,v])=>[k,v.toArray()])),metadata:person.root.userData,wardrobeBounds:{min:garmentBox.min.toArray(),max:garmentBox.max.toArray()},personChairVisible:person.diningProps.visible};};window.geometry=()=>{const values=[];body.traverse(o=>{if(o instanceof T.Mesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.array.length;i++)values.push(p.array[i]);}});return values};window.ready=true;
`;
await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,format:'esm',platform:'browser',outfile:path.join(out,'runner.js')});fs.writeFileSync(path.join(out,'index.html'),'<meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/research/revision-v5/person-preview/runner.js"></script>');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.gltf':'model/gltf+json','.bin':'application/octet-stream'})[ext]??'text/html');fs.createReadStream(file).pipe(res)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:console.log,onLog:()=>{}});await page.setViewport({width:1600,height:900,deviceScaleFactor:1});await page.goto({url:'http://127.0.0.1:'+server.address().port+'/research/revision-v5/person-preview/index.html',timeout:120000});await page.evaluate(async()=>{for(let i=0;i<1100&&!window.ready;i++)await new Promise(r=>setTimeout(r,100));if(!window.ready)throw Error('person timeout')});
 const shots=[
 {id:'stand-front',action:'stand',time:0,camera:[0,1.04,3.25]},
 {id:'neutral-body',action:'stand',time:0,wardrobeOpacity:0,camera:[0,1.04,3.25]},
 {id:'stand-side',action:'stand',time:0,camera:[2.8,1.1,.50]},
 {id:'stand-back',action:'stand',time:0,camera:[-1.2,1.14,-3.0]},
 {id:'eat-bowl',action:'eat',time:1.2,camera:[-1.8,1.43,2.3],target:[0,.68,.18]},
 {id:'eat-rise',action:'eat',time:3.6,camera:[1.7,1.36,2.3],target:[0,.73,.16]},
 {id:'eat-mouth',action:'eat',time:5.0,camera:[-1.75,1.38,2.1],target:[0,.73,.15]},
 {id:'eat-close',action:'eat',time:5.0,camera:[.70,1.40,1.22],target:[.02,.96,.20]},
 {id:'stand-return',action:'eat',time:5.0,weight:.5,seatedWeight:1,propsOpacity:.3,camera:[-1.5,1.37,2.9],target:[0,.85,.10]},
 {id:'walk-front',action:'walk',time:.43,camera:[-1.3,1.1,3]},
 {id:'walk-side',action:'walk',time:.43,camera:[2.8,1.2,.42]},
 {id:'resistance',action:'resistance',time:1.1,camera:[-1.6,1.12,2.8]},
 {id:'blend-quarter',action:'resistance',previousAction:'walk',transition:.25,time:.43,camera:[-1.3,1.1,3]},
 {id:'blend-half',action:'resistance',previousAction:'walk',transition:.5,time:.43,camera:[-1.3,1.1,3]},
 {id:'blend-three-quarter',action:'resistance',previousAction:'walk',transition:.75,time:.43,camera:[-1.3,1.1,3]},
 {id:'waist-greater',action:'stand',adiposity:1,time:0,camera:[.9,1.1,2.5],target:[0,1.06,.03]},
 {id:'waist-less',action:'stand',adiposity:0,time:0,camera:[.9,1.1,2.5],target:[0,1.06,.03]},
 {id:'eat-side',action:'eat',time:5.0,camera:[2.6,1.42,.4],target:[0,.77,.17]},
 {id:'eat-back',action:'eat',time:5.0,camera:[-1.8,1.4,-1.8],target:[0,.73,.15]},
 {id:'actual-182',action:'eat',time:182/30,adiposity:.68,camera:[-1.8,1.43,2.3],target:[0,.71,.12]},
 {id:'actual-5413',action:'sitStand',time:5413/30,adiposity:.68,camera:[-1.3,1.1,3]},
 {id:'measurement-quarter',action:'stand',measurementWeight:.25,time:12,adiposity:.68,camera:[-1.6,1.30,2.9],target:[.14,.78,.12]},
 {id:'measurement-half',action:'stand',measurementWeight:.5,time:12,adiposity:.68,camera:[-1.6,1.30,2.9],target:[.14,.78,.12]},
 {id:'measurement-full',action:'stand',measurementWeight:1,time:12,adiposity:.68,camera:[-1.6,1.30,2.9],target:[.14,.73,.12]},
 {id:'measurement-side',action:'stand',measurementWeight:1,time:12,adiposity:.68,camera:[2.8,1.12,.48],target:[.14,.69,.10]},
 {id:'measurement-front',action:'stand',measurementWeight:1,time:12,adiposity:.68,camera:[.15,1.12,3.0],target:[.14,.69,.10]},
 {id:'measurement-detail',action:'stand',measurementWeight:1,time:12,adiposity:.68,camera:[-.5,.90,1.5],target:[.04,.49,.15]},
 {id:'stand-restored',action:'stand',time:9.0,camera:[0,1.04,3.25]},
 ];const report=[];for(const shot of shots){report.push(await page.evaluate(o=>window.shot(o),shot));const {value:r}=await page._client().send('Page.captureScreenshot',{format:'jpeg',quality:93});fs.writeFileSync(path.join(out,shot.id+'.jpg'),Buffer.from(r.data,'base64'));console.log(shot.id)}fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(report,null,2));
 const a={action:'eat',time:3.8,adiposity:.68,camera:[-1.8,1.43,2.3],target:[0,.71,.12]};await page.evaluate(o=>window.shot(o),a);const g1=await page.evaluate(()=>window.geometry());await page.evaluate(()=>window.shot({action:'walk',time:7,camera:[0,1,3]}));await page.evaluate(o=>window.shot(o),a);const g2=await page.evaluate(()=>window.geometry());const maxSeekDifference=Math.max(...g1.map((v,i)=>Math.abs(v-g2[i])));fs.writeFileSync(path.join(out,'determinism.json'),JSON.stringify({maxSeekDifference,sourceUpperArmLength:Math.sqrt(.051**2+.295**2+.004**2),posedUpperArmLengths:report.map(r=>r.metadata.upperArmLength),sourceForearmLength:Math.sqrt(.025**2+.197**2+.044**2),posedForearmLengths:report.map(r=>r.metadata.forearmLength)},null,2));
 if(process.argv.includes('--motion')){const framesDir=path.join(out,'motion-frames');fs.mkdirSync(framesDir,{recursive:true});for(let f=0;f<288;f++){const t=f/30,u=f/287,e=u*u*u*(u*(u*6-15)+10),o={action:'eat',time:t,adiposity:.68,camera:[-1.8+1.2*e,1.43-.08*e,2.3-.36*e],target:[0,.71+.05*e,.12]};await page.evaluate(o=>window.shot(o),o);const {value:r}=await page._client().send('Page.captureScreenshot',{format:'jpeg',quality:91});fs.writeFileSync(path.join(framesDir,String(f).padStart(4,'0')+'.jpg'),Buffer.from(r.data,'base64'));if(f%60===0)console.log('motion',f)}const r=spawnSync('C:/ffmpeg/bin/ffmpeg.exe',['-y','-hide_banner','-loglevel','error','-framerate','30','-i',path.join(framesDir,'%04d.jpg'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p',path.join(out,'person-dining-motion.mp4')],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);console.log('motion encoded')}

}finally{await browser.close({silent:true});server.close()}
