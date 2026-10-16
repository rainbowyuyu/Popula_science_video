# 用户本地 Model1 身份核验

只读检查：`C:\Users\zju\Downloads\Model1\Model1`。未执行 Tcl 或 DLL。

**结论：不是上海中心原始模型。目录内 10 个文件与作者公开的 606 m Mega-tall Building Benchmark Model1 逐字节完全一致。**

- 节点：27,220；单元：50,350，其中 dispBeamColumn 29,550, ShellMITC4 16,616, elasticBeamColumn 616, truss 3,568。
- 原模型为 Z 轴向上，Z 范围 0.0–606.1 m，总高 606.1 m。
- 128 组刚性楼板；128 个 storyx 记录节点；257 个有限元网格标高。网格标高数量不冒称建筑楼层数。
- 入口为 dynamiccpu.tcl / dynamicgpu.tcl，定义重力和 El Centro 地震时程；本目录不带说明文档。
- 上海中心原作者模型文献规模是 632 m、53,006 节点、48,774 纤维梁与39,315 壳；本目录与其不符。
- 依据用户“是上海中心才复制并计算”的条件，本目录保持原地只读，没有复制为上海中心，也没有计算该基准。

精确文件SHA256、节点/单元统计、参考ZIP哈希见 `audit.json`。官方来源：
https://opensees.berkeley.edu/wiki/index.php?title=Mega-Tall_Building_Benchmark_Models

原作者下载包：http://www.thu-civil.net/download/OpenSees-Mega-tall-Building.zip
