import fs from 'node:fs';
import path from 'node:path';

/** Keep Remotion's Windows copy bounded to assets actually used by this film.
 * Staging links share bytes with public; previous film assets are untouched. */
export function preparePublicV6(root,needAudio=false){
 const stage=path.resolve(root,'work/public-v6');
 const assets=['brand/logo.png','bridges/memory-film-atlas.jpg',
  '3d/glass_vial.glb','3d/lux_vial_holder.glb',
  '3d/v6/synthesis_nozzle.glb','3d/v6/sequencing_flowcell.glb',
  'papers/dna-fountain-preprint-01.png','papers/nucleotide-transformer-2024-01.png',
  'formulas/gc.svg','formulas/xor.svg','formulas/consensus.svg'];
 if(needAudio||fs.existsSync(path.join(root,'public/audio/v6/master.wav')))assets.push('audio/v6/master.wav');
 let bytes=0;
 for(const name of assets){
  const source=path.resolve(root,'public',name),dest=path.resolve(stage,name);
  if(!dest.startsWith(stage+path.sep))throw new Error('Invalid staging path');
  if(!fs.existsSync(source))throw new Error('Missing V6 render asset: '+name);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  if(fs.existsSync(dest)){
   const a=fs.statSync(source),b=fs.statSync(dest);
   if(a.ino===b.ino&&a.dev===b.dev){bytes+=a.size;continue;}
   fs.unlinkSync(dest);
  }
  fs.linkSync(source,dest);bytes+=fs.statSync(source).size;
 }
 fs.writeFileSync(path.join(root,'work/public-v6-assets.json'),JSON.stringify({method:'NTFS hardlink staging followed by bounded Remotion copy',assets,sourceBytes:bytes},null,2));
 return stage;
}
