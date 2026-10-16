# V11 开场升级：拼接、来源与验收

本版只用新画面替换 F0–1799，后八段来自已验收的 V10 无声分段；完整 AAC 直接来自 V10 MP4。每段保留自己的冻结来源，不能把后八段标记成新 bundle 的重新渲染。时长仍为 15,712 帧、30 fps、523.733333 秒。

## 运行入口

```powershell
cd D:/python_project/manim_extend_rainbow/video_project/shanghai_tower
python scripts/mux_v11.py --help
python scripts/verify_v11_tail.py --help

# 新开场及其 production lock 准备完毕后：
node scripts/render_v10.mjs --tag=v11-final --ranges=0-1799

# 新首段通过预览检查后执行；不会覆盖 V10 或已有 V11：
python scripts/mux_v11_compat.py --tag v11-final

# 本机 ffprobe raw -show_data 有崩溃缺陷；兼容入口已包含完整后段/原音轨核验。
# 执行证据：research/qa/v11-mux-compat/execution.json

# 新 MP4 必须有自己的自动检查和实际 AAC 报告；通用入口应先指向 V11：
Copy-Item -LiteralPath tmp/final-render-v11.json -Destination tmp/final-render.json
python scripts/qa_final.py --video delivery/ShanghaiTower_1080p_v11.mp4 --out research/qa/v11-final
python scripts/qa_final_audio.py --video delivery/ShanghaiTower_1080p_v11.mp4 --out research/qa/v11-final/audio
```

`mux_v11.py` 不修改旧脚本、冻结输入或音轨。它固定输出 `delivery/ShanghaiTower_1080p_v11.mp4`、`tmp/final-render-v11.json` 和 `tmp/v11-final-segments/` 中的新来源清单及拼接证据，不改写通用 `tmp/final-render.json`。如另指定 `v11-*` tag，临时证据使用相应 tag，交付文件名仍是 V11；已有 V11 交付时明确拒绝覆盖。

输入包括 `research/visual/v11-final-lock.json`、`tmp/v11-final-review/segments.json`、V10 生产锁、原始九段清单、V10 三份成片报告和已验收 MP4。V10 MP4 SHA256 固定为 `ce44a4d51522cf4b945e28b858f6938363a7e8f70979004efc971fe561a429f6`。原片身份不同则拒绝使用。

## 拼接门禁

1. 验证新旧冻结 bundle 文件与公开资产哈希、两份源分段清单及 V10 的三份验收报告。新版本当前源码必须匹配新锁；旧源码允许已被编辑，但旧冻结 bundle 必须保持完整。
2. 时间线、节拍、旁白、音乐、母带、模型、物理、字体和品牌资产不得改变。其他新旧输入差分完整写入清单，不隐瞒新开场依赖。
3. 新首段只允许 F0–1799；旧段依次覆盖 F1800–3599，直到 F14400–15711。九段逐一校验源 SHA256、完整解码帧数和 H264 参数，含时间基、BT.709 标记及 SPS/PPS extradata。参数不兼容时停止，不自动偷偷重编码。
4. 九段复制到独立运行目录；新来源清单记录每段的锁、bundle 指纹、原始路径和 SHA256。按全局帧顺序 stream-copy 拼接，再从 V10 MP4 复制完整 AAC，不使用 `shortest`、偏移、音频滤镜或再编码。
5. 独立读取候选 MP4：验证全部视频 PTS/DTS 连续；F1800 起每个视频包的内容及时间戳与 V10 一致；后 13,912 帧的解码像素 MD5 逐帧完全一致。整条 AAC 的包内容、PTS/DTS、duration、编码器 skip metadata 和 streamhash 必须一致。
6. 再次核对来源及新冻结资产，使用独占创建输出 V11。V10 保留不动，候选文件及其证据保留用于追溯。最终 marker 仍明确标注开场与接缝视觉验收待完成。

源片尾与完整声音一致，只证明本次**实际混合来源成片**保留了它们，不证明把 V11 整个 bundle 从头渲染到尾也会获得相同画面。候选复制到交付路径前后另核对整片 SHA256；候选核验记录保留当时实际读取的路径。

## 开场与 F1800 接缝

s004 在 F1786 结束，s005 同帧开始。“现在，把这些部分放回原位”位于 F1628–1692；“从地下看起”位于 F1729–1770。新开场应在 F1786 前接回原地下构图，F1786–1799 留作相同场景的接缝保护段。首段末尾不能为新的讲解挤占 s005。

`CameraPath.flowingCurve` 的切线由相邻关键帧共同计算；改 u4.96 会影响 u5–5.5，对数半径混合原本也持续到 u5.5。因此只修改 `u<5` 数值并不能自动证明 F1800 后的状态不变。优先保留原路径，使用仅在开场有效的独立偏移或路径覆盖，并在 F1786 前使位置、速度和加速度回到原路径。构件、材质、透明度、裁切面、阴影相机也须逐帧复位。

正式视觉检查至少包括：F1740–1859 连续播放及逐帧接缝检查；F1795–1805 的主体大小、相机位置、运镜方向、玻璃透明度、基础、阴影与字幕位置；逐个检查全部部件的出现、退出、归位与标签。F1799→1800 的 PTS 连续不等于画面运动连续。

## 可选的场景状态独立审计

若还需要证明新程序在开场之后等价于 V10，应使用两个独立场景实例：一个来自 V10 冻结源码或 bundle，一个来自 V11 冻结版本，加载同一模型与时间线。不要通过把同一个对象前后切换来伪造对照。

- 从原 `stateAt(frame, timeline)` 得到每帧状态，依次执行两个实例的 `World.update` 和矩阵更新。对 F1786–1905 每帧比较，之后至少每个字幕边界、每个章节及片尾比较；如声明全后段状态一致，则必须实际覆盖 F1800–15711 的每帧。
- 保存相机 position/target/projection/view-offset、所有构件 matrixWorld/visible、材质 opacity/color/clippingPlanes、灯光与阴影相机参数；涉及动态几何时比较实际 position/color buffer 哈希，不能只比构件中心点。物理时钟、播放倍率、标签及二维覆盖层也纳入。
- 分别以顺序播放、直接跳到 F1800、先到较晚帧再倒跳 F1800 的方式运行，检查开场是否留下可见性或材质状态。只读取同一段曲线返回值不足以发现残留状态。
- 报告记录两个锁的 SHA256、实际覆盖帧、比较对象、误差阈值及最大差值。只做抽样就写抽样；不能把固定时间窗口判断或 CPU 数值检查称为 GPU 成片审美验收。

最终视觉报告与新自动/AAC 报告均须绑定实际 V11 MP4 的 SHA256。V10 的通过记录只作为复用来源依据，不代替新开场、接缝及新成片验收。

## 本机兼容执行记录

2026-10-09，本机 ffprobe 的 raw `-show_data` 输出触发 `avtextformat.c:562` 崩溃。冻结的生产脚本与画面源码保持原样；新增 `scripts/mux_v11_compat.py` 仅将探测输出改为 `-show_data_hash sha256`，并把编码 extradata 的比较改为对应 SHA256，强制校验哈希存在与格式。其余源锁、数据包、解码像素、AAC和时间戳检查继续执行。适配器、自身哈希、冻结脚本、ffprobe版本及成功结果单独记录在 `research/qa/v11-mux-compat/execution.json`。独立重跑原 verifier 时同样需要此 probe 适配，不能直接重复已知会崩溃的命令。
