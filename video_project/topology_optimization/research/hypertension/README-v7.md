# 每天5分钟知识｜高血压是怎样形成的

本片从一次平静的体检开始：人没有头晕，血压计为什么会显示偏高？镜头在同一人体解剖空间中沿心脏、动脉和肾脏向里走，解释小动脉阻力、水盐调节、神经与激素信号怎样共同影响血压，再到肝脏观察脂蛋白从生成到清除的过程，沿血流回到管壁，解释 LDL 滞留、斑块与血栓风险，最后回到规范测量。

系列署名：**rainbow鱼**。目标为约 5 分钟中文科普，采用人体解剖资产、连续摄影机、程序化机制动画、数值教学实验和真实论文页。本轮实际口播驱动的制作时间线为 53 句、9671 帧、30 fps，即 322.3667 秒（约 5 分 22 秒），其中片尾证据页 12 秒。完整 MP4 的文件大小、实际编码参数及验收状态见 DELIVERY.json。


## V7 更新

- 重建测量姿态：上臂长1.235、前臂长1.055，前臂/上臂由2.035调整为0.855；肘部约106°，前臂向手腕收细，手掌与腕部同向衔接。这些是协调的教学人形比例，不代表临床个体测量。
- 袖带继续贴合裸露上臂，软垫承托肘侧、前臂和腕侧；桌面、仪器与气管同步调整。手臂承托引线绑定前臂清晰表面，避开气管。
- 新配乐《循光·室内乐版》使用VSCO 2 Community Edition的CC0真实弱奏钢琴、竖琴、中提琴、大提琴和拨弦采样原创编排，按解说进行缓慢闪避与响度控制。旁白、字幕与9671帧时间线不变。
- V6画面0—7999帧沿用；8000—9670帧按当前源码重新渲染，随后完整重编码并换入新混音。几何、阴影与相机影响范围见arm-v7-impact-scope.json；没有把整片重编码称为整片3D重渲。
- 当前成片、音轨与源码哈希以DELIVERY.json为准。V3—V6记录保留为历史证据。数值审计、抽帧审阅与完整解码不等同于完整人工实时播放或主观听审。

## 内容与工程文件

| 文件或目录 | 内容 |
|---|---|
| `output/hypertension/hypertension_1080p.mp4` | 渲染脚本的完整成片输出目标；实际存在与参数需交付时核对 |
| `src/index-hypertension.tsx` | Remotion 入口，composition ID 为 `Hypertension`；配置 1920×1080、30 fps |
| `src/hypertension/Film.tsx` | 总时间线、标题字幕、品牌、数值曲线、片尾与声音合成 |
| `src/hypertension/World.ts` | Three.js 人体世界、解剖锚点、透明度、管壁机制与逐帧动画整合 |
| `src/hypertension/CameraPath.ts` | 由旁白 ID 锚定的连续镜头路线、解剖尺度变焦、环绕与视角衔接 |
| `src/hypertension/VascularDetail.ts` | 独立小动脉平滑肌模型、血流/受力显示和 VLDL→IDL→LDL 运输与回收演示 |
| `src/hypertension/timeline.json` | 根据实际音频整理的帧时间线；不要手写猜测时长 |
| `research/hypertension/story.json` | 冻结旁白，53 段，包含新增 h040a、h040b、h040c 脂蛋白运输机制 |
| `research/hypertension/research-note.md` | 医学来源、阅读范围、视觉边界和片尾证据记录 |
| `research/hypertension/independent-medical-visual-audit.md` | 文案、求解器和解剖显示层的独立复核及必须落实的画面条件 |
| `research/hypertension/continuity-audit-v3.md` | 上一轮连续运镜与医学视觉边界的历史审计 |
| `research/hypertension/medical-v4-evidence.md` / `.json` | 本轮主动脉、小动脉、脂蛋白生成/清除及斑块机制核对 |
| `research/hypertension/audio-v4-shot-contract.json` | 53 句的实际帧区间、口播和机制镜头契约 |
| `research/hypertension/audio-v4-revision.json` | 本轮口播改动、音源哈希、时长及音频核对结果 |
| `research/hypertension/v5-motion-qa.json` | V5 当前源码的两段实际编码短片、文件哈希和 28 帧顺序抽查记录；不代替完整成片验收 |
| `public/hypertension/models/` | 已转换的 GLB、结构清单、原始身份、许可证和署名 |
| `public/hypertension/physics.json` | SciPy 求解结果、参数、假设、单位和每周期守恒残差 |
| `public/hypertension/references/` | 真实论文/指南页面渲染图与公式图 |
| `public/hypertension/voice-raw/` | 分句原始合成语音；不是声音参考样本 |
| `public/hypertension/master.wav` | 混音脚本的总声音轨输出目标 |
| `scripts/render_hypertension.mjs` | 打包、静帧、片段与完整视频导出 |
| `scripts/hypertension/` | 解剖转换、数值求解、音频准备与原创配乐 |
| `delivery/hypertension/发布文案.md` | 抖音、小红书、B站和微信视频号发布文案 |

