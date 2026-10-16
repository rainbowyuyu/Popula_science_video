import timeline from './timeline-v01.json';
import * as M from './ChemistryMechanismsV01';
import {drawChiralPair,drawCrystalSorting} from './OpusChemistryV01';
export type State={frame:number;time:number;clipId:string;scene:string;elapsed:number;progress:number;seconds:number};
const clips=timeline.clips as any[];
type V3=[number,number,number];
function stereo(c:CanvasRenderingContext2D,x:number,y:number,t:number,mirror:boolean,scale=1,alpha=1){
 const angle=t*.22,base:V3[]=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
 const names=['OH','COOH','CH₃','H'];const colors=[M.C.rose,M.C.violet,M.C.gold,M.C.ink];
 const pts=base.map((p,i)=>{const xx=p[0]*(mirror?-1:1),yy=p[1]*.86+p[2]*.18,zz=p[2]*.86-p[1]*.18;const rx=xx*Math.cos(angle)+zz*Math.sin(angle),rz=-xx*Math.sin(angle)+zz*Math.cos(angle),f=680/(680+rz*83);return {i,x:x+rx*96*scale*f,y:y+yy*96*scale*f,z:rz,r:23*scale*f}}).sort((a,b)=>b.z-a.z);
 c.save();c.globalAlpha*=alpha;M.halo(c,x,y,235*scale,mirror?M.C.cyan:M.C.gold,.07);
 for(const p of pts.filter(p=>p.z>0)){M.cylinder(c,[x,y],[p.x,p.y],8*scale);M.ball(c,p.x,p.y,p.r,colors[p.i]);M.text(c,names[p.i],p.x,p.y+p.r+22,22*scale,M.C.ink,'center')}
 M.ball(c,x,y,32*scale,M.C.ink);M.text(c,'C',x,y,22*scale,M.C.dark,'center',700);
 for(const p of pts.filter(p=>p.z<=0)){M.cylinder(c,[x,y],[p.x,p.y],8*scale);M.ball(c,p.x,p.y,p.r,colors[p.i]);M.text(c,names[p.i],p.x,p.y+p.r+22,22*scale,M.C.ink,'center')}
 c.restore();
}
function mirror(c:CanvasRenderingContext2D,s:State){const q=M.ease((s.progress-.35)/.35),sep=440-180*Math.sin(q*Math.PI);stereo(c,960-sep,580,s.elapsed,false,1.4);stereo(c,960+sep,580,-s.elapsed,true,1.4);c.save();const g=c.createLinearGradient(940,350,985,810);g.addColorStop(0,'rgba(185,226,230,.01)');g.addColorStop(.55,'rgba(185,226,230,.14)');g.addColorStop(1,'rgba(185,226,230,.02)');c.fillStyle=g;c.beginPath();c.moveTo(934,355);c.lineTo(991,377);c.lineTo(991,833);c.lineTo(934,811);c.closePath();c.fill();c.restore();M.text(c,'镜像 A',450,841,29,M.C.gold,'center');M.text(c,'镜像 B',1470,841,29,M.C.cyan,'center')}
function optics(c:CanvasRenderingContext2D,s:State){const t=s.elapsed,p=s.progress;for(let side=0;side<2;side++){const x=510+side*880;const col=side?M.C.cyan:M.C.gold;M.glass(c,x,725,225,250,.66,col);for(let i=0;i<5;i++){const a=i*1.2+t*.16;M.ligand(c,x+Math.cos(a)*52,600+Math.sin(a)*50,.4,side?-1:1,a*.05)}M.path(c,[[x-345,597],[x+325,597]],col,3,.4);const angle=(side?1:-1)*M.ease((p-.4)/.3)*.75;for(let j=0;j<20;j++){const u=(t*.3+j/20)%1;const xx=x-340+u*655;const a=xx>x?angle:0;M.path(c,[[xx,597-43*Math.cos(a)],[xx,597+43*Math.cos(a)]],col,1.2,.1+.3*u)}c.save();c.translate(x+290,597);c.scale(.46,1);c.rotate(angle);M.path(c,[[0,-90],[0,90]],col,6);c.restore();M.text(c,side?'偏振方向向左旋':'偏振方向向右旋',x,825,29,col,'center')}M.text(c,'1848 · Louis Pasteur',950,370,30,M.C.muted,'center')}
type SceneDrawer=(c:CanvasRenderingContext2D,s:State)=>void;
let extPair:SceneDrawer|undefined,extOptics:SceneDrawer|undefined;
export function setOpusDrawers(pair:SceneDrawer,optics:SceneDrawer){extPair=pair;extOptics=optics}
setOpusDrawers((c,s)=>drawChiralPair(c,s.elapsed,s.progress,100,330,1720,560),(c,s)=>drawCrystalSorting(c,s.elapsed,s.progress,100,330,1720,560));
// Visual milestones use the measured subtitle/utterance cue, not an unrelated
// repeating three-second loop. Unchanged objects retain their frame time.
const anchors:Record<string,Array<[string,number]>>={
 mirror:[['四种不同',.18],['照一面镜子',.34],['两个基团',.55],['剩下两个',.72],['叫作对映体',.88]],
 pasteur:[['分拣',.08],['各自溶',.57],['偏振光',.72],['另一瓶',.9]],
 kagan:[['四份配体',.2],['两两',.31],['三种组合',.56],['比例大约',.78]],
 nonlinear:[['很少参与',.04],['九比一',.26],['九成',.4],['对映体过量',.53],['百分之八十',.83]],
 soai:[['二异丙基锌',.12],['生成手性醇',.36],['锌醇盐',.49],['1995',.63],['百分之八十七',.86]],
 chance:[['三十七次',.32],['十八次',.58],['十九次',.78]],
 result:[['零点',.05],['三轮',.13],['五十七',.25],['百分之九十九，',.37],['九十九点五',.51],['注意',.78]]
};
function wordCue(clip:any,phrase:string):number|undefined{
 const norm=(s:string)=>s.replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
 let all='';const starts:number[]=[];
 for(const w of clip?.wordTimings??[]){const token=norm(w.text);all+=token;for(const _ of token)starts.push(w.start)}
 const at=all.indexOf(norm(phrase));return at>=0?starts[at]:undefined;
}
function semantic(s:State):State{const rows=anchors[s.scene];if(!rows)return s;const clip=clips.find(c=>c.id===s.clipId);const nodes:[number,number][]=[[0,0]];for(const [phrase,p] of rows){const time=wordCue(clip,phrase)??clip?.subtitleParts?.find((v:any)=>v.text.includes(phrase))?.start;const tt=Math.max(0,(time??0)-.25);if(time!==undefined&&tt>nodes[nodes.length-1][0]+.05)nodes.push([tt,p])}nodes.push([clip?.audioSeconds??s.seconds,1]);let p=s.progress;for(let i=1;i<nodes.length;i++){if(s.elapsed<=nodes[i][0]){const a=nodes[i-1],b=nodes[i];p=M.mix(a[1],b[1],M.sat((s.elapsed-a[0])/Math.max(.01,b[0]-a[0])));break}}return {...s,progress:p}}

