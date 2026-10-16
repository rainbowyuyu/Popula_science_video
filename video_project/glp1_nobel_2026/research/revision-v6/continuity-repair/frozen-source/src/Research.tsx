import React from 'react';
import {C, clamp, smooth, type FrameState} from './visual';
import {TYPOGRAPHY} from './Scale';
import timeline from './timeline.json';

/** Qualitative experiment diagrams. Motion reveals a comparison, never invented data. */
const quiet = '#647978';
const stroke = '#afc1ba';
const WIDTH = 610;
const HEIGHT = 445;

function Text({x = 0, y, children, size = 36, color = C.ink, strong = false}: {
  x?: number; y: number; children: React.ReactNode;
  size?: 36 | 46 | 56; color?: string; strong?: boolean;
}) {
  return <text x={x} y={y} fill={color} fontSize={size}
    fontWeight={strong ? 650 : 500} dominantBaseline="alphabetic">{children}</text>;
}

function Flow({x1, x2, y, time, color = C.teal, active = 1}: {
  x1: number; x2: number; y: number; time: number; color?: string; active?: number;
}) {
  // A pair of travelling light accents communicates sequence only, not molecule counts.
  return <g>
    <path d={`M ${x1} ${y} H ${x2}`} stroke={stroke} strokeWidth={3} fill="none" />
    <path d={`M ${x2 - 10} ${y - 6} L ${x2} ${y} L ${x2 - 10} ${y + 6}`}
      stroke={stroke} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {[0, .5].map((offset, i) => {
      const u = ((time * .35 + offset) % 1 + 1) % 1;
      return <circle key={i} cx={x1 + (x2 - x1 - 10) * u} cy={y} r={5}
        fill={color} opacity={active * smooth(u / .15) * smooth((1 - u) / .15)} />;
    })}
  </g>;
}

function OralComparison({time, progress}: {time: number; progress: number}) {
  const result = smooth((progress - .25) / .25);
  return <>
    <Text y={48} size={46} strong>先让血糖水平相近</Text>
    <Text y={148}>喝糖水</Text>
    <Text y={256}>静脉输糖</Text>
    <Flow x1={190} x2={372} y={136} time={time} />
    <Flow x1={190} x2={372} y={244} time={time} />
    <path d="M 397 118 H 407 V 264 H 397" fill="none" stroke={stroke}
      strokeWidth={3} strokeLinecap="round" />
    <Text x={434} y={178}>测量</Text>
    <Text x={434} y={226}>胰岛素</Text>
    <g transform={`translate(${-22 * (1 - result)} 0)`} opacity={result}>
      <Text y={349} size={56} strong color={C.teal}>口服，反应更强</Text>
    </g>
    <Text y={425} color={quiet}>Nauck 等 · 1986</Text>
  </>;
}

function Peptide({first, y, reveal, color}: {
  first: 1 | 7; y: number; reveal: number; color: string;
}) {
  // Exactly 37 or 31 residues; separate synthetic peptides, not a DPP-4 cutting scene.
  const x = (residue: number) => 18 + (residue - 1) * 14.65;
  return <g>
    <path d={`M ${x(first)} ${y} H ${x(37)}`} stroke={color} strokeWidth={2.2}
      opacity={.42} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - reveal} />
    {Array.from({length: 38 - first}, (_, i) => first + i).map((residue, i) => {
      const visible = smooth((reveal * (39 - first) - i) / 2);
      return <circle key={residue} cx={x(residue)} cy={y} r={5.5 * visible}
        fill={color} />;
    })}
  </g>;
}

function ActiveFragment({progress}: {progress: number}) {
  const long = smooth((progress - .04) / .2);
  const short = smooth((progress - .30) / .2);
  return <>
    <Text y={43} size={46} strong>离体大鼠胰腺</Text>
    <Text y={96} color={quiet}>相同葡萄糖：6.6 mM</Text>
    <Text y={167}>长片段 · 37 残基</Text>
    <Peptide first={1} y={198} reveal={long} color={quiet} />
    <Text y={250} color={quiet}>未见促分泌作用</Text>
    <Text y={312}>短片段 · 31 残基</Text>
    <Peptide first={7} y={343} reveal={short} color={C.teal} />
    <g opacity={short} transform={`translate(${18 * (1 - short)} 0)`}>
      <Text x={346} y={312} color={C.teal} strong>释放增强</Text>
    </g>
    <Text y={425} color={quiet}>Mojsov 等 · 1987</Text>
  </>;
}

function CultureCell({time, progress}: {time: number; progress: number}) {
  const reveal = smooth((progress - .12) / .60);
  return <>
    <Text y={43} size={46} strong>培养大鼠细胞</Text>
    <Text y={98} color={quiet}>加入有活性的短片段</Text>
    <path d="M 25 158 V 330" stroke={stroke} strokeWidth={3} fill="none"
      pathLength={1} strokeDasharray="1" strokeDashoffset={1 - reveal} />
    {[175, 252, 329].map((y, i) => {
      const enter = smooth((reveal * 4 - i) / 1.5);
      return <g key={i} transform={`translate(${20 * (1 - enter)} 0)`} opacity={enter}>
        <circle cx={25} cy={y - 12} r={7} fill={C.teal} />
        <circle cx={25} cy={y - 12} r={13 + 2 * Math.sin(time * 1.5 - i)}
          fill="none" stroke={C.teal} strokeOpacity={.18} strokeWidth={2} />
        <Text x={64} y={y} color={i === 2 ? C.teal : C.ink}
          size={i === 2 ? 46 : 36} strong={i === 2}>
          {['传信分子 cAMP ↑', '胰岛素指令 mRNA ↑', '胰岛素释放 ↑'][i]}
        </Text>
      </g>;
    })}
    <Text y={425} color={quiet}>Drucker 等 · 1987</Text>
  </>;
}

