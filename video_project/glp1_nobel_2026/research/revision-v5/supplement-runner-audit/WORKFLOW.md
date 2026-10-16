# V5 追加补片与一次合成工作流

本说明只准备工作流。编写和 CPU 检查期间没有启动渲染、没有运行 composer preflight、没有修改任何生产源、音频、原计划、原 marker 或视频。

## 已验证的兼容性

- `compose_v5_patches.py:163` 按每行 `sourceHashes` 和 `sourceSnapshots` 验证独立源码版本。旧版本必须继续指向旧快照，不能把旧 marker 的哈希改成最新源码。
- `compose_v5_patches.py:366` 要求补片 marker 的完整帧范围等于该行范围；不能将旧补片行裁成左右残段复用。
- `compose_v5_patches.py:374` 要求每条 marker 的 `sourceHashes` 等于对应计划行，但不要求不同片段来源相同，也不要求片段 `marker.planSHA256` 等于最终合成计划 SHA。
- 最终 marker 内保存原片段 marker，包括它们各自的 `planSHA256`；同时顶层 `planSHA256` 指向最终合成计划。保留每个旧/新渲染计划的原始字节，才能追溯这些不同的哈希。
- `qa_v5_patch_boundaries.py:150` 检查最终 marker 对应最终合成计划 SHA；逐条范围也必须一致。它不要求各个补片来自同一批次。运行时显式传入最终合成计划。
- composer 拒绝在已经补片合成的主片上重复合成。因此全部旧片段和最终替换片段要一起对原始 base 合成一次。

只读函数检查用现有 base / patch 的两个不同 `V5World.ts` 快照验证了来源兼容性。原 27 条计划对应 53 个接缝、265 个抽样帧；最终数量按新计划重新计算。

## 独立渲染入口

新增 `scripts/render_patch_supplement_v5.mjs`；原 `scripts/render_patch_batch_v5.mjs` 保持不动。

要求显式提供：

```powershell
node scripts/render_patch_supplement_v5.mjs --plan=research/revision-v5/dining-return-patches/render-plan.json --output-dir=tmp/dining-return-patches --silent --validate-only
```

上面命令只检查计划和来源锁，不写目录/日志/marker，不 bundle，不打开浏览器，不渲染。下面命令才渲染，应在旧 batch 完整结束、候选源码和影响范围验证完成后执行：

```powershell
node scripts/render_patch_supplement_v5.mjs --plan=research/revision-v5/dining-return-patches/render-plan.json --output-dir=tmp/dining-return-patches --silent --concurrency=2
```

两条命令的路径是本说明建议的新批次命名；若采用其他路径，必须同时修改计划内 `video/log/marker` 和命令参数。

`--output-dir` 必须是项目 `tmp` 内的子目录，不能是 `tmp` 本身、`tmp/bundle` 或其后代，也不能经过 symlink/reparse。全部视频路径必须严格为该目录下的 `segment-START-END.mp4`，日志严格为同目录 `segment-START-END.log`。marker 必须使用新的 `research/revision-v5/...` 或 `tmp/...` 路径。

所有输出、日志、marker 必须不存在；程序不会覆盖旧文件。失败重试时先检查失败证据，使用新的目录/计划，不能删除旧文件来绕过保护。

来源要求：顶层 `sourceHashes` 覆盖整个 `src` 的 `.ts/.tsx/.js/.mjs/.json/.css` 文件及 `package.json/package-lock.json`；每条 patch 包含同一套完整来源锁。可以包括额外的渲染脚本锁。执行前后重新核对计划、timeline、master、全部锁定源码、runner 本身，以及未改动的完整原片 marker。每段仍执行无声、分辨率、fps、解码帧数与 BT.709 检查；保留原来的 BT.709 无重编码修复逻辑。

## 精确顺序

