import {build} from 'esbuild';import {pathToFileURL} from 'node:url';
await build({entryPoints:['scripts/audit-observer-v09.ts'],outfile:'work/audit-observer-v09.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
await import(pathToFileURL(process.cwd()+'/work/audit-observer-v09.mjs'));
