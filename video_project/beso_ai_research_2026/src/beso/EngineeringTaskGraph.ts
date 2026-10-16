import * as T from 'three';

export type EngineeringNode={id:string;label:string;position:T.Vector3;object:T.Group;status:'waiting'|'running'|'reviewed';input:string;output:string;log:string};
const nodeSpec=[
  ['requirements','目标与约束',[-64,39,14],'brief.json','parameters.json'],
  ['geometry','Geometry',[-43,53,-10],'parameters.json','native-model.json'],
  ['mesh','Mesh',[-12,57,-25],'native-model.json','mesh.inp'],
  ['beso','BESO',[21,53,-19],'mesh.inp','iteration-states'],
  ['zwind','Z-wind',[50,39,7],'platform+load','saved-response.json'],
  ['results','结果解析',[35,23,34],'saved-response.json','metrics.json'],
  ['feedback','失败反馈',[3,24,38],'solver.log','next-task.json'],
  ['review','工程师复查',[-30,22,32],'metrics+logs','review-report'],
] as const;

/** A three-dimensional tool-routing illustration. Files describe existing
 * product concepts; animated packets are visual accents, not live execution. */
export class EngineeringTaskGraph{
  readonly group=new T.Group();
  readonly nodes:EngineeringNode[]=[];
  private connections:{curve:T.CatmullRomCurve3;mesh:T.Mesh;packet:T.Mesh}[]=[];
  constructor(){
    this.group.name='AI Engineer / spatial task routing diagram';
    this.group.userData={illustrative:true,liveExecution:false};
    for(const [i,spec]of nodeSpec.entries()){
      const[id,label,p,input,output]=spec;
      const object=new T.Group();object.name=`AI Engineer task / ${id}`;object.position.set(p[0],p[1],p[2]);object.userData={id,label,input,output};
      const core=new T.Mesh(new T.IcosahedronGeometry(2.0,2),new T.MeshPhysicalMaterial({color:'#a4d7d3',roughness:.21,metalness:.32,clearcoat:.7,clearcoatRoughness:.25}));
      core.castShadow=true;object.add(core);
      const hoop=new T.Mesh(new T.TorusGeometry(3.2,.17,8,40),new T.MeshBasicMaterial({color:i===6?'#bd7953':'#318b98',transparent:true,opacity:.6}));
      hoop.rotation.x=.4+i*.2;hoop.rotation.y=i*.4;object.add(hoop);
      this.group.add(object);this.nodes.push({id,label,position:object.position,object,status:'waiting',input,output,log:'illustrated saved workflow'});
    }
    for(let i=0;i<this.nodes.length;i++){
      const a=this.nodes[i].position,b=this.nodes[(i+1)%this.nodes.length].position;
      const mid=a.clone().lerp(b,.5);mid.y+=5;mid.z-=i<4?8:-4;
      const curve=new T.CatmullRomCurve3([a,mid,b]);
      const mesh=new T.Mesh(new T.TubeGeometry(curve,28,.13,6,false),new T.MeshStandardMaterial({color:i===6?'#bd805c':'#6aa6a8',roughness:.44,metalness:.2,transparent:true,opacity:.63}));
      const packet=new T.Mesh(new T.SphereGeometry(.55,10,8),new T.MeshBasicMaterial({color:'#dc9b5e'}));
      this.group.add(mesh,packet);this.connections.push({curve,mesh,packet});
    }
    this.group.visible=false;
  }
  update(time:number){
    const cycle=Math.max(0,(time-65)*.7);
    for(const [i,node]of this.nodes.entries()){
      const stage=cycle%this.nodes.length;
      node.status=i<stage?'reviewed':i<stage+1?'running':'waiting';
      const mesh=node.object.children[0] as T.Mesh<T.IcosahedronGeometry,T.MeshPhysicalMaterial>;
      mesh.material.emissive.set(node.status==='running'?'#3f9698':'#071a20');mesh.material.emissiveIntensity=node.status==='running'?.45:.04;
      const hoop=node.object.children[1] as T.Mesh;hoop.rotation.z=time*.12+i*.28;
    }
    for(const [i,row]of this.connections.entries())row.packet.position.copy(row.curve.getPoint((cycle*.44+i*.21)%1));
  }
}
