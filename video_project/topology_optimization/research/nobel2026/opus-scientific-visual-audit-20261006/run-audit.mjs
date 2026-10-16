import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..', '..', '..');
const workspace = path.resolve(project, '..', '..');
const {callClaudeNative} = await import(pathToFileURL(path.join(workspace, 'tools', 'claude', 'native.mjs')).href);

function numbered(relative) {
  const body = fs.readFileSync(path.join(project, relative), 'utf8');
  return `${relative}\n${body.split(/\r?\n/).map((line, index) => `${String(index + 1).padStart(4)} | ${line}`).join('\n')}`;
}
const timeline = JSON.parse(fs.readFileSync(path.join(project, 'src/nobel2026/timeline-v3.json'), 'utf8'));
const timing = {
  fps: timeline.fps,
  durationFrames: timeline.duration,
  scenes: timeline.scenes,
  clips: timeline.clips.map(({id, scene, start, end, spoken, subtitle, subtitleParts, asrSpeechEnd}) =>
    ({id, scene, start, end, spoken, subtitle, subtitleParts, asrSpeechEnd})),
};
const prompt = `Please conduct an INDEPENDENT, READ-ONLY scientific visual and audio-timing audit of a 2026 Nobel medicine optogenetics explainer. You cannot inspect pixels here: the supplied evidence is code, frame/voice timing, and extracted text from the official Nobel popular-information PDF. Do not claim to have viewed rendered frames, listened to audio, or verified actual rendering. Do not edit any files. Do not invoke tools. Return a concise Chinese audit with exact file:line references or clip IDs and frame ranges.

Check specifically: (1) factual/methodological claims against the official source, including ChR1 vs ChR2, 0.5/0.2 ms, oocyte heterologous expression, ion direction, 2003/2005/2007, memory sufficiency vs necessity, retinal clinical limits; (2) whether Three.js geometry and camera allow the narrated mechanism to be seen, especially membrane pore/ions/photons/brain fiber/control trace and possible occlusion; (3) whether visual events happen during the voice clip that introduces them, using actual timing and stateAt() + voiceStep math; (4) overlay collision and cut/transition risks by reasoning about positions, zIndex, clipping, camera orthographic extents and group travel; (5) evidence-card and endpaper accuracy/attribution. Prioritize substantive faults, with evidence and a feasible correction. Separate verified code-level findings from hypotheses requiring a rendered-frame/audio review. Do not assume a rendered frame exists in your context. The frozen NARRATION is the current approved spoken text: suggest wording changes as proposed editorial notes, not as implemented changes.

CURRENT TIMELINE (frames at 30 fps, actual caption part timings in seconds relative to each clip):
${JSON.stringify(timing, null, 2)}

${numbered('src/nobel2026/WorldV2.ts')}

${numbered('src/nobel2026/FilmV3.tsx')}

${numbered('scripts/build_nobel2026_v3_timeline.py')}

LOCAL SCIENCE RECORD:
${fs.readFileSync(path.join(project, 'research/nobel2026/research-note.md'), 'utf8')}

OFFICIAL NOBEL POPULAR INFORMATION PDF (text extracted page-by-page from local official PDF; some figure captions may be absent):
${fs.readFileSync(path.join(here, 'official-popular-extract.txt'), 'utf8')}
`;
fs.writeFileSync(path.join(here, 'prompt.md'), prompt, 'utf8');
try {
  const result = await callClaudeNative({
    prompt,
    outputDir: here,
    model: 'claude-opus-5-5',
    maxTokens: 12000,
    effort: 'high',
    totalTimeoutMs: 900000,
    onProgress: ({phase, elapsedMs, textCharacters}) => {
      if (phase === 'waiting' || phase === 'success' || phase === 'failed')
        process.stdout.write(JSON.stringify({phase, elapsedSeconds: Math.round(elapsedMs / 1000), textCharacters}) + '\n');
    },
  });
  process.stdout.write(JSON.stringify({status: result.report.status, model: result.report.returnedModel, reportPath: result.reportPath, responsePath: result.responsePath}) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({status: 'failed', code: error.code ?? 'unknown', reportPath: error.reportPath ?? null}) + '\n');
  process.exitCode = 1;
}
