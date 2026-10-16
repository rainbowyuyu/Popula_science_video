import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'src/LaunchFilm.tsx',
  'src/launch-story.json',
  'src/launch-captions.json',
  'research/launch-v3-voice-plan.json',
  'research/launch-film-v2-story.json',
];
const text = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const failures = [];
if (text.includes('Z，风') || /Z\s*风/.test(text)) failures.push('legacy Z，风 / Z风 text remains');
if (text.includes('人工智能工程师')) failures.push('AI Engineer has reverted to Chinese narration text');
if (!text.includes('Z-wind')) failures.push('Z-wind is missing from v3 source text');
if (!text.includes('AI Engineer')) failures.push('AI Engineer brand text is missing');
if (failures.length) {
  console.error(JSON.stringify({ pass: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ pass: true, checked: files, required: ['Z-wind', 'AI Engineer'] }, null, 2));
