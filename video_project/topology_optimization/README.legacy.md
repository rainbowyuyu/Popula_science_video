> 2026-10-14 发布文件已实际归整至 [publish](publish/)，包含当前成片、发布文案与四比例封面。旧路径迁移映射见包内 publish-manifest.json；下文历史路径保留为制作记录。重新渲染前先按映射核对脚本输入，避免覆盖发布文件。

# 支架空成这样，还敢放书吗？



## 第二集：彩虹为什么是弧形



第二集使用独立的 `RainbowArcEpisode2` 入口，以雨后观察切入，通过 Three.js 三维水滴、Snell 折射、内部反射和偏向角曲线解释彩虹的弧形来源。旁白、字幕、原创氛围音乐、论文片尾与研究记录位于 `public/episode2`、`delivery/episode2` 和 `research/episode2`。



- 成片：`output/episode2/彩虹为什么是弧形_1080p.mp4`

- 渲染：`npm run render:episode2`

- 静帧：`npm run stills:episode2`



当前版本 V3 修订：约5分00秒，1920×1080 / 30fps，系列名为“每天5分钟科普”。使用图片Logo＋rainbow鱼、个人参考音色、大字短字幕、真实有限元/SIMP计算与Three.js连续演示。荷载尖端跟随受力位置的变形与零件转动；片尾5秒展示公式及论文。封面使用“每天5分钟·拓扑优化”与“支架怎么瘦成这样？”作为唯一文字主线，用虚线残影和消失粒子表现材料被挖走，不使用公式或独立信息窗口。



- 成片：output/v3/书架为什么敢挖空_1080p.mp4

- 交互回放：public/v3/index.html（可直接打开，或通过本地HTTP服务）

- 封面、字幕、发布文案、试听与制作说明：delivery/v3/

- 数值证据、来源、个人音色生成和处理记录：research/v3/

- 新技能：C:/Users/zju/.codex/skills/rainbow-science-short/SKILL.md

- 个人声音复用规范：D:/python_project/tts/BROADCAST_NARRATION.md



## 复现已有成片



依次运行 npm ci、npm run check、npm run web、npm run render、npm run qa。



唯一视频入口是src/index-v3.tsx。现有素材和人声音轨已保存，重渲染无需调用云API或重新克隆声音。Remotion使用node_modules/.remotion内的Chrome Headless Shell；干净安装可用npx remotion browser ensure准备浏览器。系统需有ffmpeg/ffprobe。Node依赖版本由package-lock锁定。



## 修改内容



scripts/story_v3.py维护显示文本和朗读文本。改稿后，在D:/python_project/tts/.venv/Scripts/python.exe环境运行scripts/voice_v3.py，再运行scripts/verify_voice_v3.py。Whisper GPU运行需要该虚拟环境的Lib/site-packages/torch/lib位于PATH。



随后依次执行python scripts/prepare_v3.py、python scripts/ending_v3.py和python scripts/mix_v3.py，重建时间线、短字幕、5秒片尾、个人音色处理及唯一混音。音频处理调用D:/python_project/tts/broadcast_voice.py，保留原始声音，不变速、不变调。ASR与数值检查不代替人工听审。



只有改变物理问题才重新执行scripts/simulate.py、scripts/surfaces.py；改变几何/载荷后必须更新旁白中的所有数值。本片原始实验证据已保留，视觉修复无需重复求解。



Python依赖numpy、scipy、soundfile、Pillow、requests、beautifulsoup4、contourpy；语音使用已有Qwen3和Whisper本地环境。个人参考音频留在TTS工程，不打包进技能。



## 音乐与品牌



配乐为Kevin MacLeod的Cipher，CC BY 4.0；发布时保留delivery/v3/发布文案.md中的署名。跨视频去重登记在技能references/music-history.json，后续按题材选新曲。本片开场Qwen图片为生活情境素材，生成来源已记录，不作为实物试验证据。



Logo来自用户原始PNG。左上角图片右侧并排“rainbow鱼”，原始比例不变。位置按短边1080基准：左64、上48、图高90、间距20、字号44。设计参考图、四比例封面配置与生成器包含在技能assets和scripts，项目副本在delivery/v3/covers，配色可按主题变化。



封面复现：python scripts/covers_v3.py。独立构图导出1920×1080、1440×1920、1920×1440、1080×1920四份sRGB JPG。荷载回归检查：node scripts/check_attachment_v3.mjs，覆盖变形、转动、镜头交接与非顺序帧定位。



## 验收后清理



npm run cleanup需要最终qa.json和review.json通过，且二者哈希与成片一致；在途渲染锁存在时拒绝执行。只退役本项目旧版与明确无用缓存，保护当前源工程、原始音色句源、实验数据及许可。它释放磁盘空间，不删除共享TTS模型或其他项目。



检查记录如实区分自动ASR、完整解码、抽样视觉检查与主观听审。模型位移结果不等于零件安全认证。

