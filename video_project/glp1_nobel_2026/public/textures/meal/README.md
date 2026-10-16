# GLP-1 开场餐桌素材

`MealScene.ts` 的主食、蔬菜、鸡肉、器皿、筷子与蒸汽均为本项目原创程序式三维。固定种子为 `20261008`。没有 AI 平面代替食物，没有运行时网络依赖。

从 Poly Haven 下载的资产采用 **CC0 1.0 Universal**；许可说明见 <https://polyhaven.com/license> 和 <https://creativecommons.org/publicdomain/zero/1.0/>。即使 CC0 不强制署名，仍保留作者与下载来源：

| 资产 | 作者 | 用途 |
| --- | --- | --- |
| [Wood Table 001](https://polyhaven.com/a/wood_table_001) | Dimitrios Savva（摄影）、Rico Cilliers（处理） | 桌面摄影纹理、法线和粗糙度 |
| [Rough Linen](https://polyhaven.com/a/rough_linen) | colormass（摄影）、Rico Cilliers（处理） | 亚麻摄影纹理、法线和粗糙度 |
| [Carrot Cake](https://polyhaven.com/a/carrot_cake) | Greg Zaal（摄影）、James Ray Cock（处理） | 旁碟摄影测量蛋糕，完整三维模型 |

原始文件均通过发布方 MD5 校验；下载 URL、文件大小、SHA-256 和作者保存在 `SOURCES.json`。`diff_warm` 与 `diff_flax` 是保留原亮度纹理后重新着色的暖木/本色亚麻派生贴图，原文件保留。蛋糕位于 `public/models/meal/carrot_cake/`，按整体尺寸缩放为直径约 12 cm，未重建为规则圆柱。

## 集成

```ts
const mealScene = new MealScene(base); // base 与 World 的资源路径相同
this.meal = mealScene.root;
this.root.add(this.meal);
await mealScene.ready;
mealScene.update(s.time); // 只驱动蒸汽，支持任意跳帧
```

World 保留同一餐桌的离场/返回控制。胃内36个示意颗粒由 World 独立创建，路径限定在实际胃网格内。`mealScene.dispose()` 负责释放模块的纹理、材质与网格。

桌面中心 `(0, 0.92, 0.42)`，大小 `1.20 × 0.024 × 0.65 m`；碗局部基点 `(0.055, 0.954, 0.43)`，碗底与托盘接触。7,200粒米饭分八层实例化，西兰花深绿花蕾和短茎斜放在饭面。鸡肉合并成一个不规则厚切网格，用低反光材质与焦边颜色表达；番茄为完整小番茄。芝麻和葱圈通过射线贴合鸡肉表面。

验证：TypeScript、glTF解析、资源引用与确定性构造检查通过；`update` 不改变食物/餐具几何。已在主场景的开场及甜点近景预览检查。程序式食材为教学场景模型，摄影测量仅用于标明的蛋糕资产。
