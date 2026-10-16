# V3 音频执行计划

执行结果：正式story已按协调者锁定的SHA256复制并完成全流程。最终10571帧、352.3666667秒、48句旁白、180条字幕；g026/g039选用完整备选。`validate_audio.py`通过，母带和字幕已锁定可供主渲染。当前证据以 `audio-lock.json`、`voice-audit.json`、`caption-timing-review.json` 和 `VOICE-AND-MIX.md` 为准；下文保留开工前的计划记录，不作为当前待办。

状态：2026-10-08，仅完成V2备份和流程审查；尚未收到正式 `docs/story.json` 锁定通知，未启动TTS、ASR或混音。当前 `src/`、`public/`、时间线和声音均未修改。正式锁定后由音频代理独立负责配音、ASR、字幕、混音和音频时间线交付。

## V2备份已完成

独立快照位于 `audio/selected-prior/v2-before-v3/`，275个文件、412,586,182字节；逐文件SHA256与大小保存在该目录 `manifest.json`。复制后逐一验证源文件与备份哈希一致，并确认现有音频及两份timeline未变化。

快照包括48条选定原始/处理后旁白、take元数据、首轮及现有词表ASR、V2发音候选记录、旧g041选择记录、三条完整音轨、原创音乐源、V2原稿、timeline、SRT、相关QA报告和音频脚本。参考声纹、模型权重、乐器采样库及MP4没有重复复制；其原路径和来源记录保留。

- V2：9776帧，325.8666667秒，48条声音，161条字幕。
- timeline SHA256：`aecb1dd5b85f16088bb870c1082c7feabe325cf64af3f52fcff97ed3d8f0240c`。
- master SHA256：`038a4b2264159d25b193c18581d6f1661d7d50af997fae54fbc42774477d88e9`。

## 正式开工前的条件与必需调整

1. 等协调者明确通知正式story锁定，记录其SHA256；检查48个唯一ID仍为g001–g048、顺序/section有效，`text`、`ttsText`、`caption`没有不同步。g014/g015的加长实验段需完整保留研究条件和因果顺序。
2. `scripts/validate_audio.py` 当前第9行仍限制280–330秒。正式V3实施时应改为本轮确认的340–380秒目标，再运行验证；现在不改脚本。目标对应30 FPS的10200–11400帧，含9秒参考文献尾声。
3. `qc_glossary.py` 强制复查列表含g014但不含g015。正式实施时把g015及新术语纳入词表复查，保留首轮ASR，避免高字面匹配率让新增实验内容漏过专项检查。
4. 当前 `caption_parts` 对过长中文句默认仍按显示宽度切分，仅g033旧原句有经过审核的语义边界覆盖。V3须在内存中先生成并检查全部新字幕，针对必要的新边界写可复现规则，再导出；字幕数量按内容产生，不固定为161。
5. 不运行 `scripts/select_pronunciation.py`：它是V1专用脚本，硬编码g011/g042及旧候选，并含旧版静音尾部裁切。V3候选须按当前完整文本、ASR与波形另行选择，原始与落选候选都保留。

## 锁定后的准确执行顺序

以下是未来执行命令，当前没有运行。工作目录必须为本片项目；先完成上述验证器与词表调整。

```powershell
Set-Location 'D:/python_project/manim_extend_rainbow/video_project/glp1_nobel_2026'
$glp1Py = 'D:/python_project/tts/.venv/Scripts/python.exe'

# 根据正式文稿生成；签名未变的已选声音可复用。
& $glp1Py scripts/voice.py --batch-size 4

# 对当前选片做首轮与词表ASR；在此检查告警、数字、术语与g014/g015完整性。
& $glp1Py scripts/qc.py
& $glp1Py scripts/qc_glossary.py

# 所有声音选择完成后，依据完整实际波形重新排期。
& $glp1Py scripts/mix.py prepare

# 先用qc.build_captions在内存审查边界；通过后写两份timeline和两份SRT。
& $glp1Py scripts/qc.py --captions-only

# 按新实测长度重新编配同一片的《微光信使》并混音。
& $glp1Py scripts/mix.py mix
& $glp1Py scripts/validate_audio.py
& $glp1Py scripts/export_narration.py
```

