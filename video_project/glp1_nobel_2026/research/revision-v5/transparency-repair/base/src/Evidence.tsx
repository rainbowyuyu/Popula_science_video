import React from 'react';
import {TYPOGRAPHY} from './Scale';
import {Img, staticFile} from 'remotion';
import {C, clamp, smooth, type FrameState, type Timeline} from './visual';

const font = TYPOGRAPHY.family;
const numerals = TYPOGRAPHY.family;
const quiet = '#647978';

type Group = 'step1' | 'select' | 'withdrawal';
const groups: Record<Group, readonly [string, string]> = {
  step1: ['g033', 'g036'],
  select: ['g037', 'g039'],
  withdrawal: ['g041', 'g042'],
};

function groupOf(id: string): Group | null {
  if (['g033', 'g034', 'g035', 'g036'].includes(id)) return 'step1';
  if (['g037', 'g038', 'g039'].includes(id)) return 'select';
  if (['g041', 'g042'].includes(id)) return 'withdrawal';
  return null;
}

/** Reveal a fixed endpoint comparison. The animation is not a time series. */
function EndpointBar({label, value, max, color, reveal, compact = false}: {
  label: string; value: number; max: number; color: string;
  reveal: number; compact?: boolean;
}) {
  const height = compact ? 91 : 111;
  return <div style={{height, position: 'relative'}}>
    <div style={{position: 'absolute', left: 0, top: compact ? 14 : 20,
      fontSize: 36, fontWeight: 600, lineHeight: 1.2, color: C.ink}}>
      {label}
    </div>
    <div style={{position: 'absolute', right: 0, top: compact ? -9 : -4,
      fontFamily: numerals, fontSize: 72, lineHeight: 1.06, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums', color}}>
      {value.toFixed(1)}<span style={{fontSize: 36, marginLeft: 5}}>%</span>
    </div>
    <div style={{position: 'absolute', bottom: compact ? 7 : 14, left: 0,
      width: 570, height: 15, borderRadius: 8,
      background: 'rgba(41,72,74,0.085)'}}>
      <div style={{height: '100%', width: `${100 * value / max}%`,
        borderRadius: 8, background: color,
        clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0 round 8px)`}} />
    </div>
  </div>;
}

function StepOne({reveal}: {reveal: number}) {
  return <>
    <div style={{fontSize: 36, fontWeight: 600, letterSpacing: 1, lineHeight: 1.2}}>
      STEP 1 <span style={{color: quiet, fontSize: 36, fontWeight: 500}}>· 1,961 人 · 68 周</span>
    </div>
    <div style={{fontSize: 46, fontWeight: 650, lineHeight: 1.25, marginTop: 8}}>
      平均体重降幅
    </div>
    <div style={{marginTop: 23}}>
      <EndpointBar label="司美格鲁肽" value={14.9} max={15} color={C.teal}
        reveal={reveal} />
      <EndpointBar label="安慰剂" value={2.4} max={15} color={C.rose}
        reveal={reveal} />
    </div>
    <div style={{fontSize: 36, lineHeight: 1.28, marginTop: 10, color: quiet}}>
      <div>两组均有生活方式干预 · 药物 2.4 mg/周</div>
      <div>无糖尿病；BMI ≥30 或 ≥27 伴相关合并症</div>
    </div>
  </>;
}

function SelectTrial({reveal}: {reveal: number}) {
  return <>
    <div style={{fontSize: 46, lineHeight: 1.18, fontWeight: 650}}>
      SELECT <span style={{fontSize: 36, fontWeight: 600}}>· 主要心血管事件</span>
    </div>
    <div style={{fontSize: 36, color: quiet, lineHeight: 1.2, marginTop: 8}}>
      <div>超重或肥胖 · 已有心血管病 · 无糖尿病</div>
      <div style={{marginTop: 5}}>≥45 岁 · 17,604 人 · 随访 39.8 个月</div>
    </div>
    <div style={{marginTop: 12}}>
      <EndpointBar label="司美格鲁肽" value={6.5} max={10} color={C.teal}
        reveal={reveal} compact />
      <EndpointBar label="安慰剂" value={8.0} max={10} color={C.rose}
        reveal={reveal} compact />
    </div>
    <div style={{marginTop: 8}}>
      <div style={{fontSize: 36, color: quiet, lineHeight: 1.15}}>换成每 100 人来理解</div>
      <div style={{fontSize: 46, fontWeight: 600, lineHeight: 1.2, color: C.teal, marginTop: 8}}>
        约少 <span style={{fontFamily: numerals, fontSize: 72}}>1.5</span> 人发生
      </div>
    </div>
    <div style={{fontSize: 36, color: quiet, marginTop: 2, lineHeight: 1.18}}>
      心血管死亡、非致死性心梗或卒中
    </div>
  </>;
}

function Withdrawal({reveal}: {reveal: number}) {
  return <>
    <div style={{fontSize: 36, fontWeight: 600, lineHeight: 1.2}}>STEP 1 延伸随访</div>
    <div style={{fontSize: 36, color: quiet, marginTop: 13, lineHeight: 1.2}}>
      327 人 · 停止干预后 52 周
    </div>
    <div style={{fontSize: 46, fontWeight: 600, marginTop: 14, lineHeight: 1.2}}>
      原药物组：此前减重平均回升
    </div>
    <div style={{color: C.red, fontFamily: numerals, fontSize: 72,
      fontWeight: 600, lineHeight: 1.15, marginTop: 3}}>
      <span style={{fontFamily: font, fontSize: 46, marginRight: 12}}>约</span>2/3
    </div>
    <div style={{fontSize: 36, color: quiet, marginTop: 2, lineHeight: 1.2}}>以此前减重为 100%</div>
    <div style={{display: 'flex', gap: 10, marginTop: 10, height: 29,
      clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`}}>
      {[C.rose, C.rose, C.aqua].map((color, i) =>
        <div key={i} style={{flex: 1, background: color, borderRadius: 4}} />)}
    </div>
    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 36,
      color: quiet, marginTop: 7, lineHeight: 1.2}}>
      <span>回升部分</span><span>仍保留的减重</span>
    </div>
    <div style={{fontSize: 36, color: quiet, lineHeight: 1.3, marginTop: 15}}>
      <div>第 68 周：停药 + 结束研究生活方式干预</div>
      <div>原药物组平均仍比基线低 5.6%</div>
    </div>
  </>;
}

