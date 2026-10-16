import story from './story.json';
export type Chapter = {id:string;start:number;end:number;label:string;short:string};
export const FPS=30;
const labels:Record<string,[string,string]>={overview:['海洋新能源','从一台风机，到岸上的灯'],hook:['第一期','海上的风，怎样点亮一盏灯？'],wind:['风','空气的运动，变成旋转'],rotor:['轴系','把转动传进去'],generator:['发电机','机械能 → 电能'],converter:['变流器','跟上电网的节奏'],transformer:['升压','让电走得更远'],cable:['海缆','沿着海底，回到岸上'],shore:['岸上的灯','风 · 机 · 电 · 网'],ending:['下一期','风怎样让叶片转起来？']};
export const chapters:Chapter[]=(story.scenes as any[]).map(s=>({id:s.chapter,start:s.start,end:s.end,label:labels[s.chapter]?.[0]??s.chapter,short:labels[s.chapter]?.[1]??''}));
// End on the last narrated frame.  Keeping a two-second safety tail here
// created an audible empty tail after the music fade; the renderer already
// preserves the final frame, so derive duration from the actual frame grid.
export const durationSeconds=Math.ceil(Math.max(...chapters.map(s=>s.end))*FPS)/FPS;
export function sceneAt(t:number){return chapters.find(c=>t>=c.start&&t<c.end)??(t<chapters[0].start?chapters[0]:chapters[chapters.length-1]);}
export function clamp01(v:number){return Math.max(0,Math.min(1,v));}
export function smoothstep(a:number,b:number,x:number){const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);}
export function easeInOut(t:number){return t*t*(3-2*t);}
export function localTime(id:string,t:number){const s=chapters.find(s=>s.id===id)!;return clamp01((t-s.start)/(s.end-s.start));}
export function envelope(id:string,t:number,ramp=3){const s=chapters.find(s=>s.id===id)!;return smoothstep(s.start-ramp,s.start+ramp,t)*(1-smoothstep(s.end-ramp,s.end+ramp,t));}
