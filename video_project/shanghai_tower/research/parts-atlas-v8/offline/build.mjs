import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const namingBytes=fs.readFileSync(path.join(root,'research/parts-atlas-v8/naming.json'));
const manifestBytes=fs.readFileSync(path.join(root,'public/models/shanghai-tower-manifest.json'));
const naming=JSON.parse(namingBytes),manifest=JSON.parse(manifestBytes),map=new Map(manifest.parts.map(p=>[p.id,p]));
if(naming.count!==987||manifest.parts.length!==987||new Set(naming.parts.map(p=>p.id)).size!==987)throw Error('Expected 987 unique semantic parts');
if(naming.sourceManifestSHA256!==digest(manifestBytes))throw Error('Naming was generated from another manifest; reconcile inputs first');
const data={...naming,byId:undefined,parts:naming.parts.map(p=>{const m=map.get(p.id);if(!m)throw Error('Missing manifest part '+p.id);return {...p,explodeVectorThree:m.explodeVectorThree}})};
const bundled=await build({entryPoints:[path.join(here,'app.js')],bundle:true,format:'iife',target:'es2022',minify:true,write:false,legalComments:'inline'});
const glb=fs.readFileSync(path.join(root,'public/models/shanghai-tower.glb')),logo=fs.readFileSync(path.join(root,'public/brand/logo.png'));
const license=fs.readFileSync(path.join(root,'node_modules/three/LICENSE'),'utf8');
const html=fs.readFileSync(path.join(here,'template.html'),'utf8')
 .replace('__LOGO__',()=>'data:image/png;base64,'+logo.toString('base64'))
 .replace('__DATA__',()=>JSON.stringify(data).replaceAll('<','\\u003c'))
 .replace('__GLB__',()=>glb.toString('base64'))
 .replace('__APP__',()=>bundled.outputFiles[0].text.replaceAll('</script','<\\/script'))
 .replace('__LICENSE__',()=>license.replaceAll('-->','-- >'));
const output=path.join(root,'delivery/构件图册.html');fs.writeFileSync(output,html,'utf8');
const report={createdUTC:new Date().toISOString(),output,bytes:Buffer.byteLength(html),sha256:digest(html),
 count:987,namesUnique:new Set(naming.parts.map(p=>p.nameChinese)).size,
 inputs:{glbSHA256:digest(glb),manifestSHA256:digest(manifestBytes),namingSHA256:digest(namingBytes),logoSHA256:digest(logo)},
 offline:{embeddedGLB:true,embeddedLibrary:true,embeddedLogo:true,remoteDependency:false},
 scope:naming.countMeaningChinese,changesProductionInputs:false};
fs.writeFileSync(path.join(here,'build-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