以上相对路径均相对于工程根目录：`D:/python_project/manim_extend_rainbow/video_project/topology_optimization`。

## 故事顺序

1. **一次体检**：保留袖带收紧的测量开场。没有明显不适，也可能测到高血压；一次读数需要结合后续规范测量判断。
2. **跟着一次心跳**：用管壁单位面积受力解释压强；主动脉在收缩期扩张、暂存能量，在舒张期回弹、继续推动血液。收缩和舒张带来一高一低的读数。
3. **小动脉的阻力**：镜头进入独立的小动脉微观放大模型。平滑肌收紧、管腔变窄，维持相同流量需要更大的压力差；肌肉放松后，阻力下降。主动脉与小动脉各保留自己的结构与功能。
4. **肾脏的水盐账本**：水与钠的回收和排泄影响循环，盐敏感程度也存在个体差异。
5. **身体里的调节线路**：肾素相关激素链与交感神经联络心脏、血管和肾脏；多条线路长期失衡可参与升压。
6. **血管逐渐变硬**：大动脉缓冲能力下降，使收缩时的压力更容易冲高；这与小动脉增加阻力是不同作用。
7. **跟着一颗脂蛋白**：肝脏把脂质装进 VLDL；沿途卸下甘油三酯，形成 IDL，再转为 LDL。部分 IDL 会直接回肝。肝脏受体参与回收 LDL，生成与清除的平衡决定血中水平。随后展示 LDL 进入并滞留于动脉内膜、免疫细胞摄取脂质成为泡沫细胞、斑块逐渐形成，以及破裂后的血小板聚集和凝血。此处解释慢性危险因素与急性血栓的关联，不把血栓作为高血压的一般起因。
8. **回到血压计**：安静坐好、使用合适袖带、规范重复测量并记录；反复偏高时及时就医。

内容面向成人体循环动脉高血压的基础科普。没有用某一个原因解释全部患者，也不提供个人诊断、药物选择或剂量方案。

## 人体素材、改编与许可

