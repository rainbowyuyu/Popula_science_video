# 高血压视频解剖资产

来源：ashemag/human-atlas，commit `1c38bf35c254a891200d3cedecfd57abebe83d8d`。数据为 BodyParts3D 4.0 成年男性参考解剖；不是患者数据，也不包含高血压病理、流体场或预制生理动画。

## 使用

主文件 `human-atlas-hypertension.glb`（约 26.3 MB，33 个 Mesh）含以下具名 Group：

| Group | 内容 |
|---|---|
| `heart` | 23 个独立心脏网格，节点名 `FJ24xx_English_name` |
| `leftKidney` / `rightKidney` | 左右肾表面 |
| `adrenals` | 双侧肾上腺 |
| `liver` | 8个源肝段结构合并；保持原人体坐标 |
| `aorta` | 升主动脉、主动脉弓、降主动脉 |
| `arteries` / `veins` | 其余全身动脉 / 静脉 |
| `bodySurface` | 半透明人体皮肤参照 |
| `thoraxSkeleton` | 肋骨、胸骨、胸椎参照 |
| `brain` | 大脑参考结构 |

备用分组文件：`heart.glb`、`kidneys.glb`、`circulation.glb`。各文件共用完全相同的原始解剖坐标，能够直接叠加；不要先分别居中再叠加。

## 坐标和动画

- 单位米，Y 向上，人体左侧 +X，前侧 +Z。
- 人体外接框约 X `[-0.334004, 0.332754]`、Y `[0, 1.719431]`、Z `[-0.145239, 0.146783]`。
- 所有网格的位置储存在顶点中，节点 transform 为 identity。对单器官做缩放或转动前，应将其 geometry 移到该器官中心并将 group.position 设置为原中心；否则缩放会以脚底附近为原点。
- `asset-manifest.json` 记录每个 group 的原始 bounds、center、来源 ID、三角形数及文件 SHA256。
- 每个 Mesh 的 `userData.sourceParts` 记录合并前网格的顶点和索引区间，仍可按来源结构拆开。
- 心腔节点 `FJ2422`—`FJ2425` 代表腔体形状。外观镜头建议关闭它们；剖面时再显示，不要把腔体解释为实心组织。
- 生理动态需要另行制作并标记为机制示意；该静态库不支持把形变/颜色图直接宣称为真实患者仿真。

## 数据校正

原库展示分类 `cardiac` 包含脑室（Third/Fourth/Lateral ventricle）。此次转换按核验后的解剖 ID 提取心脏，排除了这些脑室。心脏乳头肌也从肌肉分类正确纳入。

主动脉使用 FJ3413（升段）、FJ3411（弓）、FJ3427（完整降段），省略与降段重复的 FJ1931/FJ1932 分段表面，避免同处重叠。

## 署名

建议视频片尾及发布简介保留：

> 人体模型：BodyParts3D © The Database Center for Life Science，CC BY 4.0；基于 ashemag/human-atlas 改编。分组、材质与动画：rainbow鱼。

论文：Mitsuhashi et al. (2009), *BodyParts3D: 3D structure database for anatomical concepts*, https://doi.org/10.1093/nar/gkn613 。完整授权见 `ATTRIBUTION.md` 与 `HUMAN_ATLAS_MIT_LICENSE.txt`。

转换脚本：`scripts/hypertension/convert_human_atlas.py`。解包、转为 GLB 并重新分组，未更改解剖坐标和源几何形状。
