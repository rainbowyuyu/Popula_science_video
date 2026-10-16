# v6 narration integrity audit

This is a machine-assisted duration and transcription audit, not human listening approval.

- All 59 raw and aligned takes were read with libsndfile.
- Raw total: 340.720 s. Aligned total: 268.633 s.
- 47 raw takes exceed their aligned take by >100 ms.
- v6 transforms discard at least 86.421 s of source samples (estimated from the reproduced transform).
- 46 takes have >100 ms of active raw voice beyond the estimated cutoff.
- ASR mean expected-character coverage: raw 85.39%, aligned 65.14%.
- 35 takes have strong raw tail coverage (>=80%) but <50% aligned tail coverage.

## Reproduced cause

`voice_episode3v6.py` first makes a mono PCM24 WAV of `1.3 * target` seconds. It then divides file bytes by 4 and 48000, even though PCM24 mono contains 3 bytes per sample frame. On this ffmpeg build the WAV container adds 102 bytes. For clip 000 this yields tempo 0.975150 instead of a duration measurement. A subsequent trim to the old shot duration removes the later speech. Short sentences receive padding, hiding part of the aggregate loss. Filter buffering and the final 25 ms fade can additionally attenuate final sounds.

## Direct transcript examples

### 000 / intro

Expected: 公园里一阵风过去，亭子没有一根钉子，却稳稳站着。
Raw (4.96 s): 公園裡一陣風過去,庭子沒有一根釘子,卻穩穩站著。
Aligned (3.53 s): 公园里一阵风过去,亭子没有一根钉子。

### 003 / intro

Expected: 今天只看一件事：每个接头怎样让木头互相托住，又保留拆修的路。
Raw (5.36 s): 今天只看一件事,每個街頭怎樣讓木頭互相拖住,又保留拆修的路
Aligned (4.10 s): 今天只看一件事 每個街頭怎樣讓木頭互相拖住

### 014 / dovetail

Expected: 它限制的是侧滑和下沉；要拆时，先取上层，再按相反顺序退出。
Raw (6.24 s): 它限制的是側滑和下沉, 要拆時,先取上層,再按相反順序退出。
Aligned (3.30 s): 它限制的是側滑和下沉,要拆時

### 020 / pin

Expected: 这里用的是亭子梁端的木销位置：销子从孔洞横向穿过梁和柱，方向和受力路径一致。
Raw (8.72 s): 这里用的是停滞凉端的木销位置。销子从孔洞横向穿过梁河柱,方向和寿力路径一致。
Aligned (4.90 s): 这里用的是停滞梁端的木销位置, 销子从孔洞。

### 034 / stress

Expected: 下压时梁腹受弯，一侧压缩，另一侧拉伸；颜色只是响应量的可视化。
Raw (6.80 s): 下压时,粮腹受弯,一侧压缩,另一侧拉伸。颜色只是响应量的可视化。
Aligned (3.47 s): 下壓時良腹受彎,一側壓縮。

### 038 / wind

Expected: 这里运行的是 Zwind / ZDyn 的 12 米每秒基准工况，先看流场怎样绕过亭子。
Raw (7.84 s): 这里运行的是 Zint 除以 Z 定的 12 米每秒 基准公框先看流场怎样绕过亭子
Aligned (2.57 s): 这里运行的是ZindTweets

### 054 / return

Expected: 镜头退回完整亭子，刚才的每一条线都回到自己的位置。
Raw (4.48 s): 鏡頭退回完整停子, 剛才的每一條線都回到自己的位置。
Aligned (1.20 s): 镜头退回完整

### 058 / return

Expected: 下次经过一座木亭，抬头看一眼；你看到的将不只是屋檐，而是一条藏起来的力路。
Raw (6.88 s): 下次經過一座木亭,抬頭看一眼,你看到的將不只是屋簷,而是一條藏起來的利路。
Aligned (5.13 s): 下次经过一座木亭,抬头看一眼,你看到的将不只是屋檐。

## v7 replacement policy

1. Keep the original Qwen reference voice and every complete raw take.
2. Give every take 20 ms leading and 180 ms trailing protection before mastering.
3. Measure and compensate filter latency by correlation. The protected take length remains unchanged.
4. No tempo adjustment, rubberband, or fitting narration to old shot durations.
5. Round complete WAV duration upward to video frames, then add explicit pauses.
6. Use independent short caption cues from canonical display text; ASR anchors only assist timing.
7. If the finished narration is long, edit the script and regenerate changed sentences.
8. Confirm phrase endings with ASR and targeted listening; keep subjectiveListeningChecked false until listening occurs.

## Files

- `audio-v6-audit.json`: full duration, waveform activity, derived cutoff and per-take transcription evidence.
- `audio-asr-cache.json`: 118 SHA-keyed complete source transcriptions.
- `audio-tool-selfcheck.json`: synthetic final-sound preservation and original SHA check.