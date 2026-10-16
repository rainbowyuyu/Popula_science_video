import * as THREE from 'three';
import {box,mesh,mat,line,ring,sphere,text} from './Primitives';
import {cue,phase,after,ease,clamp} from './Timeline';

const P={paper:'#f3dfb7',edge:'#c79a55',ink:'#102654',blue:'#163b83',deep:'#08152e',coral:'#e66b4e',gold:'#d5a65f',silver:'#8ba0bc',mint:'#91ceb9'};
type DynamicLabel={root:THREE.Mesh;set:(s:string,color?:string)=>void};
function writing(parent:THREE.Object3D,value:string,p:[number,number,number],width:number,height:number,color=P.ink):DynamicLabel{
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=Math.round(1440*height/width);const ctx=canvas.getContext('2d')!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const root=mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}),parent,p);root.castShadow=false;
  let previous='',previousColor='';
  const set=(s:string,c=color)=>{if(s===previous&&c===previousColor)return;previous=s;previousColor=c;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c;let size=canvas.height*.77;ctx.font=`600 ${size}px "Microsoft YaHei", Arial, sans-serif`;const w=ctx.measureText(s).width;if(w>canvas.width*.94){size*=canvas.width*.94/w;ctx.font=`600 ${size}px "Microsoft YaHei", Arial, sans-serif`;}ctx.fillText(s,canvas.width/2,canvas.height*.53);texture.needsUpdate=true;};set(value);return{root,set};
}

export class IdentityRoom{
  root=new THREE.Group();
  private animate:(seconds:number)=>void;
  constructor(){
    const g=this.root;g.name='identity-paper-and-signature-room';
    g.userData.evidence='Illustrative certificate chain and signed handshake; no live CA/TLS verification is claimed.';
    // A dark brass-edged mechanical shelf, never a white presentation podium.
    box(g,15.5,.32,7.0,P.deep,[0,-3.32,-.8],.14);
    box(g,15.5,.045,.08,P.gold,[0,-3.12,2.70],.016);
    box(g,15.3,1.10,.16,P.deep,[0,-3.60,2.74],.04);
    for(const x of[-6.8,6.8])box(g,.18,7.0,.36,P.blue,[x,.10,-2.42],.05);
    box(g,13.9,.18,.36,P.blue,[0,3.52,-2.42],.05);
    const light=new THREE.PointLight('#ffd2a0',65,16,2);light.position.set(-2,3,3.8);g.add(light);
    const cold=new THREE.PointLight('#719eff',40,15,2);cold.position.set(5,1,2);g.add(cold);

    const cert=new THREE.Group();cert.name='website-certificate';cert.position.set(-2.45,-.15,.25);g.add(cert);
    box(cert,4.55,5.35,.045,P.paper,[0,0,0],.035);
    for(const[x,y,w,h]of[[0,2.40,4.10,.035],[0,-2.40,4.10,.035],[-2.05,0,.035,4.8],[2.05,0,.035,4.8]])box(cert,w,h,.014,P.gold,[x,y,.034],.007);
    writing(cert,'meet.test',[0,1.45,.055],3.85,1.05);
    writing(cert,'身份公钥',[0,.15,.055],3.30,.96);
    const publicIdentity=new THREE.Group();publicIdentity.name='public-identity-key-medallion';publicIdentity.position.set(0,-1.22,.10);cert.add(publicIdentity);
    ring(publicIdentity,.64,P.gold,[0,0,0],.095);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;box(publicIdentity,.14,.24,.07,P.blue,[.50*Math.sin(a),.50*Math.cos(a),.045],.025);}
    sphere(publicIdentity,.10,P.blue,[0,0,.06]);
    const certApproved=line(cert,[[1.03,-1.86,.08],[1.23,-2.03,.08],[1.60,-1.64,.08]],P.mint,.065);
    const requesting=new THREE.Group();requesting.name='requested-domain-match';g.add(requesting);
    box(requesting,4.20,1.14,.15,P.deep,[0,0,0],.13);
    writing(requesting,'meet.test',[0,0,.09],3.85,1.05,P.paper);
    const matchBracket=line(g,[[-4.35,1.48,.67],[-4.55,1.48,.67],[-4.55,.93,.67],[-4.35,.93,.67]],P.gold,.028);
    // Three staggered issuer papers live above the main certificate and fan out.
    const chain:THREE.Group[]=[],chainSeals:THREE.Mesh[]=[],chainLines:THREE.Mesh[]=[];
    for(let i=0;i<3;i++){
      const sheet=new THREE.Group();sheet.name=`issuer-certificate-${i}`;g.add(sheet);chain.push(sheet);
      box(sheet,1.56,1.18,.035,P.paper,[0,0,0],.025);
      box(sheet,1.26,.025,.012,P.gold,[0,.39,.025],.005);
      const seal=ring(sheet,.22,i===0?P.mint:P.gold,[0,-.05,.045],.045);chainSeals.push(seal);
      line(sheet,[[-.13,-.03,.075],[-.03,-.14,.075],[.15,.10,.075]],P.blue,.032);
    }
    for(let i=0;i<3;i++)chainLines.push(line(g,[[i===2?.9:-3.1+i*2,2.92,-.1],[i===2?-1.2:-2.1+i*2,2.70,.06],[i===2?-2.45:-1.1+i*2,i===2?2.45:2.92,.15]],P.gold,.028));

