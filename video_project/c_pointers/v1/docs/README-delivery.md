# C语言指针 · 交付与恢复说明

本片从“游戏明明加了分，计分板为什么还停在7”开始，沿同一块计分板解释变量、地址、指针、解引用、函数按值传参、数组步长与访问边界。

母版为 **1920×1080、30 fps、9585帧、5分19.5秒**。画面使用 Remotion / Three.js；封面为独立 Blender Cycles 场景，四个比例分别构图。`0x1000` 是明确标注的示意地址，真实C程序的运行结果另有记录。

## 交付文件

- `output/C语言指针_从地址找到原件_1080p.mp4`：最终视频，由主流程渲染及核查。
- `output/C语言指针_字幕.srt`：128条标准字幕，UTF-8 BOM；变量写 `p`、语言名写 `C语言`。
- `output/C语言指针_完整解说稿.md`：34句标准口播稿及时间段。
- `output/发布文案.md`：抖音、小红书、B站、视频号文案。
- `output/covers/C语言指针_封面_16x9.jpg`：1920×1080。
- `output/covers/C语言指针_封面_4x3.jpg`：1920×1440。
- `output/covers/C语言指针_封面_3x4.jpg`：1440×1920。
- `output/covers/C语言指针_封面_9x16.jpg`：1080×1920。
- `output/C语言指针_V1_可重新渲染工程.zip`：通过最终QA后生成的恢复工程；本说明不单独证明ZIP或视频已经完成。

## 恢复原片

解压工程包进入其根目录。安装 Node.js、npm 和 FFmpeg，将 `ffmpeg` / `ffprobe` 放到 PATH。执行：

```powershell
npm ci
npm run check
npm run stills
npm run render
```

浏览器未安装时，Remotion 会使用其浏览器安装流程。默认使用 Vulkan；若当前驱动不支持，可明确以兼容后端重新生成代表帧检查：

```powershell
node scripts/render.mjs --stills --gl=angle
node scripts/render.mjs --audio --gl=angle
```

恢复渲染直接使用已打包的 `public/audio/master.wav`，无需原始歌曲、私人音色、模型权重或外部服务。更换浏览器、字体回退或图形驱动后应重新检查材质和字形，不承诺跨机器逐像素一致。

不要使用 `--reuse-bundle` 恢复初次渲染：工程包不包含旧bundle。局部视频必须指定输出名，例如：

```powershell
node scripts/render.mjs --frames=0-899 --output=output/开头30秒检查.mp4
```

该局部命令只生成画面；完整 `npm run render` 才使用最终母带进行音画合并。

## 声音与节奏

音乐为用户指定的 `D:/CloudMusic/Zella Day - Hypnotic.mp3`。实际分析约80.75 BPM；原曲166.383秒处回接23.417秒，交叠约2.961秒，最后顺着原曲尾段收束。`src/beats.json` 保存实际拍点以及16拍乐句的能量和色度特征；画面动作使用这些数据。

34句均为本次新合成的 rainbow鱼个人音色：前9句在本地RTX5060，后25句借助用户自有H100已部署环境加速，两端模型权重和参考音色SHA256相同。没有将私人参考音频复制进恢复包。旁白不变速、不变调，逐句保留raw及clean。

母带48 kHz双声道、24-bit，实测约−16.03 LUFS、−1.69 dBTP。完整音频过程、语义断句、读音输入和技术复核见 `docs/audio-production.md` 及 `work/audio/` 台账。自动识别不能认证声调、自然度或听感；所有未完成的主观听审字段保持false。

如要重写旁白或重新混音，现有脚本依赖 `D:/python_project/tts` 的虚拟环境、处理模块、模型和私人参考音色；音乐重编排依赖上述用户原曲路径。原曲未打包，对外发布权未独立验证。已有母带可直接恢复原片，无需重新执行音频生成。

## 修改与重建封面

保留的四个 `output/covers/artwork/*.blend` 可在 `D:/blender/blender.exe` 打开。原始程序化建模脚本为 `scripts/covers/build_art.py`，排版为 `scripts/covers/compose.py`。

```powershell
& 'D:/blender/blender.exe' --background --python scripts/covers/build_art.py -- --layout 16x9
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/covers/compose.py
```

`--layout` 支持 `16x9`、`4x3`、`3x4`、`9x16`。排版脚本依赖 Pillow、NumPy，以及原机 `C:/Windows/Fonts/NotoSansSC-VF.ttf` 和 `C:/Users/zju/Desktop/logo/logo.png`；Blender文字使用 `C:/Windows/Fonts/consolab.ttf`。Windows商业字体没有复制进包。换电脑时应先配置合法字体和用户Logo路径，再重排并核对文字边界。

浏览器使用的Noto字体子集和SIL OFL许可已包含在 `public/fonts/`。最终封面、独立RGBA渲染图、Blend和构图台账均保留，重用现有封面不依赖这些外部路径。

## 事实与证据

`scripts/verify_c_pointers.c` 是实际编译运行的安全C示例。`research/c-proof/` 保存MSVC C17编译记录与运行数据；包内不保存EXE和OBJ。`research/fact-ledger.json` 对应逐段标准条款。

片尾使用N1570标准委员会公开草案的真实页面，来源及PDF/图像哈希见 `research/n1570-page.json`。该文档受ISO/IEC版权保护，公开可访问不等于公共领域。资料检索与采用范围见 `docs/story-research.md`。

## 最终核查与打包

下面命令在最终视频生成后执行，不能用预览片的结果代替最终核查：

```powershell
npm run check
node scripts/qa_motion.mjs
python scripts/qa_delivery.py
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/audio_av_sync.py --video output/C语言指针_从地址找到原件_1080p.mp4 --output work/qa/av-sync.json
```

主流程还需保存对当前编码视频的代表帧视觉复查 `work/qa/visual-final.json`，其中 `representativeEncodedReviewCompleted` 为true、`videoSha256` 匹配最终视频、`blockers` 为空。它不意味着已经连续观看全片或完成主观音频听审。

先查看只读打包计划，再在上述QA全部完成后创建恢复包：

```powershell
python scripts/package_delivery.py --plan
python scripts/package_delivery.py --create --output output/C语言指针_V1_可重新渲染工程.zip
```

脚本采用明确文件范围，核对源句、母带、标准页和封面哈希，并检查最终视频与QA一致。创建后完整读回ZIP核对CRC及逐文件SHA256，将解压源码用当前锁文件兼容的已有依赖进行类型检查。此恢复检查没有重新联网执行全新 `npm ci`。

包内包含“恢复清单.json”“资产来源许可与SHA256.json”；ZIP旁另生成 `.sha256`、`.inventory.json`、`.assets.json` 和 `.verification.json`。不打包node_modules接点、渲染缓存、旧bundle、重复混音WAV、原曲MP3、私人参考音色、模型权重或远端重复文件。打包过程不清理现有作品。
