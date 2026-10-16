# V4 最终清理与发布包只读审查

审查对象：`scripts/cleanup_v4.py`、`scripts/package_delivery.py`。审查期间未执行清理、打包或改动 `src`、`public`、`audio`；仅以 AST 读取脚本常量，并只读检查现存文件与 ZIP。

## 结论

清理候选范围限制在本片目录，当前 72 段语音的原始录音、处理后音频、现用模型与源码均不在候选删除范围。打包脚本已明确列入四张 `cardiometabolic-cover` 新封面，文件齐全。**正式执行顺序应为成片 QA → 更新交付文档和字幕 → 重建发布包 → 核对包内容 → 清理旧文件。** 当前仍在渲染，最终自动报告和视觉验收报告尚未存在；清理脚本会因此提前停止。

## 两项执行前应补强的门槛

1. `cleanup_v4.py:44` 目前只要求 `封面与发布文案.zip` 存在。实际现有 ZIP 仍包含四张 `GLP1-cover` 旧封面，`解说稿.md` 与 `GLP1.srt` 也与当前文件不一致。应在清理前比较 ZIP 成员与 `package_delivery.py` 的八个成员清单，并比较每个成员与当前源文件的 SHA-256，不能只检验文件存在。打包脚本本身已经使用明确新封面名、CRC 和源快照哈希，重建后可满足该门槛。
2. `cleanup_v4.py:41–42` 将成片和 timeline 与渲染标记关联，但未检查 `public/master.wav` 与 `tmp/final-render.json.masterSHA256` 一致。渲染脚本确实输出了该哈希；建议清理前再核对当前 master，明确保留的是成片使用的现用混音。当前审查没有修改混音文件。

## 已确认的事实

- 清理允许列表仅为：`tmp/bundle`、`tmp/stills`、`research/revision-v4/GLP1-v3.mp4`、`audio/selected-prior/v3-before-v4`；四个解析路径均在本片根目录内部。
- 删除前有根路径包含性检查、符号链接 / Windows reparse point 拒绝、大小与 mtime 二次检查。没有对共享 `node_modules`、其他影片目录或整个项目根目录递归删除。
- `audio/raw` 当前有 232 个命名匹配的 WAV；其中 72 个在现用 take 元数据中，160 个未选用。72 个 take ID 与 timeline 的 clip ID 完全一致。
- 72 个选用 raw 路径均使用规范 POSIX 相对路径、均在根目录内且存在；没有与允许删除目录重叠。
- 72 个原始 WAV 的哈希与 `processing.inputSha256` 一致；72 个 `public/voice` 成品 WAV 的哈希与 `processing.outputSha256` 一致。没有缺失或不匹配。
- `src/timeline.json` 与 `public/timeline.json` 字节哈希一致；时长 20288 帧，30fps。
- `src`、`public`、`scripts`、`docs`、`audio/takes`、现用 raw 和正式交付文件会保留。`audio/music-original.wav` 不在删除候选中。
- 四张新版封面尺寸与正式清单一致：1920×1080、1920×1440、1440×1920、1080×1920；打包脚本的四个 JPG 名与 `delivery/covers/delivery-manifest.json` 一致。
- 八个发布包源文件均非空，解析后均在 `delivery` 内。包脚本会校验 ZIP CRC、成员 SHA-256 和打包过程中源文件未变，并原子替换目标 ZIP；未包含 MP4、原始音频、模型或源码。
- `research/revision-v4/source-before-v4.zip` 存在，包含 44 项，CRC 检查通过。
- 旧版 `GLP1-cover-*` 与 receptor 封面衍生文件被明确标为退役；新前缀文件不会被该匹配规则删除。

## 尚未执行

未执行 `cleanup_v4.py`（包括会写计划的默认模式）、`package_delivery.py` 或任何清理动作。未将本次只读脚本审查当作最终编码成片的视觉验收。
