> 2026-10-14 发布文件已实际归整至 [publish](publish/)，包含当前成片、发布文案与四比例封面。旧路径迁移映射见包内 publish-manifest.json；下文历史路径保留为制作记录。重新渲染前先按映射核对脚本输入，避免覆盖发布文件。

# 看懂身体调节，减重为什么能牵动三高？



rainbow鱼 · 每天5分钟科普 · 特别篇，V5。实际片长以 delivery/制作与来源-v5.md 的最终编码测量为准。



- 正片：delivery/GLP1_V5_1080p.mp4

- 四比例封面和发布文案：delivery/科学减重与三高-封面文案.zip

- 完整证据：research/revision-v5/evidence.json

- 正式音频锁：research/revision-v5/audio-lock.json

- 最终编码检查：research/qa/final-v5/



已安装配音、字音修正和实测时间线。画面入口 src/index.tsx → V5Film → V5World；共享坐标继承 World 及 public 中的人体/分子/纹理资产。不要删除旧文件名所对应的基础模型。



复现检查：npm run check。

完整渲染：node scripts/render.mjs --concurrency=3 --output=GLP1_V5_1080p.mp4。

自动检查：python scripts/qa_final.py --revision v5。

相邻帧筛查：python scripts/qa_motion_metrics_v4.py --revision v5。



不要运行 preview_timeline_v5.py 覆盖实测时间线。bootstrap_v5.py 与 build_v5_film.py 为初次迁移脚本，也不能覆盖当前已修复的源码。若修改任何画面或声音，须重新渲染与检查；旧的哈希验收不对新版本生效。



人体和微观过程均有来源边界：原始解剖参考、代表性教学几何、论文结构、0D求解与机制动画分别记录。完整素材署名见制作与来源-v5.md。