export function Evidence({state, timeline}: {state: FrameState; timeline: Timeline}) {
  const group = groupOf(state.clip.id);
  if (!group) return null;
  const [firstId, lastId] = groups[group];
  const first = timeline.clips.find(c => c.id === firstId);
  const last = timeline.clips.find(c => c.id === lastId);
  if (!first || !last || state.frame < first.start || state.frame >= last.end) return null;
  const elapsed = (state.frame - first.start) / timeline.fps;
  const remaining = (last.end - state.frame) / timeline.fps;
  const enter = smooth(elapsed / 0.65);
  const exit = smooth((0.7 - remaining) / 0.7);
  const opacity = smooth(elapsed / 0.48) * smooth(remaining / 0.55);
  const reveal = smooth((elapsed - 0.3) / 1.35);
  return <div style={{position: 'absolute', left: 90, top: 380, width: 810,
    fontFamily: font, color: C.ink, opacity, zIndex: 10, pointerEvents: 'none',
    transform: `translateX(${56 * (1 - enter) - 64 * exit}px)`}}>
    {group === 'step1' && <StepOne reveal={reveal} />}
    {group === 'select' && <SelectTrial reveal={reveal} />}
    {group === 'withdrawal' && <Withdrawal reveal={reveal} />}
  </div>;
}

const papers = [
  {image: 'papers/mojsov1987_page1.jpg', author: 'Mojsov 等 · 1987',
    subject: '活性肽促进胰岛素释放', x: 290, y: 279, width: 470,
    aspect: 1224 / 1584, rotate: -2.5, yaw: -7, z: 1},
  {image: 'papers/drucker1987_page1.jpg', author: 'Drucker 等 · 1987',
    subject: '细胞内信号与基因表达', x: 710, y: 252, width: 470,
    aspect: 816 / 1074, rotate: 0.6, yaw: 0, z: 3},
  {image: 'papers/discovery2019_page1.jpg', author: 'Knudsen、Lau · 2019',
    subject: '从天然信号到长效药物', x: 1130, y: 294, width: 470,
    aspect: 1191 / 1560, rotate: 2.4, yaw: 7, z: 2},
] as const;

/** All three images are unaltered original paper pages, not designed facsimiles. */
export function PaperCoda({frame, timeline}: {frame: number; timeline: Timeline}) {
  const start = timeline.duration - 9 * timeline.fps;
  if (frame < start || frame >= timeline.duration) return null;
  const elapsed = (frame - start) / timeline.fps;
  const fade = smooth(elapsed / 0.65);
  return <div style={{position: 'absolute', inset: 0, zIndex: 15,
    pointerEvents: 'none', color: C.ink, fontFamily: font}}>
    <div style={{position: 'absolute', left: 92, top: 175, fontSize: 72,
      lineHeight: 1.2, letterSpacing: 1, fontWeight: 650, opacity: fade,
      transform: `translateX(${26 * (1 - fade)}px)`}}>
      证据，从发现到治疗
    </div>
    {papers.map((paper, index) => {
      // The last card stops at 2.42 seconds, leaving 6.58 seconds fully still.
      const enter = smooth(clamp((elapsed - index * 0.21) / 2));
      const paperHeight = paper.width / paper.aspect;
      return <div key={paper.image} style={{position: 'absolute', left: paper.x,
        top: paper.y, width: paper.width, zIndex: paper.z, opacity: enter,
        transform: `translate3d(${96 * (1 - enter)}px, 0, 0)`}}>
        <div style={{perspective: 1500, perspectiveOrigin: '50% 35%'}}>
          <div style={{width: paper.width, height: paperHeight, background: '#fff',
            transformOrigin: '50% 55%',
            transform: `rotateY(${paper.yaw}deg) rotateZ(${paper.rotate + 1.5 * (1 - enter)}deg)`,
            boxShadow: '0 21px 34px rgba(59,51,40,0.12), 0 3px 8px rgba(59,51,40,0.10)'}}>
            <Img src={staticFile(paper.image)} style={{display: 'block', width: '100%',
              height: '100%', objectFit: 'contain'}} />
          </div>
        </div>
        <div style={{marginTop: 24, paddingLeft: 8, fontSize: 36, lineHeight: 1.28}}>
          <div style={{fontWeight: 650}}>{paper.author}</div>
          <div style={{color: quiet, fontSize: 36, marginTop: 5}}>{paper.subject}</div>
        </div>
      </div>;
    })}
  </div>;
}
