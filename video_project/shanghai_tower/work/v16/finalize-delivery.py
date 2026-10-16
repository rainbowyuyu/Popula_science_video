"""Seal V16 only after matching machine and scoped visual review evidence."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / 'research/qa/v16'


def load(path):
    return Path(path).read_text(encoding='utf-8-sig')


def read(path):
    return json.loads(load(path))


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    manual = read(QA / 'manual-final-review.json')
    assert manual['approvedForDelivery'] is True
    freeze = read(QA / 'source-freeze.json')
    for name, expected in freeze['files'].items():
        assert sha(ROOT / name) == expected, 'Source changed: ' + name
    lock = read(QA / 'production-lock.json')
    for name, expected in lock['protected'].items():
        assert sha(ROOT / name) == expected, 'Protected original changed: ' + name
    outputs = {}
    for kind, name in [('main', 'ShanghaiTower_1080p_v16.mp4'), ('vertical', 'ShanghaiTower_1080x1920_v16.mp4')]:
        video = ROOT / 'delivery' / name
        digest = sha(video)
        media = read(QA / f'{kind}-media/media-report.json')
        audio = read(QA / f'{kind}-audio/audio-wave-match.json')
        proof = read(ROOT / f'work/v16/finishing/{kind}/assembly-proof.json')
        assert media['automaticChecksPassed'] and audio['passed'] and proof['passed']
        assert digest == media['videoSHA256'] == audio['videoSHA256'] == proof['outputSHA256'] == manual['videoHashes'][kind]
        outputs[kind] = {'path': video.relative_to(ROOT).as_posix(), 'bytes': video.stat().st_size,
                         'sha256': digest, 'dimensions': [media['expected']['width'], media['expected']['height']],
                         'fps': 30, 'frames': media['expected']['frames'], 'durationSeconds': media['expected']['seconds'],
                         'AACIntegratedLUFS': float(audio['measuredAAC']['input_i']),
                         'AACTruePeakDBTP': float(audio['measuredAAC']['input_tp']),
                         'allAutomaticChecksPassed': True, 'unmodifiedAACPreserved': proof['AACPacketsIdentical']}
    now = datetime.now(timezone.utc).isoformat()
    acceptance = {'version': 'V16', 'completedUTC': now, 'deliveryAccepted': True,
                  'status': 'accepted_with_documented_method_and_review_limits', 'outputs': outputs,
                  'sourceFreezeSHA256': sha(QA / 'source-freeze.json'), 'frozenSourceFiles': len(freeze['files']),
                  'visualReview': manual, 'historicalFilesPreserved': list(lock['protected']),
                  'methodLimits': ['Public-source educational reconstruction, not as-built BIM or field measurements.',
                     'Structural/TMD, qualitative CFD and independent pile are distinct documented cases; no CFD-to-structure coupling.',
                     'Surface particles are illustrative, not reconstructed 3D Gaussian Splatting.',
                     'WaterPro compatibility layer is environmental reflection/refraction, not an engineering flow solver.',
                     'No building Diffusion inversion or Iwind CFD was executed; the footer is the requested workflow identity.',
                     'Visual review used sampled frames and numerical continuity; no complete real-time playback or subjective listening is claimed.']}
    write(QA / 'acceptance.json', acceptance)
    lock.update(status='delivered', completedUTC=now, outputs=outputs, acceptanceSHA256=sha(QA/'acceptance.json'))
    write(QA / 'production-lock.json', lock)
    lines = ['# 上海中心 V16 交付检查', '',
             '横版 6 分钟；竖版 90 秒。竖版采用独立构图、剪辑、字幕和配乐编排。', '',
             '| 成片 | 分辨率 | 帧数 | 响度 / 真峰值 |', '| --- | --- | --- | --- |']
    for kind, title in [('main', '横版'), ('vertical', '竖版')]:
        item = outputs[kind]
        lines.append(f"| {title} | {item['dimensions'][0]}×{item['dimensions'][1]} / 30fps | {item['frames']} | {item['AACIntegratedLUFS']} LUFS / {item['AACTruePeakDBTP']} dBTP |")
    lines.extend(['', '已通过全片音视频解码、帧数与时间轴、BT.709、AAC 母带匹配、响度、真峰值及黑帧检测。局部修复通过逐帧校验：未修改区域保留原像素，替换区域与新渲染逐帧一致，AAC 音频包及时间戳不变。', '',
                  '视觉检查覆盖两版镜头关键帧、17 处隐藏剪接、单桩标注与片尾资源；修复了远端网格与抬高楼冠露边、土层说明低对比、刻度遮挡、江面转场暗斑和品牌对比。抽帧检查与相机数值检查不等于全片实时观看，也未宣称完成主观听审。', '',
                  '实际调用了 Claude、Qwen/Wan、Lux3D 和本机 Blender；Three.js、Remotion 与本地 WaterPro 适配层承担最终合成。调用记录、采纳范围、源资产与局限均在工程包内。', '',
                  '物理量来自公开资料约束下的重建算例，风场属于定性算例。示意粒子、江面和生成天际线不作为实测数据。详细计算边界见 [README_V16.md](README_V16.md)。', '',
                  '旧版 V14/V15 与受保护共享源码哈希一致。只清理已退役的 V16 渲染缓存。完整证据：`research/qa/v16/acceptance.json`、`work/v16/finishing/`。', ''])
    (ROOT / 'delivery/QA_V16.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'accepted': True, 'outputs': outputs}, ensure_ascii=False))


if __name__ == '__main__':
    main()
