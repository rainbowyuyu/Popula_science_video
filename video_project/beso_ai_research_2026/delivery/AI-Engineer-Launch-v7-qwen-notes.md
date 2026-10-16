# AI Engineer v7 · Qwen概念桥接交付记录

共提交9条独立5秒WAN任务，6条选用、3条因叶片扫入低空结构近景拒绝。全部原片和输入已保留。北京区1080P名义价格1元/输出秒，名义合计45元；实际账单尚未核对。

选用片段均为1920×1080、5秒、30fps，按60fps成片时间线正常速度播放，生成音轨静音。主旁白使用rainbow鱼正式母带。每段首尾20帧与原生同几何画面匹配交叠；概念标由Remotion添加。

| 片段 | 成片区间 | 用途 |
|---|---|---|
| v7-ocean-drone-r3 | 0.0–5.0秒 | low-altitude-ocean-camera-concept |
| v7-drawing-emergence | 11.0–16.0秒 | drawing-to-same-rigid-hull-concept |
| v7-mesh-materialize | 25.0–30.0秒 | same-saved-domain-camera-concept |
| v7-underwater-follow | 44.0–49.0秒 | subsurface-mooring-follow-concept |
| v7-joint-parametric-r2 | 65.0–70.0秒 | parametric-outline-to-same-native-joint-concept |
| v7-report-hero | 96.0–101.0秒 | same-outline-report-to-complete-turbine-concept |


只生成材质、运镜与水体概念；数值、BESO真实演化、保存Z-wind响应与软件界面由原生证据提供。BESO桥接首尾均为同一个state000，不生成优化结果。水下金色缆绳沿用首尾原生识别标记，不能当作生成张力求解。

drawing首帧实际输入是已批准r2：浅灰填充与原生缆绳轮廓。后发r3纯线稿没有替换实际API输入。最终manifest的firstAnchor指向不可变实际提交副本，原生接入以该副本为参考。connection-r2首图presentation仅隐藏rotor皮肤，原生物理骨架保持不变。

拒绝片：

- v7-ocean-drone：21 samples show rotor blades repeatedly entering low platform close-up; hub is far above this view, creating an impossible scale and motion. Root visually rejected; preserve original, use distinct revision task.
- v7-joint-parametric：Root reviewed 21 samples and rejected large rotor-blade strip sweeping over hub/platform close-up during 2–3.3 seconds. Preserve original; next task requires rotor-free native blueprint first frame.
- v7-ocean-drone-r2：Second attempt still invents low sweeping rotating rotor blades from 0.5–4.75 seconds despite explicit exclusion prompt. Geometry scale and view are impossible; never composite this clip. Preserve exact inputs, original asset, and task record.


QA：9条原片完整解码成功，每条21等距帧和首尾原生对照已审，全部尺寸/时长通过。完整正常速度合成审看仍由最终成片QA完成，本批记录不冒称已逐帧人工看完或主观听审。

台账：`research/generation/qwen-v7-tasks.json`。最终选用：`research/generation/launch-v7-bridges.json`。冻结：`research/generation/qwen-v7-final-freeze.json`。样帧与端点对照：`work/qwen-v7-qa/<task>/`。生成已关闭，不再追加付费任务。

官方资料：

- https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference
- https://help.aliyun.com/zh/model-studio/model-pricing

片尾抽帧后，主代理优化概念标的前景对比：drawing与connection线稿首1秒用深色，其后海面阶段及其余片段用白字和轻阴影；toolchain标题及学校Logo同步采用浅色。此次只调整后期标记，原始生成素材、选片、时间线和manifest均保持原SHA。当前桥接component源码SHA已更新至冻结清单。
