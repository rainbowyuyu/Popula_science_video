# V5 同一人体的生活动作模块

## 接入

```ts
import {V5Person, neutralizeBodyGeometry} from './V5Person';

// 必须在 Person / Measure 各自缓存顶点前执行；重复调用幂等。
neutralizeBodyGeometry(world.organs.body);
const person = new V5Person(world.organs.body);
world.scene.add(person.root);
world.meal.position.y = -.225;

person.update({
  time: frame / 30,
  actionWeights: {eat: 1},
  weight: 1,
  adiposity: .68,
  propsOpacity: 1,
  wardrobeOpacity: 1,
});
```

`actionWeights` 已含权重时，`weight` 应保持 1。不要同时将两处权重都设为同一个渐变值，除非有意平方衰减。所有运动只由传入时间和参数决定。

支持 `stand / eat / walk / sitStand / resistance`。`eat` 为坐姿、原尺度餐桌、手掌与勺柄接触、勺尖触米饭和小幅舀取。原图谱没有可验证的手指骨骼，因此没有增加假吞咽或张掌遮脸的动作。`walk` 为原地步态示意；`resistance` 为徒手小幅屈膝；`sitStand` 为椅前坐站教学示意。动作不是动作捕捉或康复训练处方。

可以在相邻动作间使用：

```ts
person.update({time, actionWeights: {walk: 1 - q, resistance: q}});
// 或者 previousAction + transition；transition 输入已安排好的连续 0–1 权重。
person.update({time, previousAction: 'walk', action: 'resistance', transition: q});
```

`seatedWeight` 是**可选强制覆盖值**。通常省略，让动作自行产生坐姿；非进餐场景不能固定传 `seatedWeight: 0`，否则会使 `sitStand` 的直腿穿过椅座。独立预览 `actual-5413.jpg` 使用默认内建坐姿。坐姿期间原器官仍在站姿基准，外部生活段应隐藏器官，恢复站姿后再进入解剖。人体和器官从未进行整体缩放。

`resetPose()` 恢复中性站姿并隐藏道具。Person 与 Measure 不能同时争用人体顶点；测压时建议 Person 只负责衣物，再由 Measure 写皮肤，退出测压时恢复皮肤。模块通过顶点哨兵检测外部姿态写入，静态解剖段可缓存而不遗漏复位。

`opacity / wardrobeOpacity / propsOpacity` 控制本模块衣物与道具；人体皮肤的透明和深度策略仍由主 World 负责。浅色背景推荐外部生活段皮肤接近完全不透明；进入解剖前再渐透明。

### 测血压服装同步

新增 `measurementWeight?: number`（0–1，默认 0）。在正常 `person.update` 中传入与 `V5Measure.update` 相同的权重：

```ts
person.update({...personState, measurementWeight});
measure.update(measurementWeight);
```

它只把服装插值到测量模块的髋膝坐姿，包含骨盆下移 0.45 m；不移动测压模块、不重复写测压皮肤。测压身体没有腰腹轮廓参数，服装在 `measurementWeight=1` 时也回到中性轮廓。退出时服装按同一权重回到生活姿态。

不要用 `seatedWeight=measurementWeight` 代替这个参数。`seatedWeight` 仍负责生活动作坐姿；测量家具由 `V5Measure` 拥有。Person 自身椅子、餐具的透明度自动再乘 `1-measurementWeight`，完整测量段没有第二把椅子。

新增独立预览 `measurement-quarter / half / full / side / front / detail`，已经实际检查完整测量的三个方向与服装近景：短裤回到骨盆，青色硬领已消失。原服装在坐姿前缘的弧形开口和图谱大腿局部折面依旧是已知模型限制，本次未改 V5Measure。

## 锚点与单位

全部采用米、+Y 向上、+Z 人体前方，与原 BodyParts3D 保持一致。

| 锚点 | 默认世界坐标 | 用途 |
| --- | --- | --- |
| mealPerson | `[0, .71, .12]` | 坐姿餐桌中景 |
| mealBowl | `[.055, .809, .43]` | 饭碗上方食物 |
| mealMouth | 坐姿 `[0, 1.084, .095]` | 根据姿态更新嘴部 |
| mealHand | 动态 | 手掌中的勺柄接触位置 |
| personTorso | `[0, 1.18-.45*seated, 0]` | 上半身 |
| personActivity | `[0, .88-.45*seated, .03]` | 全身生活活动 |
| personHip | `[0, .91, 0]` | 站姿骨盆基准 |
| personFoot | `[.10, .025, .06]` | 站姿足部基准 |

## 中性外观和腰腹变化

`neutralizeBodyGeometry` 将原下体外部起伏收束为中性骨盆包络，并用独立的连续短裤表面完成各角度遮挡。原 GLB 文件没有被改写。不要在外部全景中单独去掉短裤；中性化原表面仍有图谱网格局部折面，近景并非角色级重拓扑皮肤。

短裤由 Blender 体素并集、平滑、裆部开口和腰口/裤脚裁切生成，具有单一网格表面，消除原先多个投影三角形重叠的闪面。衣物随同人体腿部姿态变形。

`adiposity` 在 0–1 内改变腰腹外表，最大侧向约 2.6 cm、前向约 3.7 cm。**这是皮下轮廓教学示意，不是公斤数预测**；不缩小骨骼、器官、头部、肢体长度或身高。应通过连续权重减小，不做瞬间胖瘦切换。

## 可复现文件

- `src/V5Person.ts`：姿态、IK、动作混合、轮廓、道具。
- `src/V5PersonWeights.json`：对原图谱 22,902 顶点的拓扑约束谐和蒙皮权重。
- `src/V5Garment.json`：Blender 生成的衣物网格。
- `research/revision-v5/build_person_weights.py`：真实 Blender 骨骼热权重实验和衣物生成。裸热权重在肩胸串扰，保留于 `person-blender-raw-weights.json`，不用于最终蒙皮。
- `research/revision-v5/refine_person_weights.py`：SciPy 在焊接拓扑上求解约束谐和影响域，改善肩胸串扰。
- `research/revision-v5/preview-person.mjs`：Three.js 独立实际渲染、非顺序定位检查；`--motion` 生成 30 fps 进餐镜头。
- `research/revision-v5/person-preview/`：预览、元数据与检查记录。

## 检查范围

实际查看过正面、侧面、背面、坐姿全景、手臂近景、起立中间姿态、行走、轻屈膝、动作混合和腰腹对照。修复过程包括：肩胸大三角拉伸、衣物重叠闪面、下体外部轮廓、嘴部锚点、勺柄方向、坐姿覆盖参数、行走覆盖屈膝造成脚下沉、服装腿部截面和静态姿态复位。

独立预览使用不透明皮肤；最终影片的透明排序、主摄影机、字幕遮挡与完整连续镜头仍需在 V5Film 最终渲染中检验。模块完成不等同于最终影片验收。