function ReceptorGlyph({x, y, blocked, time}: {
  x: number; y: number; blocked: boolean; time: number;
}) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M -35 33 H 35 M -35 45 H 35" stroke={stroke} strokeWidth={3} />
    <path d="M -15 -6 Q -15 13 0 17 Q 15 13 15 -6 M 0 17 V 58"
      fill="none" stroke={blocked ? quiet : C.teal} strokeWidth={7}
      strokeLinecap="round" />
    {blocked ? <path d="M -15 -3 L 0 -13 L 15 -3 L 0 7 Z" fill={C.rose}
      stroke={C.red} strokeWidth={2} /> : <circle cx={0}
        cy={-12 + 2 * Math.sin(time * 1.7)} r={8} fill={C.teal} />}
  </g>;
}

function AnimalBrain({time, progress}: {time: number; progress: number}) {
  const blocked = smooth((progress - .43) / .18);
  return <>
    <Text y={43} size={46} strong>大鼠脑内实验</Text>
    <Text y={118}>脑室给 GLP-1</Text>
    <Flow x1={18} x2={179} y={164} time={time} />
    <ReceptorGlyph x={250} y={123} blocked={false} time={time} />
    <Text x={358} y={173} color={C.teal} strong>进食减少</Text>
    <g transform={`translate(${-20 * (1 - blocked)} 0)`} opacity={blocked}>
      <Text y={278}>先阻断受体</Text>
      <Flow x1={18} x2={179} y={324} time={time} color={quiet} active={.38} />
      <ReceptorGlyph x={250} y={283} blocked time={time} />
      <Text x={358} y={333} color={quiet}>效应被阻断</Text>
    </g>
    <Text y={425} color={quiet}>Turton 等 · 1996</Text>
  </>;
}

function HumanAppetite({time, progress}: {time: number; progress: number}) {
  const result = smooth((progress - .28) / .30);
  return <>
    <Text y={43} size={46} strong>肥胖成人 · 20 周研究</Text>
    <g transform={`translate(120 183) scale(.8) rotate(${2 * Math.sin(time * .35)})`}>
      <ellipse rx={91} ry={66} fill={C.paper} stroke={stroke} strokeWidth={3} />
      <ellipse rx={67} ry={46} fill="none" stroke={stroke} strokeWidth={2} />
      <path d="M -118 -54 V 43 M -128 -54 V -22 Q -118 -8 -108 -22 V -54"
        fill="none" stroke={C.teal} strokeWidth={3} strokeLinecap="round" />
      <path d="M 118 -55 Q 131 -31 118 -7 V 44" fill="none" stroke={C.teal}
        strokeWidth={3} strokeLinecap="round" />
    </g>
    <Text x={275} y={166}>测量一顿饭</Text>
    <Text x={275} y={215}>真正吃下多少</Text>
    <g opacity={result} transform={`translate(${18 * (1 - result)} 0)`}>
      <Text y={333} size={46} color={C.teal} strong>饥饿感 ↓  进食量 ↓</Text>
    </g>
    <Text y={425} color={quiet}>Friedrichsen 等 · 2021</Text>
  </>;
}

/** Reserve x=90…700, y=440…885. Do not overlay Discovery/MechanismCaption here. */
export function Research({s}: {s: FrameState}) {
  const n = Number(s.clip.id.slice(1));
  if (![10, 14, 15, 20, 21].includes(n)) return null;
  const time = (s.frame - s.clip.start) / timeline.fps;
  const remaining = (s.clip.end - s.frame) / timeline.fps;
  const enter = smooth(time / .72);
  const exit = smooth((.72 - remaining) / .72);
  // Entire graphics travel out of the left safe area before removal at the cut.
  const x = -WIDTH * (1 - enter) - WIDTH * exit;
  const props = {time, progress: clamp(s.clipProgress)};
  return <div style={{position: 'absolute', left: 90, top: 440, width: WIDTH,
    height: HEIGHT, overflow: 'hidden', pointerEvents: 'none', zIndex: 11,
    fontFamily: TYPOGRAPHY.family}}>
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{display: 'block', overflow: 'hidden'}}>
      <g transform={`translate(${x} 0)`} fontFamily={TYPOGRAPHY.family}>
        {n === 10 && <OralComparison {...props} />}
        {n === 14 && <ActiveFragment {...props} />}
        {n === 15 && <CultureCell {...props} />}
        {n === 20 && <AnimalBrain {...props} />}
        {n === 21 && <HumanAppetite {...props} />}
      </g>
    </svg>
  </div>;
}
