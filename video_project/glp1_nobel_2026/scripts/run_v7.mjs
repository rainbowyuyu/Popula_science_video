import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const root=process.cwd(),temp=path.join(root,'tmp/v7-render-temp');fs.mkdirSync(temp,{recursive:true});
const child=spawn(process.execPath,[path.join(root,'scripts/render_v7.mjs'),...process.argv.slice(2)],{cwd:root,env:{...process.env,TEMP:temp,TMP:temp},windowsHide:true,stdio:'inherit'});child.on('error',e=>{console.error(e);process.exitCode=1});child.on('close',c=>process.exitCode=c??1);
