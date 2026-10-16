# 参考线渐进描出/收回补丁（待应用）

当前生产 `src/EnvironmentPlayback.ts` 未改。可应用补丁：

```powershell
git apply research/visual-v3/reference-patch/reference-height-reveal.diff
npm run check
```

应用后只需重渲以下最小闭区间；其他帧仅按原代码播放：

- `2678-2994`（89.2667–99.8 s）：核心筒段第一次参照线。
- `6826-7468`（227.5333–248.9333 s）：风致核心筒参照线。

为确保片段边界、编码帧与联系表安全，建议实际命令多含每侧15帧：`2663-3009`、`6811-7483`。补丁只影响 EnvironmentPlayback 的参考组，不改变 GLB、timeline、PhysicsPlayback、风荷载或应力数据。

## 行为

- 轮廓和位移线共用 `referenceTiming(u).draw`，沿 101 个高度点从下往上连续描出；离场时反向收回。两条线保留同一真实空间锚点，描线不会把横向移动误读为变形。
- `connector` 在描线完成后才生长，`referenceDot` 再晚一个短区间出现；退出按反向顺序收回。
- 连接线两端仍为 `p=(-.185,5.80,0)` 与 `p+physics.displacementAt(p)`，顶点与位移差不变。
- BufferGeometry 不在每帧重新分配，`instanceStart/End` 缓冲区重复利用；透明度和宽度保持既有设计。

## 独立验证

`verify-candidate.ts` 在补丁副本中检查 154 个随机/边界采样：

- 包含线段数由 `ceil(draw×100)` 决定，入口和出口不整组跳变。
- 顶点最大真实锚点误差为 0；最大可见高度误差 `2.34e-7` 世界单位。
- 乱序重访帧结果相同，生产源 SHA 在验证后仍为 `9cd565618a6a8a4d4960270e06159e285228aa3f61561eabf7118bf61f99ee05`。
- `candidate-qa.json` 保存输出。

补丁必须在最终编码确认参考线突变后再应用；应用后重新检查两段扩展范围和最终 coda 入口，确认参考线渐进出现没有覆盖标题/字幕。
