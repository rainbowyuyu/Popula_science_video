import React from 'react';
import {Composition,registerRoot} from 'remotion';
import * as T from 'three';
import {Film} from '../../../src/Film';
import {World} from '../../../src/World';
import timeline from '../../../src/timeline.json';
import data from './city-data.json';

// Isolated preview only. This module is never imported by src/index.tsx.
const makeSite=World.prototype.makeSite;
World.prototype.makeSite=function(){
 makeSite.call(this);
 const city=new T.Group();city.name='OSM research context — NOT solver geometry';
 const mat=new T.MeshStandardMaterial({color:'#d3dedb',roughness:.91,metalness:0});
 const shape=(poly:number[][])=>new T.Shape(poly.map(([x,z])=>new T.Vector2(x*.01,-z*.01)));
 const add=(poly:number[][],top:number,bottom=0)=>{
  const geo=new T.ExtrudeGeometry(shape(poly),{depth:(top-bottom)*.01,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);
  const mesh=new T.Mesh(geo,mat);mesh.position.y=bottom*.01;mesh.receiveShadow=true;city.add(mesh);
  const lines=new T.LineSegments(new T.EdgesGeometry(geo,25),new T.LineBasicMaterial({color:'#9db2b2',transparent:true,opacity:.15}));lines.position.copy(mesh.position);city.add(lines);
 };
 for(const b of data.buildings){const parts=(b as any).parts;if(parts?.length){for(const p of parts)add(p.polygon_m,p.height_m,p.min_height_m)}else add(b.polygon_m,b.height_m);}
 const plaza=new T.Mesh(new T.PlaneGeometry(15,15),new T.MeshStandardMaterial({color:'#e1e6e1',roughness:.98,metalness:0}));plaza.rotation.x=-Math.PI/2;plaza.position.set(2,-.048,-1.6);plaza.receiveShadow=true;city.add(plaza);
 for(const road of data.roads){const g=new T.BufferGeometry().setFromPoints(road.points_m.map(([x,z])=>new T.Vector3(x*.01,-.046,z*.01)));const line=new T.Line(g,new T.LineBasicMaterial({color:'#b1c2c0',transparent:true,opacity:.42}));city.add(line);}
 this.scene.add(city);
};
registerRoot(()=> <Composition id="ShanghaiCityContextPreview" component={Film} fps={30} width={1920} height={1080} durationInFrames={timeline.duration} defaultProps={{audio:false,clean:true}}/>);
