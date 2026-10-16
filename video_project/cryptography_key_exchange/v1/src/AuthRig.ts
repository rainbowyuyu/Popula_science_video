import * as T from 'three';
import {C,box,mesh,mat,line,ring,sphere,pedestal} from './Primitives';
import {phase,after,ease,clamp,cue} from './Timeline';

// Tight glyph bounds keep four Chinese characters readable at the actual lens.
function text(parent:T.Object3D,value:string,pos:number[],width:number,color:string,_height=.8){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
  ctx.font='600 160px "Microsoft YaHei", Arial, sans-serif';
  canvas.width=Math.ceil(ctx.measureText(value).width+40);canvas.height=224;
  ctx.font='600 160px "Microsoft YaHei", Arial, sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,canvas.width/2,116);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const o=mesh(new T.PlaneGeometry(width,width*224/canvas.width),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false}),parent,pos);o.castShadow=false;return o;
}

/** A single handshake record is stamped, checked, modified, then rejected. */
export function buildAuthRig(g:T.Group):(t:number)=>void{
  const rig=new T.Group();rig.name='identity-authentication-rig';g.add(rig);
  pedestal(rig,0,4.8);
  const rail=line(rig,[[-4.5,-1.68,.65],[-1.7,-1.68,.65],[1.5,-1.68,.65],[4.4,-1.68,.65]],'#b8c6ba',.035);
  rail.name='handshake-record-track';
  line(rig,[[-3.7,-1.68,.65],[-4.4,-1.75,.8],[-5.8,-1.92,.9],[-8.8,-1.92,.9]],'#ba9a88',.028).name='rejected-record-side-track';

  const cert=new T.Group();cert.name='domain-public-key-certificate';cert.position.set(-2.45,.52,-.28);rig.add(cert);
  box(cert,3.35,2.85,.14,'#e8e4d6',[0,0,0],.12);
  box(cert,3.17,2.67,.05,'#faf5e8',[0,0,.09],.08);
  box(cert,3.17,.79,.055,C.teal,[0,.94,.14],.05);
  const domain=text(cert,'cake.test',[0,.94,.185],2.91,'#fff8e9',.82);domain.name='certificate-domain';
  // An identity key has a three-notched medallion, unlike the session key prop.
  const publicKey=new T.Group();publicKey.name='identity-public-key';publicKey.position.set(0,.06,.18);cert.add(publicKey);
  ring(publicKey,.36,C.gold,[0,0,0],.074);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;box(publicKey,.12,.19,.06,C.teal,[.30*Math.sin(a),.30*Math.cos(a),.025],.022);}
  sphere(publicKey,.075,C.teal,[0,0,.025]);
  text(cert,'身份公钥',[0,-.80,.18],2.46,C.ink,.85);
  const binding=line(cert,[[-.55,.63,.16],[-.55,.11,.16],[-.43,.03,.16]],C.gold,.028);
  const verifiedSeal=ring(cert,.24,C.teal,[1.17,-.89,.19],.042);
  const certTick=line(cert,[[1.04,-.89,.22],[1.14,-1.00,.22],[1.31,-.77,.22]],C.teal,.035);

  // Browser's requested domain reaches and aligns with the same name on the certificate.
  const requested=new T.Group();requested.name='requested-domain';rig.add(requested);
  box(requested,3.40,.79,.14,'#f9f5e8',[0,0,0],.10);
  text(requested,'cake.test',[0,0,.09],2.91,C.ink,.82);
  const requestedOutline=ring(requested,.15,C.gold,[-1.45,0,.11],.022);
  requestedOutline.scale.set(.6,.6,.6);

  // Trust progresses through the issuer chain into the certificate; no assertion
  // is made that a trustworthy CA guarantees the merchant's product quality.
  const chain=new T.Group();chain.name='certificate-issuer-chain';rig.add(chain);
  const chainNodes:T.Mesh[]=[];const chainLinks:T.Mesh[]=[];
  for(let i=0;i<3;i++){
    const x=-3.68+i*1.22;
    chainNodes.push(ring(chain,.17,C.metal,[x,2.27,-.38],.047));
    if(i<2)chainLinks.push(line(chain,[[x+.19,2.27,-.38],[x+.61,2.27,-.38],[x+1.03,2.27,-.38]],C.metal,.032));
  }
  chainLinks.push(line(chain,[[-1.24,2.27,-.38],[-.83,2.09,-.38],[-.83,1.60,-.28]],C.metal,.032));

  const stamp=new T.Group();stamp.name='website-identity-private-stamp';rig.add(stamp);
  const stampFoot=mesh(new T.CylinderGeometry(.45,.45,.16,48),mat(C.gold,.72,.27),stamp,[0,0,0]);stampFoot.rotation.x=Math.PI/2;
  const stem=mesh(new T.CylinderGeometry(.15,.22,.45,36),mat('#738f83',.58,.29),stamp,[0,0,.27]);stem.rotation.x=Math.PI/2;
  const knob=sphere(stamp,.36,C.teal,[0,0,.56]);knob.scale.set(1,.85,.74);
  ring(stamp,.36,'#e6cb91',[0,0,-.09],.031);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;box(stamp,.10,.15,.04,'#e8d6a5',[.29*Math.sin(a),.29*Math.cos(a),-.11],.018);}
  const stampLabel=text(rig,'身份私钥',[2.43,1.55,0],2.8,C.ink,.87);
  const stampDock=mesh(new T.CylinderGeometry(.73,.77,.11,48),mat('#d1dacf',.25,.44),rig,[2.43,-1.62,.34]);
  stampDock.name='local-signing-dock';

  const record=new T.Group();record.name='same-handshake-record-anchor';rig.add(record);
  box(record,2.06,1.14,.15,'#f8f2e0',[0,0,0],.08);
  box(record,2.06,.37,.17,C.teal,[0,.38,.015],.045);
  text(record,'本次握手',[0,.38,.115],1.90,'#fff7e6',.65);
  const recordBars:T.Mesh[]=[];
  for(let i=0;i<3;i++)recordBars.push(box(record,.98-i*.12,.075,.03,'#94b2a4',[-.28,-.03-i*.17,.1],.018));
  const dataCell=box(record,.28,.28,.04,C.gold,[.65,-.03,.11],.035);
  // Signature stays attached to the record when its bytes change; it does not
  // automatically update to endorse the modified transcript.
  const signature=new T.Group();signature.name='signature-bound-to-original-record';signature.position.set(.63,-.31,.15);record.add(signature);
  ring(signature,.18,C.gold,[0,0,0],.048);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;box(signature,.055,.081,.025,C.teal,[.14*Math.sin(a),.14*Math.cos(a),.035],.01);}
  sphere(signature,.034,C.teal,[0,0,.04]);
  const tamperTool=new T.Group();tamperTool.name='adversary-record-edit';rig.add(tamperTool);
  box(tamperTool,.40,.34,.14,C.rose,[0,0,0],.06);
  line(tamperTool,[[-.12,-.08,.1],[.12,.08,.1]],'#fff0d9',.035);

  const verifier=new T.Group();verifier.name='browser-signature-checker';verifier.position.set(-4.68,-1.15,1.04);rig.add(verifier);
  const verifierFrame=ring(verifier,.56,C.metal,[0,0,0],.060);
  const proofGood=line(verifier,[[-.25,0,.09],[-.06,-.19,.09],[.31,.23,.09]],C.teal,.065);
  const proofBad=new T.Group();proofBad.name='signature-rejected-cross';verifier.add(proofBad);
  line(proofBad,[[-.21,-.21,.10],[.21,.21,.10]],C.rose,.065);
  line(proofBad,[[-.21,.21,.10],[.21,-.21,.10]],C.rose,.065);

  const cake=new T.Group();cake.name='merchant-quality-separate-question';rig.add(cake);
  mesh(new T.CylinderGeometry(.80,.80,.09,56),mat('#e9dfc4',.1,.35),cake,[0,-.75,0]);
  mesh(new T.CylinderGeometry(.61,.61,.56,56),mat('#c8a373',0,.53),cake,[0,-.43,0]);
  mesh(new T.CylinderGeometry(.63,.63,.10,56),mat('#fff1cf',0,.38),cake,[0,-.12,0]);
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const icing=sphere(cake,.095,'#fff1cf',[.43*Math.cos(a),-.015,.43*Math.sin(a)]);icing.scale.y=.74;}
  sphere(cake,.13,C.rose,[0,.03,0]);
  text(cake,'品质？',[0,.95,.25],2.8,C.ink,1.0);
  const identityOnly=text(rig,'身份已核对',[-2.45,-1.20,.7],3.0,C.teal,.9);
  const signatureGood=text(rig,'签名通过',[0,-1.48,1.1],2.7,C.teal,.86);
  const signatureBad=text(rig,'签名不符',[0,-1.48,1.1],2.7,C.rose,.86);

  const setColor=(o:T.Mesh,color:string)=>{(o.material as T.MeshPhysicalMaterial).color.set(color);};
  const lerp=(a:number,b:number,u:number)=>a+(b-a)*ease(clamp(u));
  return(t:number)=>{
    const p28=phase('c28',t),p29=phase('c29',t),p30=phase('c30',t),p31=phase('c31',t);
    const before28=t<cue('c28').startSec,before29=t<cue('c29').startSec;
    const reveal=ease(p28*2.4),bind=ease((p28-.12)/.30),trust=ease((p28-.43)/.42);
    cert.rotation.y=lerp(.19,-.10,reveal);
    requested.position.set(lerp(2.45,-2.45,bind),lerp(.65,1.46,bind),lerp(.35,.04,bind));
    // The two domain plaques meet at the same plane; hiding the rear glyph after
    // occlusion prevents overlapping text while preserving the visible request.
    domain.visible=bind<.96;
    requested.rotation.y=cert.rotation.y*bind;
    requested.scale.setScalar(1);
    binding.scale.y=.02+.98*reveal;
    verifiedSeal.scale.setScalar(.02+.98*trust);certTick.scale.setScalar(.02+.98*trust);
    chainNodes.forEach((n,i)=>setColor(n,trust>(i+.3)/3?C.teal:C.metal));
    chainLinks.forEach((n,i)=>setColor(n,trust>(i+.65)/3?C.teal:C.metal));
    const stampArrival=ease((p28-.62)/.38);
    stampLabel.position.x=lerp(20,2.43,stampArrival);
    let sx=lerp(20,2.43,stampArrival),sy=.15,sz=.5;
    let rx=-20,ry=-6,rz=.81;
    let signed=0,good=0,bad=0,edited=0;
    if(!before29){
      const arrive=ease(p29/.29),depart=ease((p29-.53)/.34);
      rx=lerp(-20,2.43,arrive);ry=lerp(-1.22,-.78,arrive);
      rx=lerp(rx,-3.65,depart);ry=lerp(ry,-1.20,depart);
      rz=.81;
      const press=ease((p29-.30)/.10)*(1-ease((p29-.45)/.10));
      sx=2.43;sy=lerp(.15,-.78,arrive);sz=lerp(lerp(.5,1.48,arrive),1.04,press);
      sy=lerp(sy,.15,depart);sz=lerp(sz,.5,depart);
      signed=ease((p29-.40)/.10);good=ease((p29-.87)/.09);
    }
    if(t>=cue('c30').startSec){
      const expose=ease(p30/.22),returnToGate=ease((p30-.32)/.25),reject=ease((p30-.67)/.27);
      rx=lerp(-3.65,-.15,expose);ry=lerp(-1.20,-.66,expose);
      rx=lerp(rx,-3.65,returnToGate);ry=lerp(ry,-1.20,returnToGate);
      rx=lerp(rx,-20,reject);ry=lerp(ry,-1.92,reject);
      edited=ease((p30-.20)/.09);signed=1;good=1-ease(p30/.20);bad=ease((p30-.55)/.05);
      sx=2.43;sy=.15;sz=.5;
    }
    const ending=ease(p31/.45);
    sx=lerp(sx,20,ending);stampLabel.position.x=lerp(stampLabel.position.x,20,ending);
    stamp.position.set(sx,sy-6*ease((ending-.62)/.38)-6*(1-stampArrival),sz);stamp.rotation.set(0,-.10,0);
    stampLabel.position.y=1.55-8*ease((ending-.62)/.38)-8*(1-stampArrival);
    record.position.set(rx,ry,rz);record.rotation.set(-.04,.04*Math.sin(t*.3),0);
    signature.scale.setScalar(.001+.999*signed);
    setColor(dataCell,edited>.5?C.rose:C.gold);
    recordBars[1].position.x=-.28+.22*edited;setColor(recordBars[1],edited>.5?C.rose:'#94b2a4');
    const editIn=ease((p30-.05)/.13),editOut=ease((p30-.28)/.14);
    tamperTool.position.set(lerp(20,.51,editIn)+20*editOut,-.55-7*(1-editIn)-7*ease((editOut-.55)/.45),1.08);
    proofGood.scale.setScalar(.001+.999*good);proofBad.scale.setScalar(.001+.999*bad);
    setColor(verifierFrame,bad>.5?C.rose:good>.5?C.teal:C.metal);
    verifier.position.x=lerp(-4.68,-20,ending);
    cake.position.set(lerp(22,2.65,ending),-.18,0);
    cake.rotation.y=-.12+.03*Math.sin(t*.24);
    identityOnly.position.x=lerp(-20,-2.45,ending);
    identityOnly.position.y=t<cue('c31').startSec?-6:-1.20;
    const goodIn=ease((p29-.87)/.09),goodOut=ease(p30/.12);
    signatureGood.position.set(lerp(-20,0,goodIn)-20*goodOut,-1.48,1.1);
    signatureGood.position.y=before29?-6:-1.48;
    const badIn=ease((p30-.55)/.12),badOut=ease(p31/.17);
    signatureBad.position.set(lerp(-20,0,badIn)-20*badOut,-1.48,1.1);
    signatureBad.position.y=t<cue('c30').startSec?-6:-1.48;
    // The quality question enters from offscreen; the checked certificate remains.
    stampDock.scale.setScalar(1);
  };
}