1. 等待当前 27 段 batch 结束，检查退出码及全部成功 marker。原计划继续留在 `research/revision-v5/patches/patch-plan.json`，不改字节。记录它的 SHA `09e341967872d0dc346ac00f66c8422d11ec223a1529cce2ea811252e04368bb`，并保留原视频、marker、日志和 `h005-fix/current-source` 快照。不要在旧 batch 运行时更改源码、计划或共享 `tmp/bundle`。
2. 接受独立候选预览与影响范围分析后，再应用生产源码修改。timeline/master 必须维持原 SHA。对全部生产来源创建新的独立快照；不得覆写旧快照。
3. 从实际有变化的帧区间加上过渡余量开始，求与旧补片行相交的闭包：只要新区间与某条旧行相交，就扩大到包含该旧行的完整 `start..end`；如果扩大后又碰到其他旧行，继续合并。最终新范围须排序、互不重叠。对这些新完整范围重渲染；不能只替换旧行中间几帧并继续引用其剩余部分。
4. 创建仅含新范围的 `research/revision-v5/dining-return-patches/render-plan.json`。继承原 `baseVideoSHA256/baseSourceHashes/baseSourceSnapshots/timelineSHA256/masterSHA256/fps/width/height`；顶层和每行 `sourceHashes` 使用新完整版本；每行 `sourceSnapshots` 指向新快照。所有 marker 使用独立新路径。原片段文件位置完全不变。
5. 运行上面的 `--validate-only`；通过后再运行正式补片命令。每个新 marker 的 `planSHA256` 必须等于这个新渲染计划文件的原始字节 SHA。对编码后的新片段检查关键帧、完整运镜与进出范围，不能仅用源预览代替。
6. 新建 `research/revision-v5/patches/compose-plan-final.json`，保留原基础来源和不相交的旧行，逐条完整替换相交旧行为新行。不得改变旧 marker、旧行来源、旧视频路径或 SHA。添加 `renderBatches` 元数据，记录原渲染计划和新渲染计划各自的路径与 SHA，并写明被替换旧行；composer 会在 provenance 中保留整份最终计划。建议不保留容易误导的单一顶层 `sourceHashes`，最终版本由每行明确表达。
7. 对最终计划执行只读预检，然后执行一次合成：

```powershell
python scripts/compose_v5_patches.py --plan research/revision-v5/patches/compose-plan-final.json
python scripts/compose_v5_patches.py --plan research/revision-v5/patches/compose-plan-final.json --execute --threads 8 --preset slow
```

预检会逐一解码计帧和核对所有输入；不应在任何片段仍写入时运行。原 base 保留在 `tmp/v5-pre-local-fixes.mp4`，最终 marker/provenance 由 composer 写入。不要使用 `--reuse-encoded`，它只适用于具有完全一致旧命令和计划的 BT.709 专用恢复。

8. 合成完成后按最终文件重新做 QA：

```powershell
python scripts/qa_final.py --revision v5
python scripts/qa_v5_patch_boundaries.py --plan research/revision-v5/patches/compose-plan-final.json --describe-plan
python scripts/qa_v5_patch_boundaries.py --plan research/revision-v5/patches/compose-plan-final.json
python scripts/qa_v5_crossscale_current.py
```

按负责人职责继续人物、聚焦转场、声音、完整播放检查。接缝脚本只生成证据，不自动证明流畅。最终视觉结论必须绑定新 MP4 SHA；旧 visual-review 不能用于新电影。全部通过后再执行最终文档、交付包和缓存清理流程。

## 本次 CPU 验证

`node --check` 通过。`validation-report.json` 记录 6 项执行检查：有效只读计划、缺少显式 plan、禁止使用 tmp 根目录、禁止使用 tmp/bundle、缺少生产源码锁、源码哈希不符。全部符合预期；没有创建输出目录或 segment marker。

本目录 `valid.json/missing-source.json/mismatched-source.json` 仅为 CPU 检查固定样本，**不是已批准的实际渲染计划**。它们的旧源码版本可能在后续修复时自然过期，不要将它们作为正式渲染输入。

清理提醒：`cleanup_current_bundle_v5.py` 目前仍绑定旧 `render-motion-source-lock.json`。最终来源改变后，应按真实最终 provenance 更新该清理验证的输入设计，不能绕过旧锁或提前删除 bundle。
