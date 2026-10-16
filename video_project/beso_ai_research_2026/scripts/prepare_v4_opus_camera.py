from pathlib import Path

root = Path(__file__).resolve().parents[1]
run = root / 'work/opus-runs/20261011-v4-camera-physical-corridor'
run.mkdir(parents=True, exist_ok=True)
prompt = '''You are writing one bounded deterministic TypeScript camera component for a 105-second 1920x1080 60fps engineering release film using three.js 0.180.0.
Return a complete TypeScript module named CinematicMotion.ts in one fenced typescript block and a concise explanation. Tools are disabled; embedded source is your only context.
Requirements:
1. Export type CameraKey={t:number;p:[number,number,number];q:[number,number,number]}.
2. Export sampleCinematicCamera(keys:CameraKey[],time:number):{position:Vector3,target:Vector3}. Piecewise Hermite using time-scaled shared velocities for uneven knot spacing. Derivatives must be continuous; deterministic random-access evaluation; clamp time. Limit component tangent overshoot by using monotone harmonic means where necessary. Return independent vectors. Handle <=1 key and duplicate times safely.
3. Export corridorTravel(time:number,enter:[number,number],holdX:number,enterX:number,exit?:[number,number],exitX?:number):{x:number;visible:boolean}. Quintic smoothstep; object starts outside frame, enters and holds, then exits fully before invisible. No opacity tricks. If no exit, holds visible.
4. Export projectAnchor(camera:PerspectiveCamera,world:Vector3,width?:number,height?:number):{x:number;y:number;depth:number;visible:boolean}; reject behind camera and outside viewport with 64px margin.
5. No DOM, Date, Math.random, caches with evaluation-order dependence or simulation claim.
Native metres: 3 tilted outer columns, 3 inner legs, 3 hub radial beams, tower base y12, length136.7, rotor hub y150.45, blade length131, 12 mooring polylines. Saved response must not change. World stations x0 native/BESO and x128 workflow/drawing. Helpers support a film camera corridor, not solver modifications.

Embedded actual source:
```typescript
'''
prompt += (root / 'src/beso/CinematicWorld.ts').read_text(encoding='utf-8') + '\n```\n'
(run / 'task.md').write_text(prompt, encoding='utf-8')
print(run / 'task.md')
