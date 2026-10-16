import * as T from 'three';
import {World} from '../../v05/src/World';
const scene=new T.Scene();
const camera=new T.PerspectiveCamera(42,1920/1080,.06,200);
const gl=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
gl.setPixelRatio(1);gl.setSize(1920,1080);document.body.appendChild(gl.domElement);
const world=new World(scene,camera,gl);world.update(0);gl.render(scene,camera);
const overlay=document.createElement('div');overlay.style.cssText='position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,#f0f0ea12,transparent 31%,transparent 82%,#f0f0ea80)';document.body.appendChild(overlay);
(window as any).ready=true;
