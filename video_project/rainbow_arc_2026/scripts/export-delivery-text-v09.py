"""Export accepted V09 subtitles and truthful delivery records; no media edits.

Reads current QA, never invents a pass, full playback, or full human listening.
Large delivery and reused covers go to the explicit task-owned output root.
"""
from pathlib import Path
import hashlib
import json
import shutil
from package_v09 import PackageError, validate_final_v09_qa

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(json.loads((ROOT / 'work/output-root-v09.json').read_text('utf8'))['outputRoot'])
if not OUTPUT.is_absolute():
    OUTPUT = ROOT / OUTPUT
OUT = OUTPUT / 'delivery'
OUT.mkdir(parents=True, exist_ok=True)
TL = json.loads((ROOT / 'src/timeline.json').read_text('utf8'))
SECONDS = TL['duration'] / TL['fps']
CAPTIONS = TL['captions']


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def timestamp(value):
    ms = round(value * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


rows = []
for i, c in enumerate(CAPTIONS, 1):
    assert 0 <= c['start'] < c['end'] <= SECONDS
    if i > 1:
        assert c['start'] >= CAPTIONS[i - 2]['end'] - .001
    rows.append(f"{i}\n{timestamp(c['start'])} --> {timestamp(c['end'])}\n{c['text']}\n")
(OUT / '彩虹为什么是弧形_V09.srt').write_text('\n'.join(rows), 'utf-8-sig')
MASTER_HASH = sha(ROOT / 'public/audio/master-v07.wav')
notes = f'''# 彩虹 V09 口播与声音说明

本轮沿用已接受的39段rainbow鱼旁白与自然句长，没有重新TTS，也没有以拉伸语速适配画面。
实际母带 `public/audio/master-v07.wav`，48kHz，{SECONDS:.6f}秒；SHA256：`{MASTER_HASH}`。
恢复包保留raw/clean句源、字尾保护、去噪/动态记录、ASR映射、旁白/配乐/音效分轨。
配乐《雨后追光》为本集既有原创编排，乐器单音来源VSCO 2 CE（CC0）；本轮未新编配乐。

SRT来自当前timeline的{len(CAPTIONS)}条实际字幕，UTF-8 BOM、毫秒时间。
最终编码响度、真峰值、静音和同步以 `research/qa/delivery-qa-v09.json` 为准；
数字检查不等同完整人耳试听。下列为实际句源，不声称本轮重写或重新合成。

## 已接受口播
'''
for c in TL['clips']:
    notes += f"\n**{c['id']}｜{c['start']:.2f}–{c['end']:.2f}秒｜{c['heading']}**\n\n{c['text']}\n"
(OUT / '彩虹为什么是弧形_V09_口播与声音说明.md').write_text(notes, 'utf8')

sources = (ROOT / 'docs/来源摘要_v08.md').read_text('utf8')
sources = sources[sources.index('## 天气与光学依据'):]
sources = sources.replace('verification-v08.json', 'verification-v09.json').replace('world-geometry-check-v08.json', 'world-geometry-check-v09.json').replace('WorldV08', 'WorldV09')
sources = sources.replace('本轮实际读取', '既有研究记录已实际读取')
intro = '''# V09 实际工具与来源摘要

整理日期：2026-10-11，Asia/Shanghai。以下以现有来源记录为依据，未声称本轮重新观看其他作者视频。

| 项目 | 实际使用与边界 |
|---|---|
| Blender 5.1.2 | D:/blender/blender.exe；V09石台、排水浅台阶、水盆与植物环境，原生.blend、GLB和CC0素材保留；微距球滴/叶片沿用V08 |
| Three.js／Remotion | 连续摄影机、Snell光路、反射、圆锥、字幕、同角度多层薄雨幕、帧驱动合成；雨幕透明/亮度为艺术化近似，不冒充体积天气仿真 |
| 骨骼角色 | RobotExpressive：Tomás Laulhé／Quaternius，Don McCurdy修改；Three.js固定commit 180fe50ef3cd4c2863729ec9b6b699635dc9483b，CC0 1.0。三个独立SkeletonUtils克隆，原Idle/Walking动画，眼位与脚底确定性归一化 |
| Lux3D | 复用task4040282原始PLY、GLB及记录，没有本轮新增任务；高斯点云用于模型接力，不作为光学测量 |
| Qwen／Wan | 复用street、droplet、waterfall、fountain四类成功wan2.6-t2v素材，600张运行帧；原片、任务ID、用途和provenance保留，本轮没有新请求 |
| Claude Opus 5.5 | 实际一次native请求total_timeout，completionReceived=false、returnedModel=null、残稿38字符；保存prompt/report/partial，未采用外部代码、未切换provider |
| WaterPro | 既有商业水面代码的确定性适配，许可见assets_v07/vendor-water/LICENSE.md；只供私用恢复，不公开源素材 |
| 声音 | 沿用39段rainbow鱼旁白与master-v07.wav、现有原创《雨后追光》；未本轮重新TTS/编曲 |
| 封面 | V08四比例JPG原样复用，本轮未重做 |

## 新增模型与材质来源

- [RobotExpressive源码与许可](https://github.com/mrdoob/three.js/tree/180fe50ef3cd4c2863729ec9b6b699635dc9483b/examples/models/gltf/RobotExpressive)，[CC0](https://creativecommons.org/publicdomain/zero/1.0/)。原GLB SHA256：047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319。courtesy署名保留在来源记录。
- Poly Haven [fern_02](https://polyhaven.com/a/fern_02)、[grass_medium_01](https://polyhaven.com/a/grass_medium_01)、[grass_ground](https://polyhaven.com/a/grass_ground)：[CC0 1.0](https://polyhaven.com/license)，原模型、纹理、alpha组合记录和逐文件hash保存。它们用于自然前中景，不是气象测量。
- 本轮Opus目录：`work/opus-runs/rainbow-v09-20261011-214928-98d1b906/`；requestedModel=claude-opus-5-5、native、medium、10000 tokens、600s。失败记录不作为成功生成证据。

'''
(OUT / '来源摘要_v09.md').write_text(intro + sources, 'utf8')
(ROOT / 'docs/来源摘要_v09.md').write_text(intro + sources, 'utf8')

old_delivery = ROOT.parent / 'rainbow_arc_2026_v08/delivery'
old_covers = old_delivery / 'covers_v08'
new_covers = OUT / 'covers_v08'
new_covers.mkdir(exist_ok=True)
cover_rows = []
for source in sorted(old_covers.iterdir()):
    if source.is_file() and source.suffix.lower() in {'.jpg', '.json', '.md'}:
        target = new_covers / source.name
        source_hash = sha(source)
        if target.exists():
            assert sha(target) == source_hash, 'Do not overwrite a changed delivery cover'
        else:
            shutil.copy2(source, target)
        assert sha(target) == source_hash
        cover_rows.append({'file': source.name, 'sha256': source_hash, 'bytes': source.stat().st_size, 'reusedUnchangedFrom': 'V08'})
(new_covers / 'reuse-v09.json').write_text(json.dumps({'version': 'V09', 'coversRemade': False, 'files': cover_rows}, ensure_ascii=False, indent=2), 'utf8')
promo = (old_delivery / '发布文案V08.md').read_text('utf8').replace('# 彩虹 V08 发布文案', '# 彩虹 V09 发布文案')
promo = promo.replace('封面使用当前定稿', '本轮封面沿用V08定稿，未重新制作。封面使用')
promo += '\nV09角色为CC0 RobotExpressive（Tomás Laulhé／Quaternius，Don McCurdy修改）；场景植被来自Poly Haven CC0。公开简介可按需要保留此courtesy署名，完整许可见来源说明。\n'
(OUT / '发布文案V09.md').write_text(promo, 'utf8')

qa_path = ROOT / 'research/qa/delivery-qa-v09.json'
qa = json.loads(qa_path.read_text('utf8')) if qa_path.is_file() else None
qa_verified = False
qa_pending_reason = None
try:
    qa = validate_final_v09_qa()
    qa_verified = True
except (PackageError, OSError, ValueError, KeyError, RuntimeError) as exc:
    qa_pending_reason = str(exc)
if qa_verified:
    qa_text = f"实际最终编码技术QA与独立视觉验收已通过：{qa['frames']}帧、完整解码、源码锁及物理源hash一致；响度{qa['integratedLUFS']:.2f} LUFS、真峰值{qa['truePeakDbTP']:.2f} dBTP，黑片段和超过1.5秒静音均未检测到。视频SHA256：`{qa['sha256']}`。独立视觉验收记录final-visual-acceptance-v09.json与该视频hash一致，抽样范围和仍存限制见其scope及reviewReports；不代表完整主观播放或完整人耳试听。"
else:
    qa_text = '当前尚未取得与当前MP4、源码锁和物理源hash一致的V09最终技术QA及独立视觉验收。本说明已准备；历史版本、旧编码、独立组件或预览的通过不能代替全片通过。完整人耳试听与逐帧人工审看未宣称完成。'
description = f'''# 《彩虹为什么是弧形》V09 交付说明

rainbow鱼｜每天5分钟知识。从雨后追不到的“彩虹脚”进入水滴，沿同一束光解释折射、颜色分开、内反射和约42°，再理解地平线遮挡、观察者移动、副虹与暗带，最后回到喷泉水雾。

主片 `彩虹为什么是弧形_V09_1080p.mp4`：1920×1080、30fps、{TL['duration']}帧、{SECONDS:.3f}秒（约5分20秒）。SRT与口播说明在本目录；四比例封面在covers_v08，原样复用V08，没有本轮重做。主交付是16:9；中央9:16裁切仅用于检查，竖版正片仍需重新编排。

## 本版画面

- 网上真实CC0 RobotExpressive代替简单的人体占位模型；三角色各用独立骨骼，采用原Idle/Walking动作、确定性帧定位，眼点和脚底归一化，材质统一为瓷白与青绿色。
- Blender环境加入较窄石台、实际水盆凹陷、浅台阶、铜色排水槽和CC0植物/草地纹理；柔和主光沿实际太阳方向，微距使用独立柔光反射环境。
- 主虹、副虹与喷雾虹采用同一连续光谱材质和沿观察者射线的多层薄雨幕，柔化边缘并保持角度/颜色顺序；增清晰光路与光子，控制光谱和水滴的透明关系。
- 片头、眼位、横移观察者与喷泉近景调整摄影机轨道；统一RainbowSans、底部大字幕和少量动作文字，保持镜头锚点衔接。是否有需进一步修正的遮挡，以最终主片抽样记录为准。

## 数据与示意

空气折射率1.0003、球形小水滴几何光学模型：主虹红/紫42.428°/40.703°，副虹50.260°/53.375°。口播“约42°”“约51°”为通俗概括。小雨滴球形近似、尺寸、光束宽度、光谱亮度、水雾与雨幕层是教学示意；不声称全部雨滴都是球形，也不把透明色带当作光强测量或完整波动光学/天气求解。

完整圆还要求视线下方有合适水滴；抬高视角不能保证任何场景出现完整圆虹。天空山景是摄影HDRI，不是完整平移地形扫描。Qwen仅提供生成氛围片段，几何角度和结论来自独立计算。

## 工具、声音和封面

本轮真实新增Blender V09环境、CC0骨骼机器人、Three.js雨幕材质和光照/镜头改进。Lux复用任务4040282；Qwen复用四类归档成功素材，没有本轮新请求。Opus一次native组件请求total_timeout，38字符残稿未采用；本轮代码由Codex审查和本地实现，不能标成Opus成功生成。

旁白和母带master-v07.wav均沿用，未本轮重新TTS或编曲。《雨后追光》使用本集既有原创旋律/编配和VSCO 2 CE的CC0单音。声音来源与{len(CAPTIONS)}条实际字幕见口播说明。四比例封面沿用V08，主题标题保持“彩虹为什么是弧形？”。

## 来源与公开署名

论文：Andrew Gettelman（2023），GMD 16，4937–4956，[DOI:10.5194/gmd-16-4937-2023](https://doi.org/10.5194/gmd-16-4937-2023)，CC BY 4.0；原PDF页裁切/叠放。虹摄影：Lupuslupus26，Complete Double Rainbow，CC BY-SA 4.0；Steve Kaufman，Circular rainbow，CC BY-SA 3.0，均有裁切/调色/合成。封面摄影衍生部分按原CC BY-SA 4.0署名和共享，用户Logo权属保留。

RobotExpressive：Tomás Laulhé／Quaternius，Don McCurdy修改，CC0 1.0；环境摄影、石材、fern_02、grass_medium_01、grass_ground来自Poly Haven，CC0 1.0。完整URL、版本、许可和hash见来源摘要与provenance。发布时使用平台提供的生成内容选项，简短说明“画面包含AI生成氛围片段和三维几何光学示意”。

## 验收与恢复

{qa_text}

私用恢复包只有在根代理确认实际成片技术和视觉复查后创建，再逐成员核对CRC32和SHA256。包保留原Lux PLY/GLB、Qwen原片/provenance、Blender源、骨骼模型/许可、39对旁白源与分轨、实际运行源码。原生V09环境源从C输出工作目录归档至public/assets_v09/environment/rain_after_terrace_v09.blend。恢复运行RESTORE_V09.ps1，然后npm run render；不依赖旧输出绝对位置。

包含商业WaterPro源和个人旁白，工程仅供用户本地恢复，不能作为公开开源素材包。打包脚本不删除源资产、不修改硬链接；本说明尚未宣称执行清理。V08与原始Lux/Qwen素材保留。

清理规划使用scripts/cleanup-v09.py，默认只读。实际--apply必须再核对最终QA、恢复ZIP每个成员CRC/SHA、GPU偏好已恢复和私有浏览器退出；只纳入本轮C工作目录精确白名单缓存以及D本任务浏览器副本。此前审核拒绝的D失败预览目录，以及随后移至C的work/observer-original-bundle、共享依赖、原资产和最终检查证据保留。
'''
(OUT / '说明_v09.md').write_text(description, 'utf8')
(OUT / '制作说明V09.md').write_text('# V09 制作说明\n\n完整说明见[说明_v09.md](说明_v09.md)，来源见[来源摘要_v09.md](来源摘要_v09.md)。本目录包括主片、SRT、口播声音说明、平台发布文案和沿用V08的四比例封面。验收结论只读取本次V09实际报告；组件预览和旧版报告不代替全片验收。\n', 'utf8')
print(json.dumps({'version': 'V09', 'captions': len(CAPTIONS), 'voiceClips': len(TL['clips']), 'seconds': SECONDS,
                  'masterSHA256': MASTER_HASH, 'coversRemade': False, 'copiedCoverFiles': len(cover_rows),
                  'finalQaRead': bool(qa), 'finalQaStatus': qa.get('qaStatus') if qa else None,
                  'finalQaVerifiedCurrent': qa_verified, 'finalQaPendingReason': qa_pending_reason,
                  'deliveryDirectory': str(OUT), 'runtimeMutations': 0}, ensure_ascii=False))
