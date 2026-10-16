# V16 增量恢复说明（依赖 V15，非独立包）

此包保存 V16 的源码、可编辑模型、新高斯资产、已集成的生成素材、原始生成任务记录、字幕、交付视频和检查证据。继承的大型素材不重复装入 ZIP；恢复必须同时保留下面的 V15 原始恢复包。

必需基包：`rainbow_arc_V15_recovery_20261012-224601.zip`。

基包 SHA256：`65a51970c96d88c21d25ad23d5be982991a3cbc81d3e221d18a9440ab0737676`。

V16 当前继承目录原先指向 V11/V12/V13/V14/V15 的 `public` 文件夹。增量清单记录这些历史路径，但恢复时统一链接到另一个单独恢复出来的 V15 基目录。清单逐文件列出必需依赖及其 SHA256；仅在 V15 基包中缺失的必要小文件会作为明确的补充文件保存，不会静默复制整个旧资产树。原始 Lux3D PLY 和旧版音频等由基包保留。

## 制作恢复包

在 V16 项目目录中运行只读候选检查：

```powershell
python scripts/package-v16.py
```

输出清单位于 `research/iterations/v16/recovery/candidate-inventory-v16.json`。这个步骤不会制作 ZIP，不会删除旧版或缓存，不会更改任何继承目录。Qwen 素材尚在替换时，候选清单只是当前快照；正式打包必须重新运行。

在新版全片渲染完成、实际 MP4 解码检查通过、独立视觉审查记录明确批准实际视频以后运行：

```powershell
python scripts/package-v16.py --create `
  --qa research/qa-v16/delivery-qa-v16.json `
  --visual-review research/qa-v16/final-visual-review-v16.json
```

检查要求包含：当前源审计 V16 `passed=true`、所有绑定源码/素材哈希一致、渲染记录 `completed` 且绑定实际视频、自动交付检查完整解码通过、独立审查 `version=V16`、`status=pass`、`visualReviewApproved=true` 和实际 `videoSHA256`。独立审查必须准确记录其实际观看/听音范围；检查脚本和抽帧接触表不等于正常速度看完或听完整片。

ZIP 直接写入 `output-v16/delivery`，不产生第二份大型暂存副本。逐条流式写入后再次检查所有成员 SHA256 和 CRC32，通过以后才从 `.partial` 改名为正式包。磁盘至少预留估算上限之外的 1 GiB。中途失败的 `.partial` 保留供诊断，不自动删除。

## 在另一目录恢复

先把本脚本或 V16 增量包中的同名脚本单独解出，再运行。选择两个全新、彼此独立的目录；不要把恢复目标指向任何原生产项目。

```powershell
python scripts/package-v16.py `
  --restore-delta 'E:/recovery/rainbow_arc_V16_delta_recovery_TIMESTAMP.zip' `
  --base-archive 'E:/recovery/rainbow_arc_V15_recovery_20261012-224601.zip' `
  --destination 'E:/restored/rainbow_arc_2026_v16' `
  --base-directory 'E:/restored/rainbow_arc_2026_v15_base'
```

恢复脚本验证 V15 基包身份及 V16 全部 ZIP 成员，向新基目录解包 V15，核对每个继承输入，再向新 V16 目录解包增量并重建 `public` 目录链接。它不覆盖或删除已有文件。若已有基目录缺少 V16 补充文件，会停止并要求改用新空基目录，绝不把补充文件写回原 V15 工程。

恢复后在新的 V16 目录执行：

```powershell
npm ci
npm run check
$env:RAINBOW_BROWSER_EXECUTABLE = 'D:/path/to/chrome-headless-shell.exe'
node scripts/render-v16-portable.mjs stills --stills=1110,3900,8780 --png
```

`node_modules`、浏览器、Blender、全局 TTS 运行环境、私有密钥及凭据不在增量包内。Blender 仍使用用户已有 `D:/blender/blender.exe`；TTS 环境仍需用户原有安装。浏览器环境变量只是便携渲染脚本的选项，不修改全局工具配置。未提供浏览器路径时由 Remotion 自身查找/安装浏览器，可能需要网络和额外空间。

原生产版 `scripts/render-v16.mjs` 保持原字节，用于核对历史审计。额外的 `scripts/render-v16-portable.mjs` 只改浏览器定位；`work/output-root-v16.json` 为恢复生成的相对路径定位器。原始审计中的绝对路径和视频 SHA 是历史证据，重新渲染必须产生新的源审计、渲染记录和交付检查，不可把旧批准当作新视频的批准。

这个恢复包包含用户音色与私人项目工具/素材，供私人恢复使用，不能据此声称所有内容可公开再分发。生成环境高斯由网格表面构建协方差 splat；其来源记录保留，不标称实拍训练重建。科学光路数据与艺术化转场的 provenance 分开保留。
