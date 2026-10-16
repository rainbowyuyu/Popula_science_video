# 斑块动画遮挡根因：透明对象排序

## 观察与复现

实际成片 `07757.jpg`、`07939.jpg` 出现了相应解说和标签，但病变只剩光滑管壁，黄色脂质核心、泡沫细胞与血栓不可辨认。

独立脚本 `scripts/hypertension/debug_plaque_v5.mjs` 直接加载当时生产 World、CameraPath 与 VascularDetail，调用真实 build 方法、积分与 render 状态更新，然后记录材质、局部摄影机、网格投影及相机至病变中心的管壁射线交点。GPU renderer 为 no-op；所以下述几何/状态证据没有冒充像素渲染。

原始证据见 `plaque-v5-debug.json`，该文件的 sourceHash 指向修正前的 World。

- 7757帧：脂质核心 opacity≈0.78，泡沫细胞 opacity=1；核心投影范围约 x851—975 / y419—659，并非在画面外。局部摄影机为 [-0.245, 0.855, 2.231]，从剖口正面观看。
- 7939帧：血栓 opacity≈0.98，血小板 opacity=1；血栓投影约 x929—996 / y491—568。局部摄影机为 [-0.009, 0.124, 2.019]。
- plaque 及 vessel 两个 root 均 visible=true；aortaDetailVisibility 没有在这些帧把病变置零。
- 相机射线到纤维帽、泡沫细胞、血栓中心之前没有管壁交点；脂质核心中心位于壁内，因此存在壁面交点。这与病变所在组织层次相符。

## 根因

病变全部是透明材质，render() 在合成可见性后统一强制 depthWrite=false。管壁同样为透明材质、opacity=.92、depthWrite=false。初始所有对象 renderOrder=0。

当前 Three.js `WebGLRenderer` 用 geometry.boundingSphere 的中心投影计算透明对象排序深度；`WebGLRenderLists.reversePainterSortStable()` 依次比较 groupOrder、renderOrder、深度。管壁整体中心比壁后侧局部病变的中心更接近摄影机，因而透明管壁整个网格在病变之后绘制。透明队列只按整体对象排序，不能正确处理同一个管壁网格与其内侧病变的空间交织；未写入深度的病变被随后绘制的高不透明度管壁覆盖。

因此主要缺陷是透明合成顺序，而非病变时间、父对象隐藏、镜头方向或投影位置错误。脂质核心本身位于壁内，展示它还具有管壁透视示意含义，应在交付说明解释。

## 已由根代理实施的最小修正

`buildPlaque` 将病变 Group 的 `renderOrder` 设置为 3。Three.js 会把它作为后续子网格的 groupOrder，病变统一在管壁之后合成，同时继续使用 depthTest=true，没有关闭深度测试。

根代理已实际GPU重渲染7757/7939两帧并确认黄色脂质池、泡沫细胞、血小板与暗红血栓恢复可见。该GPU确认由根代理完成；本脚本提供独立几何和状态依据。

全片逐帧材质影响范围另见 `plaque-v5-impact.json`。该审核检查每个非零alpha帧及零alpha材质是否写深度，供决定局部重渲染边界使用，不替代最终编码帧检查。

补充视觉核对：本审计代理随后也打开并检查了根代理新渲染的 `output/hypertension/frame-7757.jpg` 与 `frame-7939.jpg`。前者已清楚显示黄色脂质池、内含小滴的泡沫细胞及进入的黄色LDL粒子；后者显示池表面的暗红血栓与血小板。前景红细胞仍能局部遮挡病变，符合保持depthTest的修正。这里只核对两张实际GPU静帧，最终编码片段仍由主流程检查。

后续退出镜头补充（独立于透明排序修正）：最后加入8011—8180帧的atlas恢复条件块，防止8047帧剖管已关闭、整体解剖仍几乎透明。`plaque-visibility-scope-v5.json` 现在按版本保留证据：旧sourceHash的9671帧完整检查放在 `fullFrameVerification`；当前sourceHash通过精确源码重建比对及8010、8011、8025、8047、8065、8180、8181共7个时刻的新旧实际render状态对照验证。当前版本没有重新执行9671帧循环。

8047帧当前版的atlas主动脉opacity=.55、心脏=.63；旧版两者均≈.0008，而两版该帧的剖管及病变alpha均为0。新条件块只读取既有状态并调整当帧局部macro变量，其执行时间窗为8011—8180帧，不会改变病变alpha或摄影机状态。相关代码被精确删除、let恢复const后，原文SHA256严格复原为此前完成全帧审核的版本。旧病变影响区间7501—8046与新atlas恢复区间8011—8180均完全包含在7430—8180的替换片段里。独立原始对照结果见 `plaque-handoff-scope-v5.json`。
