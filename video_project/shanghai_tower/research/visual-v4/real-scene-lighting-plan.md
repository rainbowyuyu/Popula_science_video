# 上海中心 v4：真实场景、天空与光照计划

日期：2026-10-09。本文是只读研究与镜头计划，没有修改 `src`、`public` 或 v3
渲染输入。研究用缩略图和许可清单保存在本目录：

- `source-manifest.json`：Wikimedia Commons API 返回的原图地址、作者、许可、日期、SHA256。
- `source-previews/`：用于构图和色彩检查的本地缩略图；不应直接复制到最终 `public/`，除非 v4 另外登记输入哈希。

## 可直接使用的真实素材

优先使用 CC0，避免视频中出现署名卡和 ShareAlike 传播义务。CC0 不要求署名，片尾仍可礼貌列出作者和 Commons 页面；下载文件的 SHA256 已写进 `source-manifest.json`。

| 用途 | 资产与页面 | 许可/作者 | 画面观察与建议 |
|---|---|---|---|
| 低机位白天主体 | [Shanghai Shanghai Tower 5166304](https://commons.wikimedia.org/wiki/File:Shanghai_Shanghai_Tower_5166304.jpg) | CC0；Ermell；2015-05-16 | 竖构图、塔身从底部压向顶部，云层有明确卷积纹理。适合 0–4 s 片头向上抬升，裁成 16:9 时保留右侧玻璃高光。 |
| 夜景低机位玻璃 | [Shanghai tower 2021 summer](https://commons.wikimedia.org/wiki/File:Shanghai_tower_2021_summer.jpg) | CC0；Benjamin Ceci；2021-08-01 | 蓝黑天幕、暖白窗光和绿树形成冷暖对比。这是夜景，不是白天或黄昏照片；可作为独立夜景审美参考。当前 TMD 章节约为 256–297 s（语义 u35–38 不是秒数），本轮不在其中插入照片。不得把夜景灯光解释为结构应力。 |
| 江对岸地面全景 | [Shanghai skyline waterfront pudong 5166168 69 70](https://commons.wikimedia.org/wiki/File:Shanghai_skyline_waterfront_pudong_5166168_69_70.jpg) | CC0；Ermell；2015-05-16 | 横向地平线、黄浦江前景和塔群尺度清楚。可建立真实城市比例，当前只作为环境参考。照片已经含上海中心，不在同一构图上再叠一座 CG 塔。 |
| 雾天远景 | [Pudong Skyline from The Bund 20260417](https://commons.wikimedia.org/wiki/File:Pudong_Skyline_from_The_Bund_20260417.jpg) | CC0；DvTor8303；2026-04-17 | 灰蓝低对比、地平线有空气透视。作为远景尺度与雾层参考；当前不插入施工章节。语义 u41–44 不能当成秒数；不与晴天 HDRI 在同一镜头硬切。 |
| 夜景侧逆光参考 | [2014.11.15…Shanghai Tower night](https://commons.wikimedia.org/wiki/File:2014.11.15.191355_Jin_Mao_Building_Shanghai_Wolrd_Financial_Center_Shanghai_Tower_night_Shanghai.jpg) | CC0；Hermann Luyken；2014-11-15 | 深蓝黑天空、冷白塔灯、金茂暖色边缘。可作为 1–2 s 的声音桥或片尾缩小画面，不能作为日间玻璃反射的背景。 |
| CC0 动态候选 | [Shanghai Bund, Lujiazui Skyline Timelapse](https://commons.wikimedia.org/wiki/File:Shanghai_Bund,_Lujiazui_Skyline_Timelapse.webm) | CC0；Yigang Yu；2015-08-14 | 目前仅下载 Commons API 提供的 JPEG 缩略图，原先文件扩展名误写成 `.webm`，已纠正为 `.jpg`。原始 WebM 尚未下载或解码测试，不能据 JPEG 的 ffprobe 结果推断源视频有问题。当前不进入 v4 渲染。 |

以下素材只作为审美或构图参考，不建议直接进入交付视频：

- [Shanghai Tower Night View](https://commons.wikimedia.org/wiki/File:Shanghai_Tower_Night_View.jpg)，CC BY 2.0，Steve Knight。若使用，必须在片尾或描述中写作者、页面、许可和原始文件链接。
- [Shanghai Tower under construction from Yuyuan Gardens](https://commons.wikimedia.org/wiki/File:Shanghai_Tower_under_construction_from_Yuyuan_Gardens.jpg)，CC BY-SA 3.0，Daniel Case。改色、裁切和合成可能构成改编作品，需保持相同许可并完整署名；v4 暂不采用。

不使用搜索引擎结果中的商业图库、建筑事务所宣传图、抖音/YouTube 下载片段或未标明许可的航拍。真实城市素材只承担“尺度、天气、地平线、光色”的证据作用；核心筒、伸臂、风场、TMD 等技术画面始终由冻结模型和已核验求解结果承担。

## 已检查的色彩与天气

对四张 CC0/参考缩略图做了 64×64 RGB 百分位采样，得到以下可复用的调色边界（不是把照片平均成背景）：

| 情境 | p10 | 中位 | p90 | v4 色板 |
|---|---|---|---|---|
| 白天低机位玻璃 | `(51,67,69)` | `(137,152,158)` | `(191,196,204)` | `#334345` 深青、`#89989e` 玻璃、`#bfc4cc` 云光 |
| 江岸晴/薄雾全景 | `(92,104,103)` | `(192,207,211)` | `(235,240,238)` | `#5c6867` 远楼、`#c0cfd3` 水汽、`#ebf0ee` 云底 |
| CC0 雾天远景 | `(84,89,98)` | `(173,174,180)` | `(212,211,220)` | `#545962` 地平线、`#adaeb4` 雾、`#d4d3dc` 高云 |
| 夜景候选 | `(30,28,25)` | `(48,40,38)` | `(83,71,71)` | `#1e1c19` 天空、`#302826` 玻璃、`#534747` 建筑暗部 |

计划保持 v3 的浅蓝白科技基调，不把整片调成高饱和夜景：真实素材的冷灰和玻璃蓝负责空间深度，模型中的 `#6d96ad` 玻璃负责连续反射，风力/应力的青橙色只用于数据叠加。真实照片进入画面时统一做 ACES/线性化、轻微去饱和和同一曝光曲线，不能把 sRGB JPEG 直接当 Three.js 线性环境贴图。

## v4 实拍/模型衔接镜头方案

当前实现由 `RealSceneIntro` 负责，主片为 16:9、30 fps。具体镜头必须以最终时间线与抽帧为准，不能把语义参数 u 当作秒数。

| 时间 | 真实场景或生成过渡 | 模型动作与衔接点 |
|---:|---|---|
| 0.0–4.15 s | CC0 5166304 低机位原照；若 Qwen 编辑通过对照审核，可用其补景版本 | 小幅稳定向上推，完整塔冠留在画面中，标题与品牌占左侧，玻璃窗格应保持可辨认 |
| 4.15–5.58 s | 实景向 CG 的同方向运镜和空间遮挡 | 先对齐塔冠位置、主轴和高光方向，再让照片随运镜离开；不把两座塔在同一帧并列叠加 |
| 5.58 s 后 | 连续 Three.js 模型、真实 HDRI 反射与程序天空 | 核心筒、伸臂、外框、风场与 TMD 均由可寻址模型和求解结果承担，不切入看似真实的生成结构 |

真实图是二维摄影，不能通过大幅分层位移伪装建筑本体的三维视差。允许很小的数字推镜；需检查塔冠安全区、窗格采样、遮挡边缘、标题和 CG 接点。若生成图改变了冠部/扭转走势或无法和 CG 衔接，就保留 CC0 原照。

## Qwen 参考图编辑与来源记录

用户授权 Qwen 对真实上海中心照片做保留主体的环境编辑，并不限于纯天空。采用 CC0 5166304 作为图像参考，目标是扩展横构图、改善云层与自然光、保留完整塔冠及真实立面节奏。生成结果是示意性编辑场景，不作为结构图纸或工程证据，也不宣称逐像素保留建筑。

本轮生成记录见 `qwen-generation.json`：实际模型、完整提示词、seed、参考图来源/许可/hash、请求状态、输出大小/hash，以及人工视觉检查意见。API key 只从进程环境读取，不进入文件或日志；下载 URL 的签名参数不写入记录。主 key 已返回 401 InvalidApiKey，使用用户指定备用 key。

输出检查必须逐项完成：

1. 真实上海中心的收分、扭转、曲面接缝和不对称塔冠是否可辨认，不能变成圆柱、另一栋楼或玻璃玩具。
2. 塔冠完整，左侧有干净标题区；高频窗带不能糊成油画或长出虚构梁架。
3. 光照与 CG 窗带/天空相容，没有过曝、艳蓝塑料、重复建筑或文字水印。
4. 跨越 4.15–5.58 s 的实际渲染抽帧逐帧检查后才确认可进入主片。

`wanx-sky-prototype.png` 是旧 WanX 模型的天空测试，来源/参数独立记录于 `wanx-sky-prototype-metadata.json`。它不是 Qwen 输出，也不是实拍场景。

## Three.js Sky/HDRI 提亮参考

研究并复核的公开实现：

- [Three.js r180 Sky.js](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Sky.js)：MIT。使用 Rayleigh/Mie 散射和 `sunPosition`，适合连续移动镜头的可寻址天空，不会像一张静态渐变图。
- [Three.js sky example](https://threejs.org/examples/webgl_shaders_sky.html)：展示太阳方位、`turbidity`、`rayleigh`、`mieCoefficient` 和 `mieDirectionalG` 的关系。v4 初始测试建议 `turbidity=2.0–2.6`、`rayleigh=1.6–2.2`、`mieCoefficient=0.0015–0.003`；先看塔身明暗再调，不用全局拉曝光。
- [Poly Haven license](https://polyhaven.com/license) 与 [Kloofendal Partly Cloudy Pure Sky metadata](https://api.polyhaven.com/info/kloofendal_48d_partly_cloudy_puresky)：CC0，作者 Greg Zaal（原始）与 Jarod Guest（纯天空编辑）。v3 已下载并验证 1K Radiance HDR；文件、许可页、元数据和 SHA256 已在 `research/visual-v3` 记录。v4 可继续用作反射，不要把它当可见的上海城市背景。

提亮顺序固定为：先校正 HDRI yaw/太阳方向 → 再把 `scene.environmentIntensity` 从 `.70` 小步试到 `.80–.90` → 最后只微调 `toneMappingExposure`（建议不超过 `1.02`）。不同时提高太阳强度、环境强度和曝光；否则会复现 v3 初版的白墙/洗片问题。真实照片地面合成另用线性 premultiplied alpha 和雾深度，不能靠提高环境光抹掉地平线。

## 交付前许可证与技术核对

1. 最终只从 CC0 清单选片；若临时使用 CC BY/CC BY-SA，必须在视频描述和片尾保留作者、页面、许可、原文件链接，并审查 ShareAlike 是否适用于裁切/合成版本。
2. 每个进入 `public/` 的素材写入 `render-inputs.json`：源页面、直接下载地址、许可、作者、下载日期、字节数、SHA256、是否裁切/调色。
3. 真实片段仅证明景观/天气/尺度；模型工程断面、风场、桩基、TMD 仍引用公开文献和已核验 solver JSON，旁白避免说“照片就是设计图”。
4. 开片与片尾的真实场景必须经过同向运动遮挡，检查塔尖、地平线、阴影和字幕安全区；连续 orbit、风场和 TMD 段不混入照片地平线。
5. Qwen 生成内容登记提示词、模型、seed、时间和输出 hash，不上传或暴露 API key。

本计划只对列出的样片、色板和公开许可做了研究；尚未宣称 v4 成片、所有镜头或最终编码文件已经通过视觉 QA。
