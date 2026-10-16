import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await build({entryPoints:[path.join(root,'viewer/main.js')],outfile:path.join(root,'viewer/app.js'),bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'eof'});
console.log('Viewer built. Start locally: node viewer/serve.mjs');
