# v7 天空、玻璃与镜头参考

本轮延续 v6 的建筑场景，并复查以下开源实现。2026-10-09 的链接访问状态、内容长度与 SHA256 见 `v7-reference-fetch.json`。

| 参考 | 在本片的用途 |
| --- | --- |
| [Three.js Sky](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Sky.js) | 连续天空、太阳方向与大气散射；项目已使用 Sky，非静态天空幻灯片。 |
| [PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html) | 将 HDR 环境预滤波为不同粗糙度的反射，统一玻璃、金属与结构材质。 |
| [Three.js physical transmission](https://threejs.org/examples/webgl_materials_physical_transmission.html) | 复核玻璃的 transmission、roughness、IOR 与环境反射关系。塔楼外观保留低强度透射；结构讲解使用显式透明关系。 |
| [drei ContactShadows](https://github.com/pmndrs/drei/blob/master/src/core/ContactShadows.tsx) | 参考深度阴影、双向模糊及地面承接的组织方法；本片未直接复制此组件，采用固定太阳方向和按真实焦点收紧的阴影视锥。 |

## 本轮实际修改

- 固定光照方向，近景按摄影机实际焦点缩小阴影视锥；阴影中心在光空间对齐纹素，避免随镜头任意转灯。
- 远景窗框按物理线宽的屏幕投影连续降低细节对比，近景恢复完整网格。未挪动玻璃表面或 CFD 注册坐标。
- 幕墙按整组套层开合；内部杆件分层展开，保持回装路径连续。
- 真实计算流线、表面压力和速度剖面使用原始物理坐标。流线沿路径生长与退出，剖面在固定截面扫描出现，不平移风场穿过建筑。
- 分别保留结构位移、应力增量、Cp 和速度的单位与固定色标。环境光与画面配色不改变求解值。

光照与立面专项证据：`research/qa/v7-environment-review.md`。最终质量仍须以最终编码文件的检查记录为准；参考网页与源码检查不能替代成片验收。
