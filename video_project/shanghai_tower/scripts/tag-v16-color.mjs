import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function probe(file){
 const result=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,color_space,color_transfer,color_primaries,nb_frames','-of','json',file],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error(result.stderr||'ffprobe failed');
 return JSON.parse(result.stdout).streams[0];
}
/** Correct stream/container descriptions only; no pixel or audio re-encoding. */
export function tagV16Color(file){
 const input=path.resolve(file),before=probe(input);
 if(before.color_space==='bt709'&&before.color_transfer==='bt709'&&before.color_primaries==='bt709')return {changed:false,probe:before};
 if(before.codec_name!=='h264')throw new Error('V16 colour tagging requires H264');
 const temporary=input.replace(/\.mp4$/,'.bt709-temporary.mp4');
 if(temporary===input||fs.existsSync(temporary))throw new Error('Unsafe or occupied temporary output');
 const beforeSHA256=hash(input),args=['-hide_banner','-nostdin','-v','error','-i',input,'-map','0','-c','copy',
  '-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
  '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',temporary];
 const result=spawnSync('ffmpeg',args,{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error(result.stderr||'Colour tagging failed');
 const after=probe(temporary);
 if(after.nb_frames!==before.nb_frames||after.color_space!=='bt709'||after.color_transfer!=='bt709'||after.color_primaries!=='bt709')throw new Error('Tagged stream verification failed');
 const afterSHA256=hash(temporary);fs.renameSync(temporary,input);
 const record={changed:true,file:input,beforeSHA256,afterSHA256,before,after,processing:'H264 VUI and MP4 colour metadata only; video and AAC stream copy',createdAt:new Date().toISOString()};
 fs.writeFileSync(input.replace(/\.mp4$/,'.color.json'),JSON.stringify(record,null,2));return record;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Usage: node scripts/tag-v16-color.mjs <video.mp4>');
 console.log(JSON.stringify(tagV16Color(process.argv[2])));
}
