# V07 雨后环境与观察者

`EnvironmentV07.ts` 由确定性 Three.js 几何和着色器同步创建环境。没有外部 API，没有真实时钟、RAF 或随机种子漂移。首次构造一次 PMREM，逐帧只更新雨线、雾和微距可读性。

视觉采用珍珠白、浅青和暖米色；天空、四层低对比远山及两层极远林线建立纵深。前景草丛、球团树冠与棋盘色差已在静帧检查后删除。石台接缝细而轻，湿石反射来自环境贴图近似；没有宣称真实 SSR 或测量数据。微距时地面、雨幕与林线整体退出，保留天空与反射，使光路保持焦点。

接口：`new EnvironmentV07(renderer, scene)`，`group`，`environment`，`update(frame, micro)`，`dispose()`。调用方可以用 `setReflectionEnvironment(texture)` 注入已核实来源的 HDRI；该纹理由调用方保有并负责销毁。同步 PMREM 是可用回退，不需要额外下载。

与原世界集成时跳过旧 `nature` 和旧环境灯，仅保留喷泉水面及池沿。地面圆孔准确位于 Three.js XZ `(-3,3)`，半径 `1.49`。地面 Y `-0.045`，接收主灯 PCF 接触阴影；主灯来自观察者背后的 +Z 高处，与彩虹方向一致。微距参数使用光学世界已有 `microVis`。

`observer_v07.glb` 由当前脚本完整建模并通过实际 GLTFLoader 解析；单位米，地面 Y `0`，眼睛中心 Y `1.557`，头顶 Y `1.692`，面朝 Three.js `+Z`。原始姿态为成人站立、雨衣双手在口袋附近。衣身和袖子经体素合并与平滑，避免把粗圆柱当作手臂。它是带衣物的风格化成人示意，不是人体扫描件，不用于解剖测量。主片镜头中不要用面部极近景。

`wet_stone_terrace_v07.glb` 提供真实倒角石砖的可复用模型。此资产只作补充，当前同步环境直接使用低成本湿石着色器。模型的喷泉孔为保守 2.1m 排砖空区；不要用它替代同步环境的精确 `1.49m` 水池孔。

Blender 源：`environment_observer_v07.blend`。构建脚本：`work/blender-v07/build_environment_observer.py`。软件：`D:/blender/blender.exe`，实际版本 5.1.2；执行日志保留在工作目录。`observer_v07_preview.png` 已人工查看成人衣物、基本比例、脚部接地和双手姿态。哈希、字节数和实际 GLB 边界记录在 `provenance.json`。没有购买或第三方生成人物资源。

运行：

```powershell
& 'D:/blender/blender.exe' --factory-startup --background --python 'work/blender-v07/build_environment_observer.py'
```

核验范围：TypeScript 模块已通过一次项目类型检查；第二次检查时其他正在编辑文件出现独立语法错误，环境文件没有报告错误。实际整片 WebGL 静帧、模型透明度和投影关系由主工程继续检查；这里没有声称完成整片验收。
