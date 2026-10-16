import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const normalize=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
const overlay=new Map([
 [normalize(path.join(root,'src/V4World.ts')),fs.readFileSync(path.join(here,'repatch-liver/V4World.after.ts'),'utf8')],
 [normalize(path.join(root,'src/V4HandoffContext.ts')),fs.readFileSync(path.join(here,'repatch-liver/V4HandoffContext.ts'),'utf8')],
]);
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const host=ts.createCompilerHost(parsed.options);
const read=host.readFile.bind(host),exists=host.fileExists.bind(host);
host.readFile=file=>overlay.get(normalize(file))??read(file);
host.fileExists=file=>overlay.has(normalize(file))||exists(file);
const program=ts.createProgram([...parsed.fileNames,path.join(root,'src/V4HandoffContext.ts')],parsed.options,host);
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){
 console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 process.exitCode=1;
}else console.log('Staged overlay type-check passed; active source was not modified.');