    // Signature machine: guide rails, a recessed platen, and a brass stamp whose
    // front pattern matches the public identity medallion.
    const machine=new THREE.Group();machine.name='signature-verification-machine';machine.position.set(3.45,-.25,0);g.add(machine);
    box(machine,4.45,4.75,.68,P.deep,[0,0,-.64],.23);
    box(machine,4.20,.13,.88,P.gold,[0,-2.15,-.27],.06);
    for(const x of[-1.81,1.81]){
      const rod=mesh(new THREE.CylinderGeometry(.075,.075,3.80,32),mat(P.silver,.85,.22),machine,[x,.08,-.1]);rod.name='stamp-guide-rail';
      box(machine,.25,.30,.28,P.gold,[x,1.83,-.11],.04);
    }
    const cap=box(machine,3.85,.22,.54,P.blue,[0,1.88,-.11],.08);
    writing(machine,'秘密钥匙',[0,1.27,.02],3.36,.97,P.paper);
    const platen=box(machine,3.75,2.00,.10,P.blue,[0,-.53,-.20],.13);
    const record=new THREE.Group();record.name='same-handshake-transcript';machine.add(record);
    box(record,3.48,1.90,.06,P.paper,[0,0,0],.045);
    const digits=writing(record,'8  ·  19',[-.35,.25,.05],2.53,.88);
    writing(record,'本次记录',[-.36,-.57,.05],2.60,.63);
    const signature=new THREE.Group();signature.name='signature-of-original-transcript';signature.position.set(1.15,-.26,.11);record.add(signature);
    const wax=mesh(new THREE.CylinderGeometry(.39,.39,.055,48),mat(P.gold,.48,.3),signature);wax.rotation.x=Math.PI/2;
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;box(signature,.08,.14,.03,P.blue,[.26*Math.sin(a),.26*Math.cos(a),.04],.016);}
    const stamp=new THREE.Group();stamp.name='locally-held-secret-stamp';machine.add(stamp);
    const plate=mesh(new THREE.CylinderGeometry(.43,.43,.16,64),mat(P.gold,.75,.25),stamp);plate.rotation.x=Math.PI/2;
    const shaft=mesh(new THREE.CylinderGeometry(.18,.24,.49,32),mat(P.silver,.85,.24),stamp,[0,0,.31]);shaft.rotation.x=Math.PI/2;
    const knob=sphere(stamp,.39,P.blue,[0,0,.63]);knob.scale.set(1,.78,.75);
    const scan=box(machine,.04,1.58,.035,P.gold,[-1.65,-.54,.34],.01);
    const verification=new THREE.Group();verification.name='verification-indicator';verification.position.set(0,-1.79,.22);machine.add(verification);
    const status=writing(verification,'验签',[0,0,.10],3.25,.82,P.paper);
    const editedMark=box(record,1.02,.045,.014,P.coral,[.48,-.16,.065],.012);
    const rejectionTrack=line(machine,[[-.05,-2.30,.18],[.8,-2.45,.32],[2.3,-2.55,.44],[4.6,-2.75,.6]],P.coral,.036);
    const merchantBoundary=writing(machine,'身份 ≠ 人品',[0,.05,.22],3.45,.90,P.paper);
    const sealColor=(i:number,color:string)=>{(chainSeals[i].material as THREE.MeshPhysicalMaterial).color.set(color);};
    const lerp=(a:number,b:number,u:number)=>a+(b-a)*ease(clamp(u));
    this.animate=(t:number)=>{
      const p17=phase('s17',t),p18=phase('s18',t),p19=phase('s19',t),p20=phase('s20',t),p21=phase('s21',t);
      const before19=t<cue('s19').startSec;
      cert.rotation.y=-.06+.025*Math.sin(t*.18);cert.rotation.z=.012*Math.sin(t*.21);
      // Domain plaque docks against the certificate then slides into its upper
      // paper sleeve. The printed domain underneath remains the single anchor.
      const dock=ease(p17/.46),stow=ease((p17-.65)/.25);
      requesting.position.set(lerp(3.45,-2.45,dock),lerp(.15,1.30,dock),lerp(1.1,.42,dock)-.58*stow);
      requesting.rotation.y=-.06*dock;
      matchBracket.geometry.setDrawRange(0,Math.floor(matchBracket.geometry.index!.count*ease((p17-.30)/.22)/3)*3);
      const fan=ease(p18/.34),verify=ease((p18-.38)/.48);
      for(let i=0;i<3;i++){
        chain[i].position.set(-2.60+lerp(i*.18,i*1.55,fan),3.08-i*.06,-.48+i*.13);
        chain[i].rotation.z=lerp(-.04+i*.025,(i-1)*-.075,fan);
        sealColor(i,verify>(i+.35)/3?P.mint:P.gold);
        const count=chainLines[i].geometry.index!.count;chainLines[i].geometry.setDrawRange(0,Math.floor(count*ease((p18-.31-i*.12)/.14)/3)*3);
      }
      const certTrust=ease((p18-.70)/.22);certApproved.geometry.setDrawRange(0,Math.floor(certApproved.geometry.index!.count*certTrust/3)*3);
      // The same sheet waits behind the solid machine, rises through the top
      // feed, clears its body, then settles onto the platen. It is never parked
      // under the visible shelf where the paper could leak into earlier shots.
      const rise=ease(p19/.10),turn=ease((p19-.10)/.06),feed=ease((p19-.16)/.15);
      const press=ease((p19-.36)/.12)*(1-ease((p19-.55)/.14)),signed=ease((p19-.47)/.10);
      record.position.set(0,lerp(-.53,3.43,rise)-3.96*feed,lerp(-1.12,.16,turn));
      stamp.position.set(1.15,-.79,lerp(1.23,.39,press));
      const depart=ease((p20-.76)/.22);record.position.x=22*depart;record.position.y-=2.2*ease((depart-.45)/.55);
      // The stamp impression slides from beneath the original paper seam to its
      // fixed position and then stays unchanged while the transcript is edited.
      signature.position.z=-.10+.21*signed;
      const edited=ease((p20-.29)/.12);digits.set(edited>.5?'8  ·  17':'8  ·  19',edited>.5?P.coral:P.ink);
      editedMark.position.z=-.06+.13*edited;
      const check=ease((p19-.65)/.27),recheck=ease((p20-.44)/.25);
      scan.position.x=before19?-1.65:lerp(-1.65,1.65,p20>0?recheck:check);
      scan.position.z=.24+.09*(p20>0?recheck:check);
      const rejected=p20>=.66;
      status.set(rejected?'×  拒绝连接':check>.98?'✓  签名匹配':'核对签名',rejected?P.coral:check>.98?P.mint:P.paper);
      if(p20>0&&p20<.66)status.set('改过的记录',P.paper);
      const rc=rejectionTrack.geometry.index!.count;rejectionTrack.geometry.setDrawRange(0,Math.floor(rc*ease((p20-.66)/.13)/3)*3);
      // A short inscription occupies the vacated platen, never the certificate
      // or subtitle lane. Its gentle ink reveal is separate from set motion.
      (merchantBoundary.root.material as THREE.MeshBasicMaterial).opacity=ease(p21/.23);
      if(p21>0)status.set('核对的是身份',P.mint);
      publicIdentity.rotation.z=.02*Math.sin(t*.20);
    };
    this.update(0);
  }
  update(t:number):void{this.animate(t);}
  dispose():void{
    const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.root.traverse(o=>{if(o instanceof THREE.Mesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);const map=(m as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}}});
    geos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());this.root.removeFromParent();this.root.clear();
  }
}