function draw(c:CanvasRenderingContext2D,s:State){const t=s.elapsed,p=s.progress;switch(s.scene){case'hook':case'mirror':(extPair??mirror)(c,s);break;case'award':M.award(c,t,p);break;case'pasteur':(extOptics??optics)(c,s);break;case'life':M.life(c,t,p);break;case'frank':M.frank(c,t,p);break;case'kagan':M.kagan(c,t,p);break;case'nonlinear':M.nonlinear(c,t,p,{ratio:cue(s,'九比一',.24),ee:cue(s,'对映体过量',.44),result:cue(s,'百分之八十',.73)});break;case'soai':M.soai(c,t,p,cue(s,'百分之八十七',.8));break;case'autocatalysis':M.feedback(c,t,p);break;case'chance':M.chance(c,t,p);break;case'result':M.amplification(c,t,p,[cue(s,'零点',.24),cue(s,'五十七',.44),cue(s,'百分之九十九',.49),cue(s,'九十九点五',.56)]);break;case'tool':M.toolsScene(c,t,p);break;case'papers':break;default:M.coda(c,t,p)}}
export class ChemistryWorldV01{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;constructor(canvas:HTMLCanvasElement){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false})!}render(s:State){const c=this.ctx;c.clearRect(0,0,1920,1080);M.labGround(c,s.time);const a=M.ease(s.elapsed/.65)*(1-M.ease((s.elapsed-s.seconds+.42)/.42));c.save();c.beginPath();c.rect(95,324,1730,580);c.clip();c.globalAlpha=a;draw(c,semantic(s));c.restore()}}
export function stateAt(frame:number):State{const n=Math.max(0,Math.min(timeline.duration-1,frame));let clip=clips[0];for(const x of clips){if(x.start<=n)clip=x;else break}const elapsed=Math.max(0,n-clip.start)/30;const next=clips[clips.indexOf(clip)+1];const seconds=((next?.start??timeline.duration)-clip.start)/30;return {frame:n,time:n/30,clipId:clip.id,scene:clip.scene,elapsed,seconds,progress:Math.min(1,elapsed/Math.max(.1,clip.audioSeconds??seconds))}}
export function cue(state:State,phrase:string,fallback:number){const clip=clips.find(c=>c.id===state.clipId);return wordCue(clip,phrase)??clip?.subtitleParts?.find((p:any)=>p.text.includes(phrase))?.start??fallback*state.seconds}