每一步必须成功后再进入下一步，PowerShell的普通顺序执行不会自动在原生命令失败时退出，因此执行器需检查退出码。`mix.py prepare` 会写两份timeline、整条旁白及placements；`qc.py --captions-only` 会写两份timeline、SRT、caption-report和相关timeline哈希；`mix.py mix` 会写score、音乐、母带及测量报告。最终锁定前这些只是中间态，其他代理不应据此提前开主渲染。

V3不使用 `prepare --keep-slots`，因为g014/g015和整片长度必须随真实音长改变。第一次V3混音不使用 `--reuse-score`，因为它要求旧音乐的样本数与新timeline严格相同；直接运行 `mix.py mix` 会调用 `compose` 按新长度重新编配。最终同一V3长度的纯混音复查才可使用 `mix.py mix --reuse-score`。不使用 `mix.py all` 代替上述分阶段流程，以免跳过逐句检查和精细字幕。

如果确有证据需生成g014/g015备选，可使用以下命令；例中的attempt必须先确认该文本/参数组合未占用，避免覆盖同名raw文件：

```powershell
& $glp1Py scripts/voice.py --only 'g014,g015' --candidate revision-v3-pronunciation --attempt 2 --force --batch-size 2
```

`--candidate`只另存候选，不自动入选，也不会让主ASR检查该候选。候选需单独核查后完整替换选片，保存选择理由和被替换版本，再重跑首轮/词表ASR；若已经排期，还需重新执行prepare及其后步骤。默认缓存会跳过同签名或同文本的已选alternate；候选生成需要上述 `--force`。精确重现还取决于同一pending顺序、batch大小和实际batchIds，不能只凭seed宣称逐样本重现。

## 时长、音乐与验收

沿用rainbow参考音色、Qwen3-TTS-0.6B及现有处理：语速因子1，不做音高变化、时间拉伸或硬噪声门；保留完整原始音频。48句总时长为完整波形逐句向上取整后的合计，加首句前0.4秒、48×5帧间隔及9秒尾声。相对原始波形总长，固定增加17.4秒及不足1.6秒的逐句帧取整。目标340–380秒应通过正式文本和自然生成达成；不靠拉伸或额外大段留白。实测超范围时先报告具体句长/总长，再协调文字调整。

《微光信使》保持本片的76 BPM、3/4拍、既有主题和VSCO2 CE CC0音色，按实际长度重新编配；记录为同片V3版本，不标成另一首全新原创。当前score脚本中的历史表述需在V3报告中准确解释；保存新composition与原score哈希，并追加V3音乐历史，不覆盖V2来源证据。

锁定交付须确认：48个take与story/ASR/timeline哈希一致；无削波、非有限采样或未处理的端点问题；字幕完整、无断词、无重叠/越界且可内存重生成；三条音轨样本数与帧数一致，参考文献段旁白精确静音9秒；母带约−15 LUFS、AAC试编码真峰值≤−1 dBTP，活跃旁白高于音乐16–20 dB。新建V3音频锁定报告并通知协调者准确帧数、片长、字幕数和哈希。最终MP4的AAC测量仍由成片QA单独完成。

现有V2的g010等ASR近音差异不作为V3已读错的证明，也不隐藏；自动识别不能替代自然度和完整听感检查。未实际完整听审时，继续保留 `subjectiveListeningChecked=false`。

当前只读检查确认：TTS Python、Qwen模型、Whisper模型、rainbow参考文件及ffmpeg均存在；磁盘剩余约72.95 GB（备份前）。这不等同于已加载GPU模型或已测试V3生成。待正式story锁定通知后开始执行。
