# 上海中心 v8 交付状态

2026-10-09。v8-final4 成片已完成并通过最终交付校验；缓存因清理检查未通过而保留。稳定文件名保留 v7 后缀，实际内容为 v8-final4。

## 当前交付

- 视频：`delivery/ShanghaiTower_1080p_v7.mp4`，1920×1080，30 fps，15,712帧，523.733333秒，285,779,858字节。
- 视频SHA256：`b3a12389f44aaf96bbc39e7f11faba66e2f833d5d2e0310d4866e4ae82c84e2e`。
- 制作说明、随片SRT、4比例JPG封面及发布文案：`delivery/`。
- 封面文案包：`delivery/上海中心_封面与发布文案.zip`。
- 离线构件图册：`delivery/构件图册.html`，987个可检索语义分组，23项离线交互检查通过。
- 片尾：结构搭建与计算工作流；Zwind + Diffusion + Iwind → AI engineer。
- 配乐：用户本地提供的 聲無哀樂SWAL《飞升》。

## 最终验收

`research/qa/v8-final/automatic-report.json`：完整解码15,712帧，无黑场，尺寸、时长和轨道通过；抽取433实际编码帧并生成41张接触表。

`research/qa/v8-final/audio/audio-wave-match.json`：最终AAC为48kHz双声道，25,139,200采样，零偏移；−15.03 LUFS / −1.65 dBTP，与锁定母带和片尾音乐比对通过。未声称整片人工听审或全部发音认证。

独立画面审查直接查看343张唯一编码帧、47个片段边界及8个编码拼接点；物理视觉审查直接查看69张最终帧，root另检查20个帧间变化较大窗口和45张开场补充帧。计数有重叠，不应相加为独立覆盖。所查窗口未发现阻断性整模消失、阴影开关跳变或旧透明排序跳变。保留开场小主体/低对比、铜板标签退场短暂裁切和局部施工楼板剖切一帧显露的观察。它们不是全片逐帧人工观看或审美完美认证。

聚合报告：`research/qa/v8-final/visual-review.json`。独立报告：`research/qa/v8-final4/visual-review/independent-review.json`、`research/qa/v8-final/physics-visual-final-review.json`。

`scripts/finalize_delivery.py` 已成功执行，保留原有门禁；`delivery/交付校验.json` 状态complete并记录43项文件哈希。

## 生产锁与恢复

当前锁：`research/visual/v8-production-lock4.json`，127项输入保持一致。锁SHA256：`27c1dc4c85d22860bb8c1dcc305f199004633155e05899c72537b8de70608dd5`。

时间线SHA256：`b641306d6ca1a5c9cfb520dee66a54a1d76d6cbd510b7381cfd64902c6bfcd5e`。
母带SHA256：`097863c2db47b381768f9e6c93b2e0379895d548d353627b9de1d32c6530e48e`。

final1整片因系统TEMP音频目录丢失而失败；final2发现R3F画布阴影配置在段起点重置；final3设置ThreeCanvas shadows="soft"后接缝修复，随后发现铜板标注与曲线重叠。final4只把该标注改到右侧，影响12452–12609帧，重渲第7/8段，其余7段经哈希验证原样复用。9段无声H264流无损拼接，完整母带一次编码AAC；所有段视频格式、BT709色彩、帧覆盖、时钟和有效负载核验通过。

来源：`tmp/v8-final4-segments/segments.json`、`research/visual/v8-label-repair/reuse-proof.json`。最终marker：`tmp/final-render.json`，tag v8-final4。

## 模型和仿真边界

987个教学语义网格组，1541结构节点、1984等效杆件；705组映射结构响应，282组没有独立求解应力。官方或原作者上海中心专属可复算输入未取得；下载的THU/TBI/606m示例不是本楼原始输入，未冒用。隔离复算重力/静风、9施工阶段、有无TMD时程及单桩网格和时钟，与生产数据一致；记录在`research/physics-v8/recompute/`。

CFD为OpenFOAM1912 simpleFoam kOmegaSST、1,243,872单元、30m/s均匀来流、孤立简化楼体、滑移地面。它是限定教学用途的平均流场，不是瞬态涡脱落、流固耦合或工程验证。本轮没有兼容的Diffusion权重，没有执行本楼建筑或桩土荷载反演。片尾工具标识与实际执行范围的区别已在制作说明披露。

## 清理和保护

音频重复缓存删除此前被自动审批返回“blocked by policy”，保持保留且未重试。固定22个旧渲染bundle的dry-run因可能占用进程PID 42068（conhost.exe）在删除前停止，删除0字节，未执行apply，没有终止进程或绕过核验。状态见`research/qa/cache-cleanup-v7/final4-cleanup-status.json`。

保护`delivery/ShanghaiTower_1080p_v6.mp4`，SHA256 `f11bdf6cef9d4fcfa10073681971083f529da038792d43676c1b80da2d1fcf0b`，以及`tmp/render-runs/v6-final2-45084-1791506986267/`。不使用旧cleanup_render_cache.py，不触碰系统pagefile或共享依赖。
