import {ensureBrowser} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=await ensureBrowser({logLevel:'info',chromeMode:'headless-shell'});
if(!('path' in result)||!result.path||!fs.existsSync(result.path))throw new Error('Remotion browser is unavailable');
const source=path.dirname(result.path),target=path.join(root,'work/render-browser-v10');
if(fs.existsSync(target)){
 if(fs.lstatSync(target).isSymbolicLink())throw new Error('Refusing linked private browser folder');
 if(!fs.existsSync(path.join(target,'chrome-headless-shell.exe')))throw new Error('Existing private browser folder is incomplete');
}else fs.cpSync(source,target,{recursive:true,errorOnExist:true,force:false});
console.log(JSON.stringify({type:result.type,privateBrowser:path.join(target,'chrome-headless-shell.exe'),globalGpuPreferencesChanged:false}));