人体素材来自 [ashemag/human-atlas](https://github.com/ashemag/human-atlas)，使用的固定 commit 为 `1c38bf35c254a891200d3cedecfd57abebe83d8d`。

- **应用代码**：ashemag/human-atlas，MIT。许可证随模型保留于 `public/hypertension/models/HUMAN_ATLAS_MIT_LICENSE.txt`。
- **解剖数据**：BodyParts3D 4.0，© The Database Center for Life Science，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。[官方数据库许可](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)与[数据下载页](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)保留在署名文件中。
- **本片改编**：从原库二进制几何转换为 GLB，选择心脏、主动脉、动静脉、两肾、肾上腺、肝脏、人体表面、胸廓骨架和脑结构，重新分组及设计材质、动画。保留解剖坐标和源几何身份；从心脏展示分组中排除脑室，避免分类误用。完整信息见 `public/hypertension/models/ATTRIBUTION.md`、`README.md` 和 `asset-manifest.json`。
- **数据范围**：这是成年男性参考解剖，不是某位患者的检查结果。库内没有高血压病理网格、肾单位微观模型或血流计算场。微观放大、心跳与调节线路属于另行制作的机制示意。
- **历史素材区别**：上游署名文件提到的女性 HuBMAP 历史资产未用于本片；本片依据当前 BodyParts3D 资产署名。

建议在发布简介末尾或置顶资料评论中保留：

> 人体模型：BodyParts3D © The Database Center for Life Science，CC BY 4.0；基于 ashemag/human-atlas 改编。分组、材质与动画：rainbow鱼。原始数据论文：Mitsuhashi et al., 2009，doi:10.1093/nar/gkn613。

人体解剖段使用单一固定坐标，靠摄影机移动和材质透明度进入心脏、主动脉、肾脏及肝脏。新增肝脏为原库八个源结构合并的 `liver` 分组（FJ2816、FJ2818—FJ2824），保留原始解剖坐标与身份，详见 `asset-manifest.json`。大动脉切面的位置、方向和外径依据原模型截面定位；管壁层次、红细胞、LDL、斑块、血栓和肾单位均为另行构建的教学显示层，并非原库提供的微观病理实测数据。小动脉收缩使用独立的平滑肌与管壁结构，主动脉继续保留弹性缓冲的演示。小动脉模型与人体血管分支通过镜头衔接，画面标注“小动脉 · 微观放大示意”；放大结构用于机制解释，不能据此把示意模型的直径当作原始解剖尺寸。微观粒子为便于辨认而放大，不能据图推算细胞或病灶的真实尺寸。

## 数值实验的范围

`scripts/hypertension/solve_pressure.py` 计算的是 **0D 双元 Windkessel 集总参数模型**：

```text
C dP/dt = Qin − (P − Pv)/R
```

其中，`P` 是一个集中动脉压力，`Pv` 是恒定静脉端压力；`R` 表示总外周阻力，`C` 表示动脉顺应性。单位分别为 mmHg、mL/s、mmHg·s/mL 和 mL/mmHg。

实验为三组指定参数求解同样的周期性流量输入：参考条件、增大阻力、降低顺应性。代码记录输入流量、输出流量、压力、周期性与体积守恒残差。独立审计已检查方程、量纲、积分与结果关系，详细数值见审计文件和 `physics.json`。

它帮助理解两种不同作用：提高阻力可提高平均压力；在同一输入和阻力条件下，降低顺应性会加大脉压、抬高收缩峰并降低舒张谷，该模型的平均压力保持不变。

**解剖网格没有参与局部 CFD 或有限元求解。** 模型不解析局部血流速度、压力空间分布、血管壁应力、脉搏反射、自动调节或患者个体差异。模型数值用于教学，不能据此判断任何人的病情。全身动脉随时间的颜色变化若使用这一集中压力，只代表时间示意，不能称为真实局部压力热图。

红细胞运动通过血管局部体积坐标组织，用于说明开放管腔中的流动方向及狭窄段的运动变化；它不是患者血液的轨迹求解。LDL 进入管壁、斑块增长、纤维帽破裂和血栓生长采用按旁白时序驱动的机制动画，没有计算炎症反应、凝血动力学或预测个体血栓发生概率。

斑块段采用管壁透视展示内膜下的脂质池、泡沫细胞与表面血栓，病变位置保持绑定于同一主动脉壁。透明绘制顺序经过修正，前景红细胞仍保留深度遮挡；透视是教学显示方式，并非临床影像。V5 曾通过局部重渲修复该透明显示问题。V6完整重渲保留了这项修复；V7沿用该病变段，更新测量姿态及全片配乐。当前检查和编码哈希见 DELIVERY.json、final-source-hashes.json 与 encoded-continuous-qa.json。

同流量的小动脉演示让中心半径收紧 30%，随后再放松。画面的压差对照来自理想、稳态、等径圆管关系 `ΔP ∝ r⁻⁴`：在流量、长度和黏度相同时，半径变为原来的 0.70，理想压差比为 `1 / 0.70⁴ ≈ 4.2`。画面呈现的管径沿轴向变化，因此 4.2 倍用于理想等径圆管的机制对照，并非整条非均匀血管的局部 CFD 求解结果；也不能当作个体临床预测。真实小动脉还具有分叉、弹性、主动调节和微循环效应。

## 研究来源与真实片尾页面

本片主要依据以下已读取的官方资料和公开综述；初版阅读记录见 `research-note.md`，本轮新增 LDL 生成与清除的核对记录见 `medical-v4-evidence.md`。

| 来源 | 用途 |
|---|---|
| [WHO：Hypertension](https://www.who.int/news-room/fact-sheets/detail/hypertension) | 常见无症状、多因素风险、心脑肾影响和持续管理 |
| [NHLBI：What Is High Blood Pressure?](https://www.nhlbi.nih.gov/health/high-blood-pressure) | 血压定义、收缩压与舒张压、日常变化 |
| [NHLBI：Causes and Risk Factors](https://www.nhlbi.nih.gov/health/high-blood-pressure/causes) | 年龄与血管僵硬、遗传、盐敏感、肾病、肥胖及睡眠呼吸暂停 |
| [NHLBI：Diagnosis](https://www.nhlbi.nih.gov/health/high-blood-pressure/diagnosis) | 测量前休息、坐姿与袖带、反复测量和记录 |
| [NHLBI：Atherosclerosis — Causes and Risk Factors](https://www.nhlbi.nih.gov/health/atherosclerosis/causes) | 高血压与动脉壁损伤、炎症和斑块形成、血栓阻断血流的风险 |
| [NHLBI：Blood Cholesterol](https://www.nhlbi.nih.gov/health/blood-cholesterol) | LDL 作为胆固醇运输颗粒及过高 LDL 胆固醇与斑块风险的关系 |
| [Feingold：Introduction to Lipids and Lipoproteins，Endotext，2024](https://www.endotext.org/wp-content/uploads/pdfs/introduction-to-lipids-and-lipoproteins.pdf) | 已读取原始 PDF，第 4、7、14–15 页：VLDL、IDL、LDL 转化，IDL 回肝支路与 LDL 受体清除 |
| [NHLBI：Blood Cholesterol — Causes and Risk Factors](https://www.nhlbi.nih.gov/health/blood-cholesterol/causes) | 生成/清除及年龄、遗传、生活方式和疾病对血脂的影响 |
| [WHO：Sodium reduction](https://www.who.int/news-room/fact-sheets/detail/salt-reduction) | 钠、水盐平衡和盐摄入；避免混淆“钠”与“食盐” |
| [Maaliki, Itani & Itani, 2022](https://doi.org/10.3389/fphys.2022.1001434) | 盐敏感高血压的肾脏、RAAS、交感神经与血管机制；不能外推为所有患者的统一病因 |
| [NHLBI：Self-Measured Blood Pressure，2023](https://www.nhlbi.nih.gov/resources/self-measured-blood-pressure-fact-sheet) | 家庭血压规范测量 |
| [Mitsuhashi et al.：BodyParts3D，2009](https://doi.org/10.1093/nar/gkn613) | 人体解剖数据来源 |

片尾的两张主页面来自真实原始 PDF：

- **Maaliki D, Itani MM, Itani HA.** *Pathophysiology and genetics of salt-sensitive hypertension.* Frontiers in Physiology. 2022;13:1001434。[公开 PDF](https://www.frontiersin.org/articles/10.3389/fphys.2022.1001434/pdf)，原文许可 CC BY；本地保存为 `Maaliki_2022_salt_sensitive_hypertension.pdf`，首页图片为 `salt-mechanism-paper-page.png`。
- **NHLBI.** *Self-Measured Blood Pressure.* NIH Publication No.23-HL-8201，2023年5月。[官方 PDF](https://www.nhlbi.nih.gov/sites/default/files/publications/self_measured_blood_pressure_0.pdf)；本地保存为 `NHLBI_self_measured_blood_pressure.pdf`，首页图片为 `measurement-page.png`。这是一份官方健康测量资料，不能称为期刊论文。

本轮 LDL 来源与清除依据 Kenneth R Feingold 于 2024-01-12 更新的 Endotext 原始 PDF，保存为 `research/hypertension/lipid-metabolism-Endotext.pdf`，提取文本及具体页码见本轮医学核对报告。NCBI 的同章节网页返回浏览器检查，使用 Endotext 官网原 PDF 完成核对，没有把受阻网页计为已读。斑块与血栓机制另经 NHLBI 文字页面交叉核对，2026-10-07 获取的页面文本保存于 `research/hypertension/medical-v4-source-*.txt`。网页内第三方版权医学动画未用作素材；运输颗粒、管壁病变等演示由本工程构建。新增文献是本轮机制依据，不将其描述为已出现在片尾的原始页面。

不同国家和测量场景的诊断界值存在差别，正文没有混用美国和其他指南的数值阈值。WHO 2021 用药指南、ESC 2024 指南和 Oparil 2018 综述在研究阶段核对了页面或书目信息，但未取得完整可读取 PDF；没有将它们伪装成已全文核读或片尾原页来源。

## 声音

旁白沿用 rainbow鱼 的个人参考音色，依据本轮 53 句冻结稿逐句合成，再按实际音频安排时间线。新增 h040a—h040c 对应肝脏释放、循环内脂质卸载、受体回收。所有语音样本完整保留，未变速或截断；字幕以实际音长和 ASR 字符锚点对齐。生成参数与分句文本记录在 `research/hypertension/audio-generation.json`；读音与文本核对记录以相应音频审计文件为准。原始合成音、处理音与最终混音属于不同阶段，自动统计不能替代实际听审。

本轮更换为原创配乐 **《循光·室内乐版》**，使用VSCO 2 Community Edition（CC0）真实弱奏钢琴、竖琴、中提琴、大提琴及拨弦采样，由 `scripts/hypertension/score_v7.py` 逐音符编排，78 BPM、104小节、988个音符。钢琴短句与竖琴回应贯穿全片，弦乐连接镜头，结尾回到温暖的大调收束。

配乐未复用其他集音乐或现成音乐录音。新混音在旁白活跃时使音乐RMS低于人声约17dB，采用缓慢恢复，保留语音清晰度。音源、许可、乐句结构、频谱及试听见music-v7-design.md，完整清单见music-sample-manifest.json，许可见MUSIC_SAMPLE_LICENSE.txt。感谢VSCO 2 CE / Versilian Studios / Sam Gossner、Ivy Audio / Simon Dalzell与Soundemote / Elan Hickler。

当前配乐入口为score_v7.py与mix_music_v7.py；旧prepare_audio.py mix对应历史配乐，不用于复现V7。成片内实际AAC响度和真峰值以DELIVERY.json为准。

## 复现命令

以下命令在本机工程根目录运行，使用已有 Python、Node.js 与依赖。项目音频脚本还调用 `scripts/prepare_episode3v7.py` 及本机 `D:/python_project/tts` 下的处理工具；换到其他机器时需准备这些依赖或保留本次音频成品。已有 GLB 和分句语音时，不需要重新下载模型或重新合成声音。

```powershell
Set-Location 'D:/python_project/manim_extend_rainbow/video_project/topology_optimization'

# 可选：从固定版本的 human-atlas 重建 GLB。
# --source 指向含 public/models/atlas.json 与原始二进制块的源码目录。
python scripts/hypertension/convert_human_atlas.py --source 'D:/python_project/manim_extend_rainbow/human-atlas-audit/ashemag-human-atlas-1c38bf3'

# 计算三组教学实验，写出 physics.json。
python scripts/hypertension/solve_pressure.py

# 使用冻结旁白和时间线，重建V7采样配乐及混音。
D:/python_project/tts/.venv/Scripts/python.exe -X utf8 scripts/hypertension/fetch_music_v7_samples.py
D:/python_project/tts/.venv/Scripts/python.exe -X utf8 scripts/hypertension/score_v7.py
D:/python_project/tts/.venv/Scripts/python.exe -X utf8 scripts/hypertension/mix_music_v7.py

# 检查 TypeScript；查看各场景静帧。
npm run check
node scripts/render_hypertension.mjs stills

# 输出带声音的完整视频。
node scripts/render_hypertension.mjs --concurrency=2
```

静帧、片段与试听可以独立生成：

```powershell
# 指定帧检查构图，帧号应按最终 timeline.json 选择。
node scripts/render_hypertension.mjs stills --stills=30,120,300

# 仅用于检查的无声片段；不要将片段当作完整交付。
node scripts/render_hypertension.mjs --frames=0-149 --silent --concurrency=2

# mix_music_v7.py同时生成多段纯音乐及含旁白试听。
# research/hypertension/music-v7-listening-preview.wav
# research/hypertension/mix-v7-listening-preview.wav
```

渲染脚本使用工程内的 Remotion Chromium，输出 H.264、yuv420p、BT.709；这些是导出设置。完整编码、声音峰值、字幕与镜头接缝是否满足要求，需用实际成片和对应检测记录核验后再填写。

## V5 空间与镜头修订

本轮校正重点是解剖位置、相对比例与观察路径。肾单位由皮质位置进入，采用固定 .012 世界缩放，整个示意包围盒处于真实左肾包围盒内；镜头推进产生放大。肾小球血管团、肾小管、集合管与相邻毛细血管采用分开的通路，水钠回收颗粒终止于毛细血管。该空间模型简化了实际折叠、分支数量与显微比例，仍属于机制示意。

小动脉的入口与出口采用连续管壁和逐渐收细的分支，平滑肌与连接段随收缩共同变化。主动脉剖面只在对应讲解时段打开，离开该观察点后保留原图谱血管环境，避免在肾脏、激素和肝脏镜头中留下截断红管。激素/神经路线改为细虚线和小颗粒，区分信息传递与实体血管。

镜头路径使用共享切线的形状保持插值；跨器官时先退到器官关系镜头，再平移并推进细节。真实画面、空间比例与全帧相机状态分别检查，记录在 `spatial-v5-qa.json`、`camera-flow-audit.json`、`camera-v5-review.md`；这些证据不替代临床几何或患者血流计算。

肾单位机理另读取 [NIDDK：Your Kidneys & How They Work](https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work)：肾小球过滤、血细胞留在血管内，肾小管与邻近血管回收水和所需物质。读取摘录保存于 `nephron-v5-source.txt`，日期2026-10-07。

## 交付检查记录

本轮制作时间线为 53 句、9671 帧、30 fps，合计 322.3667 秒，片尾证据页 12 秒。输出目标为 `hypertension_1080p.mp4`，1920×1080、30 fps，AAC 48 kHz 双声道。

完整 MP4 的实际片长、编码参数、响度、真峰值、文件哈希及检查状态，**以同目录 `DELIVERY.json` 中对应 MP4 的记录为准**。本文不据源工程配置或独立音轨检查推断最终新版 MP4 已通过验收；旧版成片指标也不继承为本轮指标。

本轮未进行完整人工动态播放或逐句听审。`subjectiveListeningChecked` 与 `humanPronunciationReview` 保持 `false`；ASR 及自动检查属于技术核对证据，不能替代人工听感判断。独立音频报告可能先于最终视频更新，只有匹配最终 MP4 哈希的交付记录能确认成片验收状态。
