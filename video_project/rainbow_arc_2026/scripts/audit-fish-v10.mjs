import {build} from 'esbuild';import {pathToFileURL} from 'node:url';
await build({entryPoints:['scripts/audit-fish-v10.ts'],outfile:'work/audit-fish-v10.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
await import(pathToFileURL(process.cwd()+'/work/audit-fish-v10.mjs'));
