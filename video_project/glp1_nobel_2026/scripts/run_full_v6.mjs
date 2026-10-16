// Keep temporary frame files on this project's roomy volume, child process only.
import path from 'node:path';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const renderTemp=path.join(root,'tmp/v6-render-temp');fs.mkdirSync(renderTemp,{recursive:true});
if(fs.realpathSync(renderTemp)!==renderTemp)throw new Error('Unexpected temporary-directory redirection');
const child=spawn(process.execPath,[path.join(root,'scripts/render_full_guarded_v6.mjs'),
 '--source-lock=research/revision-v6/final-source-lock.json','--output-dir=tmp/v6-full-final','--concurrency=3',...process.argv.slice(2)],
 {cwd:root,env:{...process.env,TEMP:renderTemp,TMP:renderTemp},windowsHide:true,stdio:'inherit'});
child.on('error',e=>{console.error(e);process.exitCode=1;});
child.on('close',code=>{process.exitCode=code??1;});
