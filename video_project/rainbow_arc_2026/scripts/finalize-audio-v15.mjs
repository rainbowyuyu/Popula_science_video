import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const run = (name, args) => {
  const r = spawnSync(name, args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message ?? r.stderr.slice(-3000)}`);
  return r.stdout;
};
const hashFile = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const videoHash = (p) => run('ffmpeg', ['-v','error','-i',p,'-map','0:v:0','-c:v','copy','-an','-f','streamhash','-hash','sha256','-']).trim();
const probe = (p) => JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',p]));

// Standard AAC encoding declares priming through MP4 edit-list/skip metadata.
// Only complete renders use this operation; partial previews keep local clocks.
export function finalizeAudioV15(video, master, output, provenanceFile) {
  for (const p of [video, master]) if (!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);
  if (path.resolve(video) === path.resolve(output)) throw new Error('Use a distinct output before validation');
  const before = probe(video), v = before.streams.find(s => s.codec_type === 'video');
  const duration = Number(v.nb_frames) / (Number(v.avg_frame_rate.split('/')[0]) / Number(v.avg_frame_rate.split('/')[1]));
  const a = probe(master).streams.find(s => s.codec_type === 'audio');
  if (!Number.isFinite(duration) || duration <= 0 || Math.abs(Number(a.duration) - duration) > .001) throw new Error('Master and complete video durations differ');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const originalVideoHash = videoHash(video);
  run('ffmpeg', ['-v','error','-y','-i',video,'-i',master,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t',String(duration),'-movflags','+faststart','-use_editlist','1','-avoid_negative_ts','disabled',output]);
  const outputVideoHash = videoHash(output);
  if (outputVideoHash !== originalVideoHash) throw new Error('Video stream changed during audio-only finalization');
  const packet = JSON.parse(run('ffprobe',['-v','error','-select_streams','a:0','-read_intervals','%+#1','-show_packets','-of','json',output])).packets[0];
  if (!packet?.side_data_list?.some(s => s.side_data_type === 'Skip Samples' && Number(s.skip_samples) === 1024)) throw new Error('AAC priming metadata is missing');
  const note = {version:'V15',operation:'Video stream copied unchanged; audio encoded from exact accepted PCM master with declared AAC priming',inputVideoSHA256:hashFile(video),outputVideoSHA256:hashFile(output),masterSHA256:hashFile(master),videoStreamHashBefore:originalVideoHash,videoStreamHashAfter:outputVideoHash,videoStreamUnchanged:true,durationSeconds:duration,firstAudioPacket:packet,ffmpegVersion:run('ffmpeg',['-version']).split('\n')[0],humanListeningChecked:false};
  fs.mkdirSync(path.dirname(provenanceFile),{recursive:true});
  fs.writeFileSync(provenanceFile,JSON.stringify(note,null,2)+'\n');
  return note;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [video,master,output,provenance] = process.argv.slice(2);
  if (!provenance) throw new Error('Usage: node finalize-audio-v15.mjs VIDEO MASTER OUTPUT PROVENANCE');
  console.log(JSON.stringify(finalizeAudioV15(video,master,output,provenance),null,2));
}
