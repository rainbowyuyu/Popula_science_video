# 上海中心 V16

本版为独立重制，保留 V14/V15 历史交付。主片 1920×1080 / 30 fps / 360 秒；精剪版 1080×1920 / 30 fps / 90 秒。两版使用独立字幕与原速 rainbow鱼 旁白剪辑。

## 画面与声音

- 实景底图与模型保持原有楼冠对位，表面粒子以实际幕墙顶点采样，随后进入分区拆解与单层零件展示。
- 结构、风压、速度剖面、单桩和 TMD 继续读取原工程的计算数组。位移倍率、量纲与数值保留；装配分离距离是示意。
- 讲解镜头按原始场景 cue 与新句音对应。大跨度删节采用构件移出画面后的隐藏剪接，不把未选场景高速播放；不能把它称为全片无剪接的一镜到底。
- 局部标注绑定实际表面和构件，设置两种比例的安全区与碰撞处理。单桩镜头推近，TMD 用透明楼冠和原模型楼板提供空间参照。
- WaterPro 本地兼容适配层实际参与三维渲染，包含平面反射、折射和组合波。此适配层不包含原生 FFT、SSR 或 WebGPU，不把环境水面称为流场计算。
- Qwen/Wan 的 5 秒城市江面素材承担片尾环境过渡。新原创配乐《江风里的光 / Riverlight》有独立横竖版编排，未复用旧混音。

## 工程入口

- `src/indexV16.tsx`、`src/FilmV16.tsx`：两套成片。
- `src/v16/`：独立 World、拆解编排、相机、标签、环境特效与音频时间线。
- `scripts/render-v16.mjs`：渲染及批量关键帧输出。
- `public/v16/`：已验收云端资产与两套音轨、逐句 WAV、SRT。
- `work/v16/assets/`：Lux3D 原件、Blender 修复脚本、两份 `.blend`、Qwen 原件及调用记录。
- `work/opus-runs/v16-camera-20261011-111435-bdbd7445/`：Claude 提示词、完整响应、运行报告。采用范围见 `work/v16/camera/claude-review.json`。
- `work/v16/vendor/`：本地已授权 WaterPro 适配层与许可证，供本机工程使用；不作为开源源代码发布。
- `research/qa/v16/`：生产保护锁、最终检查及交付哈希。

```powershell
npm run check
node scripts/render-v16.mjs --tag=v16-main --concurrency=2
node scripts/render-v16.mjs --vertical --tag=v16-portrait --concurrency=2
```

## 来源与边界

建筑是根据公开设计资料重建的教育模型，并非竣工 BIM。计算结果属于已记录边界条件下的重建算例。土层环的材质为地质纹理示意；单桩响应保留原计算土层和反力，二者不混为现场勘察成果。TMD 的外壳和周边演示允许简化，数值和坐标映射保持原计算约束。

结构与 TMD 动画来自公开资料约束下的线弹性重建算例，输入风载为教学设定，数值不是现场监测。CFD 采用 OpenFOAM 理想化独立塔体的平均流场，只用于宏观绕流与相对压力符号展示；未通过严格残差及网格无关判定，也未把压力耦合到结构或单桩。单桩是独立土弹簧算例。Su 等 2013 论文用于结构依据与监测研究参考，不是动画时程来源。

片尾 `Zwind + Diffusion + Iwind → AI engineer` 是用户指定的工作流标识。本片实际计算资产来自本地 Zwind/OpenSees 与 OpenFOAM，没有执行 Diffusion 建筑反演或 Iwind 建筑 CFD。具体证据与来源核查见 `work/v16/audio/narrative-final-review.json`。

点云转场是对模型表面的粒子化呈现，没有把照片逆向重建为真实 3D Gaussian Splatting。Qwen 环境中的远景地标为生成示意。Lux3D 栏杆只用于环境，未用于结构分析。

新增素材任务：Lux3D `4046648`，报价与扣减 13 credits；Qwen `5d60e743-9c1c-453d-837f-c66d4c6883f2`，模型 `wan2.7-t2v-2026-06-12`、1080p / 5 秒。完整资产检查见 `work/v16/assets/asset-acceptance.json`。凭据不写入工程。

论文页与 LaTeX 公式沿用原工程已存原始页面和矢量文件。片尾文字与纸页分离。配乐使用原创音符编排与 VSCO 2 Community Edition 的 CC0 单音采样，许可和事件表见 `work/v16/audio/README.md`。

自动解码、响度与帧检查不等同于人工全片逐秒观看或主观听审；最终验收报告分别记录实际完成的检查。
