# WorldV2 视觉修复记录

日期：2026-10-06

本次只修改 `WorldV2.ts`，没有改动 Film、timeline 或音频。官方研究图核对了 NobelPrize.org 的 POP_Fig_2/3/4/5：衣藻眼点→基因进入蛙卵→通道打开与离子流→培养神经元动作电位→活体小鼠光纤链条。

## 修复

- 场景切换：相机位置和 `zoom` 随 `smooth(elapsed / 1.2)` 插值，保留连续推镜。
- 进出场：结构件使用 13.5 world units 的屏外距离；离场组依据正交视野半宽加模型半径判定，只有完全越过视野边缘后才 `visible=false`。
- 确定性：新增 `STEP_COUNT` 与 `voiceStep=(line+lineProgress)/stepCount`，通道离子、神经元蓝光/脉冲、光纤光子、靶细胞和记忆环均由旁白 clip 步骤驱动，跳帧结果一致。
- 神经元对照：control trace 改为恒定 `y=-3.07` 基线，避免复制响应峰形。
- 胡须动画：保存每条线的初始 Y 值，每帧从基准重算，避免 `setY(base+累加)` 漂移。

## 验证

- `npm run check`（TypeScript `tsc --noEmit`）通过。
- 保留浅色象牙背景、蓝/金/珊瑚对比，不引入新模型或修改音画时间线。
- 建议渲染抽帧检查 scene 边界：hook→context、algae→channel、channel→neuron、neuron→brain、brain→impact；重点看离场组在越过画面边缘后才消失，以及 neuron clip 011→012 的蓝光触发。
