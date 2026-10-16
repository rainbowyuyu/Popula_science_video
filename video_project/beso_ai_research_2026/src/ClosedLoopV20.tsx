// Bounded SVG mechanism illustration. Opus draft reviewed and locally refined; no solver values.
import React from 'react';

export type ClosedLoopV20Props = {
  phase: 'recovery' | 'recheck' | 'selection';
  progress: number;
};

type Pt = { x: number; y: number };

const INK = '#102f3c';
const COPPER = '#a65027';
const MUTED = '#46616a';
const W = 720;
const H = 400;

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number): number => clamp((p - a) / (b - a));
const ease = (t: number): number => {
  const c = clamp(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixColor = (a:string,b:string,t:number):string => {
 const q=clamp(t); const rgb=[1,3,5].map(i=>Math.round(lerp(parseInt(a.slice(i,i+2),16),parseInt(b.slice(i,i+2),16),q)));
 return `rgb(${rgb.join(',')})`;
};

function along(pts: Pt[], t: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let d = clamp(t) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] === 0 ? 0 : clamp(d / lens[i]);
      return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

const poly = (pts: Pt[]): string => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

const labelStyle = (size: number, fill: string, opacity: number): React.SVGProps<SVGTextElement> => ({
  fontSize: size,
  fill,
  opacity,
  fontFamily: 'inherit',
  fontWeight: 600,
});

function Recovery({ p }: { p: number }): React.ReactElement {
  const m = ease(seg(p, 0.3, 0.8));
  const cols = 6;
  const rows = 4;
  const x0 = 48;
  const y0 = 70;
  const dx = 64;
  const dy = 70;
  const grid: Pt[][] = [];
  for (let j = 0; j < rows; j++) {
    const row: Pt[] = [];
    for (let i = 0; i < cols; i++) {
      const bx = x0 + i * dx;
      const by = y0 + j * dy;
      const border = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
      const dist = ((i - 2.4) ** 2) / 3 + ((j - 1.5) ** 2) / 1.5;
      const w = border ? 0 : Math.exp(-dist) * (1 - m) * (0.6 + 0.4 * ease(seg(p, 0, 0.2)));
      row.push({
        x: bx + w * 28 * Math.sin(i * 1.7 + j * 2.3),
        y: by + w * 26 * Math.cos(i * 2.1 + j * 1.3),
      });
    }
    grid.push(row);
  }
  const edges: Array<[Pt, Pt]> = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (i < cols - 1) edges.push([grid[j][i], grid[j][i + 1]]);
      if (j < rows - 1) edges.push([grid[j][i], grid[j + 1][i]]);
      if (i < cols - 1 && j < rows - 1) {
        edges.push((i + j) % 2 === 0 ? [grid[j][i], grid[j + 1][i + 1]] : [grid[j][i + 1], grid[j + 1][i]]);
      }
    }
  }
  const kx = lerp(110, 290, m);
  const route1: Pt[] = [{ x: kx, y: 336 }, { x: 404, y: 336 }, { x: 404, y: 132 }, { x: 424, y: 132 }];
  const route2: Pt[] = [{ x: 370, y: 210 }, { x: 404, y: 210 }, { x: 404, y: 232 }, { x: 424, y: 232 }];
  const pulse1 = along(route1, ease(seg(p, 0.08, 0.45)));
  const pulse2 = along(route2, ease(seg(p, 0.55, 0.92)));
  const a1 = lerp(0.45, 1, ease(seg(p, 0.1, 0.4)));
  const a2 = lerp(0.45, 1, ease(seg(p, 0.6, 0.9)));
  return (
    <g>
      {edges.map(([a, b], k) => (
        <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={mixColor(MUTED,INK,m)} strokeWidth={3} strokeLinecap="round" opacity={0.55 + 0.45 * m} />
      ))}
      <line x1={48} y1={336} x2={368} y2={336} stroke={MUTED} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
      <circle cx={kx} cy={336} r={9} fill="#fff" stroke={COPPER} strokeWidth={4} />
      <polyline points={poly(route1)} fill="none" stroke={MUTED} strokeWidth={3} opacity={0.5} strokeLinejoin="round" />
      <polyline points={poly(route2)} fill="none" stroke={MUTED} strokeWidth={3} opacity={0.5} strokeLinejoin="round" />
      <circle cx={pulse1.x} cy={pulse1.y} r={6} fill={COPPER} opacity={seg(p, 0.05, 0.12) * (1 - seg(p, 0.45, 0.55))} />
      <circle cx={pulse2.x} cy={pulse2.y} r={6} fill={COPPER} opacity={seg(p, 0.52, 0.6) * (1 - seg(p, 0.92, 1)) } />
      <text x={436} y={145} {...labelStyle(40, INK, a1)}>网格尺寸</text>
      <line x1={440} y1={184} x2={660} y2={184} stroke={MUTED} strokeWidth={3} opacity={.45}/>
      <circle cx={lerp(476,608,m)} cy={184} r={8} fill={COPPER}/>
      <text x={436} y={245} {...labelStyle(40, mixColor(INK,COPPER,m), a2)}>计算步长</text>
      <line x1={440} y1={284} x2={660} y2={284} stroke={MUTED} strokeWidth={3} opacity={.45}/>
      <circle cx={lerp(620,508,m)} cy={284} r={8} fill={COPPER}/>
    </g>
  );
}

