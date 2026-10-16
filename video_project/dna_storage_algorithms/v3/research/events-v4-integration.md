# V4 旁白语义事件审计与接入

日期：2026-10-11。初次任务新增 `src/EventsV4.ts` 与审计结果；随后经主代理授权，已接入 `StationsV4`，主代理负责接入 `FilmV4`。

## 解决的问题

当前 n19 的三个标签使用 `cue.start + 3.05 / +5.95` 分段，模型却使用 `err + i*2.4` 起动。在语速变化、章内句长变化时，两条时间规则必然产生偏移；即使整章采用 C2 时间映射，也不能修复章内的相对偏移。

新 helper 把字幕视为真实音频时间，把 Three.js 时间视为 scene time。所有事件端点都经过同一个 `sceneTimeV4` 映射。标签和机制入场可读取同一份事件。

## 事件来源与回退

优先用当前 cue 对应字幕的解释短语：

| 事件 | 优先锚点 | 备用术语 |
|---|---|---|
| substitution | 一个字母认成另一个 / 认成另一个 | 替换 |
| insertion | 多一个 | 插入 |
| deletion | 少一个 | 缺失 |

字幕恰好以锚点开头时使用字幕边界。锚点位于合并字幕内部时，按字符位置估计，并明确标成 `caption-text-fraction`，不冒充 ASR 词级时间。字幕缺失或落在当前 cue 之外时，转用当前口播文本中的字符位置；仍无匹配时按当前 cue 实测时长的保守比例回退。cue 不存在时返回空数组，画面不会产生 NaN 或沿用错误的旧秒数。

相邻标签窗口为互不重叠的 `[start,end)`；端点做有序修复，`wasOrderRepaired` 会记录修复。默认入场占真实音频 3.2 秒，在语义短语开始后 0.15 秒内落位。入场进度采用五次 smoothstep，不要在它外面再套 `ease()`。

## 建议接入

FilmV4 导入：

```ts
import {ERROR_EVENTS_V4} from './EventsV4';
```

移除现有 `errorCue`/`cuts` 硬编码块，替换为：

```ts
for (const event of ERROR_EVENTS_V4) {
  const callout = callouts.find(c => c.text === event.label);
  if (callout) {
    callout.from = event.sceneStartSec;
    callout.to = event.sceneEndSec;
  }
}
```

StationsV4 导入：

```ts
import {ERROR_EVENTS_V4, eventMotionProgressV4} from '../EventsV4';
```

替换 errors 的 `enter` 计算：

```ts
const enter = eventMotionProgressV4(ERROR_EVENTS_V4[i], t + 118);
g.position.x = 2.5;
g.position.y = lerp(10 + i * .35, [1.4, .28, -.84][i], enter);
```

其中 `t` 是 Wetlab 的局部 scene time，因此必须加 118；不能传物理音频时间。更新自动生成脚本时也应同步上述接入，否则重新运行生成器会覆盖入口修复。

## 当前占位数据结果

目前 narration-v4/captions-v4 仍是旧版时间占位。此次结果不应当作最终 TTS 校对结论：

| 事件 | 当前音频起点 | 当前标签终点 | 来源 |
|---|---:|---:|---|
| 替换 | 143.171 | 146.300 | 字幕内部短语位置估计 |
| 插入 | 146.300 | 148.033 | 字幕边界 |
| 缺失 | 148.033 | 150.255 | 字幕边界 |

最终字幕写入后重新 bundle，事件会从新 JSON 自动重算。

## 同轮只读审计的其他关联点

- n14 Fountain：B 恢复当前用 cue 起点后 6 秒，C 用额外 3.9 秒后 6 秒。新配音若“再用乙”提前/延后，B/C 图解会偏。可用同一 resolver 定义 `先找到甲` 与 `再用乙` 两事件，替换固定 3.9 秒。
- n08 退回重编：失败序列目前只在站点初期从上方落位，n08 真正讲“退回重编”时没有独立退回动作；这是视觉语义缺口，不是时间映射问题。若补充动作，应锚定该字幕短语。
- n25 矩阵回溯：现在 cue 一开始就启动回走，而“沿高分路径往回走”在该 cue 的第二条字幕。可以将回溯起点锚定第二条字幕。
- n27 的共识开始、n33 的候选拒绝已使用各自 cue 起点，粗粒度同步成立；如果需要说到“权重更高”才突显可靠副本，可再拆子事件。
- `缺失的片段` Callout 仍是固定 91–100 秒（未加入 voiceLabels）。新旁白变化后应与 n10/n12 的实际解释段匹配，避免仅在章映射时间下维持旧窗口。
- n20 “整条没读到”目前没有专门整链丢读动画。标签替换/插入/缺失不会代替这个概念，扩展时应另加事件。

## 检查

`npm run check` PASS。CPU resolver 运行了当前字幕、全部字幕缺失、整句合并、过期字幕、无匹配词、cue缺失 6 种场景，所有生成窗口单调、有限且无标签重叠。报告：`research/events-v4-qa.json`。最终新 TTS 声画仍待渲染审核。

## 已接入的语义动画

- n19：三条错误读段使用共享 `ERROR_EVENTS_V4` 入场进度。
- n14：新增 `FOUNTAIN_EVENTS_V4`，B 恢复对齐“先找到甲”，C 恢复对齐“再用乙”；每个恢复过程在各自短语时间窗内完成。C 恢复时 B 公式向上离场，保留恢复后的 B 数据块。
- n25：新增 `MATRIX_EVENTS_V4`，回溯在“沿高分路径往回走”字幕开始时启动，而不是整句 cue 开始时启动。
- n08：新增 `CONSTRAINT_EVENTS_V4`，说到“退回重编”时让重复序列沿上方轨道退出，持续真实音频 3.2 秒。
- n20：新增 `DROPOUT_EVENTS_V4`，说到“整条没读到”时让一整条读段向上退出，保留其余副本。避免使用横向大位移而侵入邻站。

上述新动作均由帧时间确定，不调用隐藏开关，不依赖上一帧状态。接入后 `npm run check`、`qa_motion_state_v4.mjs`、`qa_cross_station_v4.mjs` 均 PASS。Fountain 最大单帧位移 0.281，Wetlab 0.273，全部站点 projected jumps 和 visibility toggles 为 0。

缺片与 n13 标签一致性：B/C 在场景 87–90 秒抽出，n13 的异或讲解窗口内保持缺失；n14 语义事件开始后才分别恢复。
