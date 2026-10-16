import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
await build({entryPoints:['scripts/audit-motion.ts'],outfile:'research/qa/motion-audit.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
execFileSync(process.execPath,['research/qa/motion-audit.mjs'],{stdio:'inherit'});
