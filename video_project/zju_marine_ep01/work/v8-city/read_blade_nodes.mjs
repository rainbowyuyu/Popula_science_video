import fs from 'node:fs';import * as T from 'three';
/** Minimal geometry-only GLB reader for audits. No browser, texture substitution
 * or file mutation; preserves authored node transforms and blade vertex data. */
export function readBladeNodes(file){
 const data=fs.readFileSync(file),jsonBytes=data.readUInt32LE(12),g=JSON.parse(data.subarray(20,20+jsonBytes).toString('utf8')),binOffset=28+jsonBytes;
 const attribute=id=>{const a=g.accessors[id],view=g.bufferViews[a.bufferView],n={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[a.type];if(a.componentType!==5126)throw Error('Audit expects Float32 blade data');const f=new Float32Array(a.count*n),stride=view.byteStride??n*4,base=binOffset+(view.byteOffset??0)+(a.byteOffset??0);for(let i=0;i<a.count;i++)for(let c=0;c<n;c++)f[i*n+c]=data.readFloatLE(base+i*stride+c*4);return new T.BufferAttribute(f,n);};
 const nodes=g.nodes.map(n=>{let o;if(/^Blade_[123]$/.test(n.name)){const p=g.meshes[n.mesh].primitives[0],geo=new T.BufferGeometry();geo.setAttribute('position',attribute(p.attributes.POSITION));geo.setAttribute('normal',attribute(p.attributes.NORMAL));o=new T.Mesh(geo,new T.MeshStandardMaterial());}else o=new T.Group();o.name=n.name??'';if(n.matrix)o.applyMatrix4(new T.Matrix4().fromArray(n.matrix));else{if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}return o;});
 g.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>nodes[i].add(nodes[child])));
 const root=new T.Group();for(const i of g.scenes[g.scene??0].nodes)root.add(nodes[i]);root.updateMatrixWorld(true);return root;
}