function MeshPacket({ c, s, color }: { c: Pt; s: number; color: string }): React.ReactElement {
  const pts: Pt[] = [
    { x: c.x - s, y: c.y + s * 0.8 },
    { x: c.x, y: c.y - s * 0.9 },
    { x: c.x + s, y: c.y + s * 0.8 },
  ];
  const mid: Pt[] = [
    { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
    { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 },
    { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 },
  ];
  return (
    <g>
      <polygon points={poly(pts)} fill="#fff" fillOpacity={0.75} stroke={color} strokeWidth={4} strokeLinejoin="round" />
      <polygon points={poly(mid)} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
    </g>
  );
}

function Recheck({ p }: { p: number }): React.ReactElement {
  const nodes: Array<{ x: number; label: string }> = [
    { x: 150, label: '网格' },
    { x: 360, label: '计算' },
    { x: 570, label: '检查' },
  ];
  const lift = lerp(10, -6, ease(p));
  const ny = 200 + lift;
  const route: Pt[] = [
    { x: 48, y: ny + 20 },
    { x: 150, y: ny },
    { x: 360, y: ny },
    { x: 570, y: ny },
    { x: 672, y: ny - 20 },
  ];
  const tp = ease(seg(p, 0.05, 0.9));
  const pkt = along(route, tp);
  const end = ease(seg(p, 0.78, 1));
  return (
    <g>
      <polyline points={poly(route)} fill="none" stroke={MUTED} strokeWidth={3} opacity={0.55} strokeLinecap="round" strokeLinejoin="round" />
      {nodes.map((n) => {
        const on = ease(seg(pkt.x, n.x - 40, n.x));
        return (
          <g key={n.label}>
            <circle cx={n.x} cy={ny} r={34} fill="#fff" fillOpacity={0.6} stroke={mixColor(MUTED,COPPER,on)} strokeWidth={lerp(3, 5, on)} />
            <circle cx={n.x} cy={ny} r={lerp(0, 9, on)} fill={COPPER} opacity={on} />
            <text x={n.x} y={ny + 96} textAnchor="middle" {...labelStyle(40, mixColor(MUTED,INK,on), lerp(0.55, 1, on))}>{n.label}</text>
            
          </g>
        );
      })}
      <MeshPacket c={{ x: pkt.x, y: pkt.y - 64 }} s={20} color={INK} />
      <line x1={pkt.x} y1={pkt.y - 44} x2={pkt.x} y2={pkt.y - 34} stroke={INK} strokeWidth={3} opacity={0.6} />
      <text x={W / 2} y={84} textAnchor="middle" {...labelStyle(40, COPPER, end)} transform={`translate(0 ${lerp(8, 0, end)})`}>自动复检</text>
    </g>
  );
}

function Selection({ p }: { p: number }): React.ReactElement {
  const base = 240;
  const choose = ease(seg(p, 0.55, 0.8));
  const bracket = ease(seg(p, 0.72, 1));
  const appear = ease(seg(p, 0, 0.25));
  const shapes: Array<{ x: number; label: string; outline: Pt[]; inner: Array<[Pt, Pt]> }> = [
    {
      x: 130,
      label: '版本 A',
      outline: [{ x: 70, y: base }, { x: 70, y: 120 }, { x: 190, y: 160 }, { x: 190, y: base }],
      inner: [[{ x: 70, y: 120 }, { x: 130, y: base }], [{ x: 130, y: base }, { x: 190, y: 160 }], [{ x: 130, y: 140 }, { x: 130, y: base }]],
    },
    {
      x: 360,
      label: '版本 B',
      outline: [{ x: 290, y: base }, { x: 300, y: 170 }, { x: 330, y: 125 }, { x: 360, y: 112 }, { x: 390, y: 125 }, { x: 420, y: 170 }, { x: 430, y: base }],
      inner: [[{ x: 300, y: 170 }, { x: 360, y: base }], [{ x: 360, y: base }, { x: 420, y: 170 }], [{ x: 330, y: 125 }, { x: 360, y: 180 }], [{ x: 360, y: 180 }, { x: 390, y: 125 }], [{ x: 360, y: 112 }, { x: 360, y: 180 }]],
    },
    {
      x: 590,
      label: '版本 C',
      outline: [{ x: 530, y: base }, { x: 575, y: 100 }, { x: 605, y: 100 }, { x: 650, y: base }],
      inner: [[{ x: 575, y: 100 }, { x: 620, y: base }], [{ x: 605, y: 100 }, { x: 560, y: base }], [{ x: 552, y: 170 }, { x: 628, y: 170 }]],
    },
  ];
  const cur = along([{ x: 650, y: 60 }, { x: 520, y: 70 }, { x: 372, y: 150 }], ease(seg(p, 0.25, 0.6)));
  const press = Math.sin(Math.PI * seg(p, 0.55, 0.68)) * 3;
  return (
    <g opacity={lerp(0.4, 1, appear)}>
      <line x1={40} y1={base} x2={680} y2={base} stroke={MUTED} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
      {shapes.map((s, k) => {
        const chosen = k === 1;
        const stroke = chosen ? mixColor(INK,COPPER,choose) : mixColor(INK,MUTED,choose);
        const sw = chosen ? lerp(3, 5, choose) : 3;
        const op = chosen ? 1 : lerp(1, 0.42, choose);
        return (
          <g key={s.label} opacity={op}>
            <polyline points={poly(s.outline)} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
            {s.inner.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={3} opacity={0.7} strokeLinecap="round" />
            ))}
            <text x={s.x} y={base + 50} textAnchor="middle" {...labelStyle(40, chosen ? mixColor(INK,COPPER,choose) : INK, 1)}>{s.label}</text>
          </g>
        );
      })}
      <path
        d={`M 296 304 Q 296 318 312 318 L 344 318 Q 360 318 360 330 Q 360 318 376 318 L 408 318 Q 424 318 424 304`}
        fill="none" stroke={COPPER} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1-bracket}
      />
      <path d="M 360 330 Q 380 352 432 352" fill="none" stroke={COPPER} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1-ease(seg(p, 0.82, 0.95))} />
      <text x={444} y={366} {...labelStyle(40, INK, ease(seg(p, 0.86, 1)))}>人工选择</text>
      <g transform={`translate(${cur.x} ${cur.y + press})`} opacity={ease(seg(p, 0.2, 0.3))}>
        <polygon points="0,0 0,28 7,21 12,32 17,30 12,19 21,19" fill="#fff" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </g>
    </g>
  );
}

const ARIA: Record<ClosedLoopV20Props['phase'], string> = {
  recovery: '示意：局部不规则网格经过网格尺寸和计算步长调整，准备重新计算，不代表真实求解结果',
  recheck: '示意：网格数据沿一条路线依次经过网格、计算、检查三个环节，最后自动复检',
  selection: '示意：三个候选形状版本 A、B、C 并列，光标选中版本 B，标注人工选择',
};

export function ClosedLoopV20(props: ClosedLoopV20Props): React.ReactElement {
  const p = clamp(Number.isFinite(props.progress) ? props.progress : 0);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ARIA[props.phase]} style={{ background: 'transparent', overflow: 'hidden', fontFamily: 'inherit' }}>
      {props.phase === 'recovery' ? <Recovery p={p} /> : props.phase === 'recheck' ? <Recheck p={p} /> : <Selection p={p} />}
    </svg>
  );
}
