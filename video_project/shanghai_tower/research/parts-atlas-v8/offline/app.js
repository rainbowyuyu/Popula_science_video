import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

const data=JSON.parse(document.getElementById('atlasData').textContent),$=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const stage=$('stage'),canvas=$('canvas'),scene=new T.Scene();scene.background=new T.Color('#f0f3ec');
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;
const camera=new T.PerspectiveCamera(34,1,.008,200),controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.07;controls.autoRotateSpeed=.5;controls.minDistance=.08;controls.maxDistance=60;controls.maxPolarAngle=Math.PI*.97;
camera.position.set(8.5,4.1,10);controls.target.set(0,2.8,0);
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.05);
scene.environment=env.texture;scene.environmentIntensity=.5;room.dispose();pmrem.dispose();
scene.add(new T.HemisphereLight('#fff7e8','#7c9494',1.15));
const sun=new T.DirectionalLight('#fff0d9',2.1);sun.position.set(-6,12,8);scene.add(sun);
const fill=new T.DirectionalLight('#d1e6f2',1.2);fill.position.set(8,7,-6);scene.add(fill);
const floor=new T.Mesh(new T.CircleGeometry(1.65,80),new T.MeshStandardMaterial({color:'#c9d5c5',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;scene.add(floor);
const world=new T.Group();scene.add(world);
const parts=[],byId=new Map(),selectable=[];let mode='whole',selected=null,isolate=false,ghost=true,page=0,filtered=[...data.parts],tween=null,layoutTween=0;
const categoryMap=new Map(data.categories.map(c=>[c.id,c]));
const state={ready:false,expected:data.parts.length,loaded:0,mode,selected:null,filtered:data.parts.length,networkRequired:false,missing:[],errors:[],page:0};window.__atlas=state;
const palette={foundation:'#839b8c',core:'#9baea7',columns:'#426c78',outriggers:'#986326',belts:'#a5804e',floors:'#afbeb4',facades:'#56899d',gardens:'#65855c',top:'#769591',environment:'#a3b794'};
function viewWidth(){return stage.clientWidth-(mode==='gallery'?(stage.clientWidth>=1050?320:stage.clientWidth>=650?240:0):0)}
function viewHeight(){return stage.clientHeight-(mode==='gallery'&&stage.clientWidth<650?132:0)}
function gallerySize(){return viewWidth()<650?8:12}
function columns(){return viewWidth()<650?2:4}
function easy(x){x=T.MathUtils.clamp(x,0,1);return x*x*x*(x*(x*6-15)+10)}
function animateCamera(position,target,duration=1100){tween={at:performance.now(),p0:camera.position.clone(),t0:controls.target.clone(),p1:position,t1:target,duration:reduced?0:duration}}
function cameraFit(box,duration=1100,direction=null){
 const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
 const angle=Math.min(T.MathUtils.degToRad(camera.fov*.5),Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov*.5))*camera.aspect));
 const distance=Math.max(size.length()*.5,.025)/Math.sin(angle)*1.16;
 const dir=direction??camera.position.clone().sub(controls.target).normalize();
 animateCamera(center.clone().add(dir.multiplyScalar(distance)),center,duration);
}
function frameAll(){
 if(mode==='gallery'){
  const col=columns(),rows=Math.ceil(Math.min(filtered.length-page*gallerySize(),gallerySize())/col),h=Math.max(rows*2.08+1.1,(col*2.62+.8)/camera.aspect);
  animateCamera(new T.Vector3(0,0,h/(2*Math.tan(T.MathUtils.degToRad(camera.fov*.5)))),new T.Vector3(0,0,0));
 }else{
  const list=filtered.length===data.parts.length?parts:parts.filter(p=>filtered.some(x=>x.id===p.info.id));
  const bounds=new T.Box3();for(const p of list){const b=p.bounds.clone();if(mode==='explode')b.translate(p.explode);bounds.union(b)}
  if(!bounds.isEmpty())cameraFit(bounds,1100,new T.Vector3(.64,.21,1).normalize());
 }
}
function materialFor(source,info){
 const shell=['outerglass','innerfacade'].includes(info.role),environment=info.environmentalOrLandscape;
 const color=new T.Color(palette[info.category]??'#a5b9ad');
 if(info.role==='damper_plate')color.set('#bd9263');
 if(info.role==='damper_magnets')color.set('#58767f');
 if(info.role==='crown')color.set('#79949a');
 const m=new T.MeshStandardMaterial({color,roughness:shell?.25:.43,metalness:shell?.28:info.category==='belts'||info.category==='outriggers'?.32:.12,
  side:T.DoubleSide,transparent:shell||environment,opacity:shell?.28:environment?.3:1,depthWrite:!shell&&!environment});
 m.userData={baseColor:color.clone(),shell,environment};return m;
}
function makeOptions(){
 for(const c of data.categories){const o=document.createElement('option');o.value=c.id;o.textContent=`${c.nameChinese} · ${c.count}`;$('category').append(o)}
 const zones=[...new Set(data.parts.map(p=>p.zone).filter(x=>x!==null))].sort((a,b)=>a-b);
 for(const z of zones){const o=document.createElement('option');o.value=String(z);o.textContent=`第${'一二三四五六七八九'[z-1]??z}区`;$('zone').append(o)}
 const o=document.createElement('option');o.value='other';o.textContent='基础 / 顶部 / 环境';$('zone').append(o);
}
function renderList(){
 const list=$('partList');list.textContent='';const frag=document.createDocumentFragment();
 for(const p of filtered){const b=document.createElement('button');b.className='part-row';b.dataset.id=p.id;b.setAttribute('role','option');b.setAttribute('aria-selected',String(selected?.info.id===p.id));b.title=p.nameChinese;
  const name=document.createElement('span');name.className='type';name.textContent=p.labelChinese;
  const loc=document.createElement('span');loc.className='loc';loc.textContent=p.locationChinese;b.append(name,loc);b.onclick=()=>choose(p.id,true);frag.append(b)}
 list.append(frag);if(!filtered.length){const x=document.createElement('p');x.className='list-empty';x.textContent='没有匹配的部件。试试“伸臂”“筏板”“铜板”，或清空筛选。';list.append(x)}
 $('resultCount').textContent=`${filtered.length} / 987 个部件`;state.filtered=filtered.length;
}
function applyFilter(){
 const terms=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean),category=$('category').value,zone=$('zone').value;
 filtered=data.parts.filter(p=>(!category||p.category===category)&&(!zone||(zone==='other'?p.zone===null:String(p.zone)===zone))&&terms.every(t=>`${p.id} ${p.nameChinese} ${p.labelChinese} ${p.locationChinese} ${p.categoryChinese}`.toLowerCase().includes(t)));
 page=0;isolate=false;$('isolate').setAttribute('aria-pressed','false');renderList();updateLayout();frameAll();
}
function updateLayout(){
 if(!state.ready)return;
 const ids=new Set(filtered.map(p=>p.id)),visible=mode==='gallery'?filtered.slice(page*gallerySize(),(page+1)*gallerySize()):filtered;
 const visibleIds=new Set(visible.map(p=>p.id)),col=columns(),rows=Math.ceil(visible.length/col);
 $('tileLabels').textContent='';
 for(const p of parts){
  const index=visible.findIndex(x=>x.id===p.info.id);p.group.visible=visibleIds.has(p.info.id)&&(!isolate||selected===p);
  p.startPosition.copy(p.group.position);p.startScale.copy(p.group.scale);p.startQuaternion.copy(p.group.quaternion);
  if(mode==='gallery'){
   const row=Math.floor(index/col),column=index%col;p.targetPosition.set((column-(col-1)/2)*2.62,((rows-1)/2-row)*2.08,0);
   const max=p.size.length();const scale=1.50/Math.max(max,.025);p.targetScale.setScalar(scale);p.targetQuaternion.setFromEuler(new T.Euler(.16,-.48,-.045));
   if(p.group.visible){const label=document.createElement('button');label.className='tile-label';label.setAttribute('aria-pressed',String(p===selected));label.dataset.id=p.info.id;
    const name=document.createElement('span');name.textContent=p.info.labelChinese;const loc=document.createElement('small');loc.textContent=p.info.shortLocationChinese;label.append(name,loc);label.onclick=()=>choose(p.info.id,false);$('tileLabels').append(label);p.tileLabel=label;
   }else p.tileLabel=null;
  }else{p.targetPosition.copy(p.center);if(mode==='explode')p.targetPosition.add(p.explode);p.targetScale.setScalar(1);p.targetQuaternion.identity();p.tileLabel=null}
 }
 floor.visible=mode!=='gallery'&&filtered.length===987&&!isolate;layoutTween=performance.now();
 $('pagination').hidden=mode!=='gallery';$('prev').disabled=page<=0;$('next').disabled=(page+1)*gallerySize()>=filtered.length;
 const start=filtered.length?page*gallerySize()+1:0,end=Math.min((page+1)*gallerySize(),filtered.length);
 $('pageInfo').textContent=`${start}–${end} / ${filtered.length}`;state.page=page;state.visible=parts.filter(p=>p.group.visible).length;
 $('legend').hidden=mode==='gallery'||filtered.length<987;stage.classList.toggle('gallery',mode==='gallery');
 $('sceneTitle').textContent=mode==='gallery'?(categoryMap.get($('category').value)?.nameChinese??'每一件，都有位置。'):mode==='explode'?'拆开，看见连接。':filtered.length<987?(categoryMap.get($('category').value)?.nameChinese??'从一个部件开始。'):'一座塔，层层相连。';
 $('sceneKicker').textContent=mode==='gallery'?'完整名称 · 真实模型':'从整体，看见每一处连接';
 $('sceneSubtitle').textContent=mode==='gallery'?'按独立尺度平铺 · 可翻页查看全部部件':mode==='explode'?'保持原始尺度，沿各自的方向分解。':'旋转、拆解，走进上海中心的内部。';
 $('viewStatus').textContent=mode==='gallery'?'平铺采用独立尺度 · 不表示部件实际比例':`${state.visible} 个部件在场景中 · 模型单位：米`;
}
function choose(id,focus=false){
 const p=byId.get(id);if(!p)return;selected=p;state.selected=id;
 if(mode==='gallery'){const idx=filtered.findIndex(x=>x.id===id);if(idx>=0&&Math.floor(idx/gallerySize())!==page){page=Math.floor(idx/gallerySize());updateLayout();frameAll()}}
 $('detailData').hidden=false;$('detailKicker').textContent=p.info.categoryChinese;$('detailName').textContent=p.info.labelChinese;$('detailLocation').textContent=p.info.locationChinese;
 $('height').textContent=`${p.info.centerThree[1].toFixed(2)} m`;$('representation').textContent=p.info.representationChinese;
 $('coordinate').textContent=`模型坐标 X ${p.info.centerThree[0].toFixed(2)} · Y ${p.info.centerThree[1].toFixed(2)} · Z ${p.info.centerThree[2].toFixed(2)} m。编号：${p.info.id}`;
 $('caveat').textContent=p.info.caveatChinese??'教学几何，具体构造以工程图纸为准。';
 for(const b of $('partList').querySelectorAll('[data-id]'))b.setAttribute('aria-selected',String(b.dataset.id===id));
 for(const b of $('tileLabels').querySelectorAll('[data-id]'))b.setAttribute('aria-pressed',String(b.dataset.id===id));
 if(isolate)updateLayout();if(focus&&mode!=='gallery')focusSelection();
 $('sidebar').classList.remove('open');
}
function focusSelection(){
 if(!selected)return;
 const box=new T.Box3().setFromCenterAndSize(selected.targetPosition.clone(),selected.size.clone().multiply(selected.targetScale));
 cameraFit(box,1000,new T.Vector3(.9,.5,1.3).normalize());
}
function changeMode(next){mode=next;state.mode=mode;isolate=false;$('isolate').setAttribute('aria-pressed','false');
 if(mode==='gallery'){controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');$('rotate').textContent='自动环绕'}
 for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));resize(false);updateLayout();frameAll();
}
function reset(){
 selected=null;isolate=false;state.selected=null;controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');$('rotate').textContent='自动环绕';$('isolate').setAttribute('aria-pressed','false');
 $('search').value='';$('category').value='';$('zone').value='';$('detailData').hidden=true;$('detailKicker').textContent='构件观察';$('detailName').textContent='点选一处，仔细看。';$('detailLocation').textContent='从左侧名称进入，或直接点击模型。';
 filtered=[...data.parts];page=0;renderList();changeMode('whole');
}
makeOptions();renderList();
$('search').addEventListener('input',applyFilter);$('category').onchange=applyFilter;$('zone').onchange=applyFilter;
$('clearSearch').onclick=()=>{$('search').value='';applyFilter();$('search').focus()};
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>changeMode(b.dataset.mode);
$('shell').onclick=()=>{ghost=!ghost;$('shell').setAttribute('aria-pressed',String(ghost))};
$('rotate').onclick=()=>{tween=null;controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));$('rotate').textContent=controls.autoRotate?'停止环绕':'自动环绕'};
$('reset').onclick=reset;$('focus').onclick=focusSelection;$('isolate').onclick=()=>{if(!selected)return;isolate=!isolate;$('isolate').setAttribute('aria-pressed',String(isolate));updateLayout();if(isolate)focusSelection();else frameAll()};
$('prev').onclick=()=>{page=Math.max(0,page-1);updateLayout();frameAll()};$('next').onclick=()=>{page=Math.min(Math.ceil(filtered.length/gallerySize())-1,page+1);updateLayout();frameAll()};
$('menu').onclick=()=>{$('sidebar').classList.toggle('open')};
$('scope').onclick=()=>$('scopeDialog').showModal();$('closeScope').onclick=()=>$('scopeDialog').close();
controls.addEventListener('start',()=>{tween=null});
const ray=new T.Raycaster(),mouse=new T.Vector2();let down=null;
canvas.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});canvas.addEventListener('pointerup',e=>{
 if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
 const r=canvas.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(mouse,camera);
 const hit=ray.intersectObjects(selectable,false).find(h=>h.object.parent.visible&&(!h.object.material.userData.environment)&&(mode==='gallery'||!ghost||!h.object.material.userData.shell));
 if(hit)choose(hit.object.userData.part.info.id,false);
});
let resizeTimer;function resize(adapt=true){const w=viewWidth(),h=viewHeight();renderer.setSize(w,h,false);canvas.style.width=w+'px';canvas.style.height=h+'px';camera.aspect=w/h;camera.updateProjectionMatrix();clearTimeout(resizeTimer);if(adapt)resizeTimer=setTimeout(()=>{if(state.ready&&mode==='gallery'){page=0;updateLayout();frameAll()}},150)}
new ResizeObserver(()=>resize()).observe(stage);resize();
window.addEventListener('error',e=>state.errors.push(e.message));
async function load(){
 try{
  const encoded=$('modelData').textContent.trim(),binary=atob(encoded),buffer=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)buffer[i]=binary.charCodeAt(i);
  const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer.buffer,'',resolve,reject));gltf.scene.updateMatrixWorld(true);
  for(const info of data.parts){
   const source=gltf.scene.getObjectByName(info.meshName);if(!source){state.missing.push(info.id);continue}
   const bounds=new T.Box3(new T.Vector3(...info.bboxThree[0]).multiplyScalar(.01),new T.Vector3(...info.bboxThree[1]).multiplyScalar(.01));
   const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),group=new T.Group();group.name=info.id;group.position.copy(center);world.add(group);
   const explode=new T.Vector3(...info.explodeVectorThree).multiplyScalar(.01);
   const radial=new T.Vector3(center.x,0,center.z);if(radial.lengthSq()<.001)radial.set(1,0,0);radial.normalize();
   const zone=info.zone??0;
   if(info.category==='facades')explode.addScaledVector(radial,1.1);
   else if(info.category==='columns')explode.addScaledVector(radial,.3);
   else if(info.category==='outriggers'||info.category==='belts')explode.addScaledVector(radial,.15);
   explode.y+=(zone-1)*.075;
   if(info.category==='foundation')explode.y-=.15;
   const p={info,group,center,size,bounds,explode,meshes:[],startPosition:center.clone(),targetPosition:center.clone(),startScale:new T.Vector3(1,1,1),targetScale:new T.Vector3(1,1,1),startQuaternion:new T.Quaternion(),targetQuaternion:new T.Quaternion(),tileLabel:null};
   source.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01).translate(-center.x,-center.y,-center.z);geometry.computeBoundingSphere();
    const material=materialFor(Array.isArray(o.material)?o.material[0]:o.material,info),mesh=new T.Mesh(geometry,material);mesh.userData.part=p;group.add(mesh);p.meshes.push(mesh);selectable.push(mesh);
   });if(!p.meshes.length){state.missing.push(info.id);continue}parts.push(p);byId.set(info.id,p);
  }
  if(parts.length!==987||state.missing.length)throw Error(`构件完整性检查失败：读取${parts.length} / 987`);
  state.ready=true;state.loaded=parts.length;$('loading').hidden=true;$('modelData').remove();updateLayout();frameAll();
  window.__atlasActions={select:choose,mode:changeMode,reset,filter:applyFilter,allIds:()=>parts.map(p=>p.info.id),camera:()=>({position:camera.position.toArray(),target:controls.target.toArray()}),geometryStats:()=>({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,meshes:selectable.length})};
 }catch(e){state.errors.push(String(e));console.error(e);$('loading').innerHTML='<strong>模型未能打开</strong><span>请使用支持 WebGL 的最新版 Chrome 或 Edge。</span>';state.error=String(e)}
}
let last=performance.now();function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.05);last=now;
 if(tween){const a=tween.duration?easy((now-tween.at)/tween.duration):1;camera.position.lerpVectors(tween.p0,tween.p1,a);controls.target.lerpVectors(tween.t0,tween.t1,a);if(a>=1)tween=null}
 const a=reduced?1:easy((now-layoutTween)/950);
 for(const p of parts){if(!p.group.visible)continue;p.group.position.lerpVectors(p.startPosition,p.targetPosition,a);p.group.scale.lerpVectors(p.startScale,p.targetScale,a);p.group.quaternion.slerpQuaternions(p.startQuaternion,p.targetQuaternion,a);
  for(const mesh of p.meshes){const m=mesh.material;m.color.copy(m.userData.baseColor);m.emissive.set('#000000');if(p===selected){m.color.lerp(new T.Color('#c89144'),.6);m.emissive.set('#6e4923');m.emissiveIntensity=.14}if(m.userData.shell)m.opacity=p===selected?.82:ghost&&mode!=='gallery'?.13:.63;if(m.userData.environment)m.opacity=mode==='gallery'||p===selected?1:.23;}
  if(p.tileLabel){const position=p.group.position.clone();position.y-=.79;position.project(camera);p.tileLabel.style.left=`${(position.x+1)*viewWidth()/2}px`;p.tileLabel.style.top=`${(-position.y+1)*viewHeight()/2}px`;p.tileLabel.style.display=Math.abs(position.x)>1.1||Math.abs(position.y)>1.1||position.z>1?'none':'';}
 }
 controls.update(dt);renderer.render(scene,camera);
}
requestAnimationFrame(tick);load();
