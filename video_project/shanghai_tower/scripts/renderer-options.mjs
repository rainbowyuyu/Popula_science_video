// Remotion 4.0.x exposes the GL backend but not additional Chromium arguments.
// This hook adds adapter-selection arguments to this Node process only. It does
// not edit node_modules, the registry, drivers, browser profiles, or OS settings.
import {createRequire} from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
let restoreLaunch=null;
export const HIGH_PERFORMANCE_GPU_FLAGS=Object.freeze([
  '--use-angle=d3d11',
  '--force_high_performance_gpu',
  '--enable-gpu',
]);

/** Prefer the high-performance Windows adapter while retaining ANGLE/D3D11.
 * The flag requests the discrete adapter; SystemInfo.getInfo must verify the
 * actual GPU. On the current dual-GPU machine it selects the RTX 5060 Laptop.
 * Pass false for the unmodified Remotion/OS adapter selection.
 */
export function configureRenderer({preferHighPerformanceGpu=true}={}) {
  if(preferHighPerformanceGpu&&process.platform==='win32'&&!restoreLaunch){
    const rendererRoot=path.dirname(require.resolve('@remotion/renderer'));
    const launcher=require(path.join(rendererRoot,'browser/Launcher.js'));
    if(typeof launcher.launchChrome!=='function')throw new Error('This Remotion version does not expose the verified local Chromium launcher.');
    const original=launcher.launchChrome;
    const hooked=(options)=>original({...options,args:[
      ...options.args.filter(arg=>!arg.startsWith('--use-angle=')&&!HIGH_PERFORMANCE_GPU_FLAGS.includes(arg)),
      ...HIGH_PERFORMANCE_GPU_FLAGS,
    ]});
    launcher.launchChrome=hooked;
    restoreLaunch=()=>{if(launcher.launchChrome===hooked)launcher.launchChrome=original;restoreLaunch=null;};
  }else if(!preferHighPerformanceGpu&&restoreLaunch){restoreLaunch();}
  return {gl:'angle'};
}

export function restoreRendererSelection(){if(restoreLaunch)restoreLaunch();}
