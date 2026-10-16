# 上海中心教学拆解模型

模型由 Blender 5.1 脚本重新生成，既保留同一座建筑的整体关系，也允许分区揭开外幕墙、拆出楼板、展示核心筒与巨柱和伸臂桁架。它是基于公开资料的教学重建，**不是施工 BIM、竣工测绘或安全计算模型**。

原生工程：`model/shanghai-tower.blend`。运行 `D:/blender/blender.exe --background --factory-startup --python scripts/build_tower.py` 可重新导出 `public/models/shanghai-tower.glb` 及语义 manifest。

Blender 使用米制 Z-up。GLB 使用米制 Y-up，坐标为 `[x,z,-y]`。所有语义节点原点均为世界零点，网格保留装配坐标。Three.js 导入后统一乘 0.01，可把 632 m 映射为 6.32 渲染单位；manifest 的所有坐标也应乘相同系数。

GLB 包含完整楼体、九区分组、独立前后楼板、四面空心核心筒、分区巨柱、伸臂/腰桁架、圆形内幕墙、60 组外幕墙揭片、桩筏基础与地下剖面、塔冠及 TMD。外壳分成六扇区是为了动画，不代表真实幕墙只有六条接缝。每一层内楼板保持圆形、核心筒不随外玻璃旋转。

manifest.parts 提供每件的 `role`、`parent`、`groupCenterThree`、`bboxThree`、`explodeVectorThree`；`forceAnchorsThree` 提供实际生成构件上的传力路径锚点，`tmdAnchorsThree` 区分随重物运动的磁阵与固定钢架/铜板。传力箭头是机理可视化，不是有限元计算结果。

全局高度、旋转角和基础关键尺寸来自施工方论文。九区边界依据建筑师公开剖面按比例量测后重建，未冒称精确标高。幕墙样条、楼板细节、构件截面、桩位和 TMD 尺寸均有简化，完整证据与限制见 `research/model-source-parameters.json`。
