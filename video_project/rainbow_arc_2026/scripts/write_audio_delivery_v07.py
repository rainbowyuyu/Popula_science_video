"""Derive V07 subtitle and truthful audio notes from the accepted timeline."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]


def timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02},{milliseconds:03}"


def main():
    timeline = json.loads((ROOT / 'src/timeline.json').read_text('utf8'))
    report = json.loads((ROOT / 'research/audio/v07-motion-mix-report.json').read_text('utf8'))
    captions = timeline['captions']
    last_end = 0.0
    blocks = []
    for index, row in enumerate(captions, 1):
        start, end = float(row['start']), float(row['end'])
        if start < last_end - 0.001 or start < 0 or end <= start:
            raise ValueError(f'Invalid caption timing at {index}')
        if end > timeline['duration'] / timeline['fps']:
            raise ValueError(f'Caption extends past the film at {index}')
        if '\n' in row['text'] or not row['text'].strip():
            raise ValueError(f'Invalid one-line caption at {index}')
        blocks.append(f"{index}\n{timestamp(start)} --> {timestamp(end)}\n{row['text']}\n")
        last_end = end
    delivery = ROOT / 'delivery'
    delivery.mkdir(exist_ok=True)
    srt = delivery / '彩虹为什么是弧形_V07.srt'
    srt.write_text('\n'.join(blocks), encoding='utf-8-sig')
    headings = {
        'street': '追不到的桥', 'drop': '从一滴水开始', 'dispersion': '白光里的颜色',
        'reflection': '回一次头', 'angle': '四十二度从哪里量', 'cone': '眼睛与圆锥',
        'circle': '地面藏住的那半个圆', 'observer': '每个人的彩虹',
        'secondary': '另一道弧与暗带', 'return': '自己做一次小实验',
    }
    lines = [
        '# 彩虹为什么是弧形 · V07口播与声音说明', '',
        f"主片：1920×1080，{timeline['fps']}fps，{timeline['duration']}帧，"
        f"{timeline['duration']/timeline['fps']:.6f}秒。保留V06的{len(timeline['clips'])}段最终口播和时间表，片尾约5秒。", '',
        '## 口播', '',
    ]
    for scene in timeline['scenes']:
        if scene['id'] == 'references':
            continue
        lines += [f"### {headings[scene['id']]}（{scene['start']:.2f}—{scene['end']:.2f}秒）", '']
        lines += [row['text'] + '\n' for row in timeline['clips'] if row['scene'] == scene['id']]
    lines += [
        '## 声音与字幕', '',
        'rainbow鱼旁白沿用V06本地Qwen3-TTS 0.6B的已完成句源；本轮没有重合成。V06已保留原始波形，进行温和去噪、去齿音和动态处理；V07未加速或裁切字尾。原始句源与净化句源按audio-manifest.json的SHA256核验。', '',
        f"字幕沿用已接受的Whisper-small词级时间映射与语义分句，共{len(captions)}条，最长{max(len(row['text']) for row in captions)}字。SRT从当前src/timeline.json逐条导出，无新增转录；ASR辅助时间映射不等于人工逐字听审。", '',
        '配乐仍为本集《雨后追光》，F大调／D小调、6/8、附点四分音符56拍／分钟，钢琴、竖琴、柔弦及少量拨弦。副虹段短暂转向小调，喷雾实验恢复明亮主题，片尾F(add9)收束。没有把这一轮修改冒称新曲。', '',
        'V07在原premaster上加入5次低电平的帧对应运镜空气提示和2次过滤后的真实CC0竖琴颗粒，避免干扰口播；这是设计音效，没有冒称现场录音。原master、旁白、score、bed和premaster的哈希不变，新母带另存master-v07.wav。', '',
        f"新母带：48kHz立体声PCM24，{report['audioSamples']}采样，{report['durationSeconds']:.6f}秒；实测{report['loudness']['input_i']}LUFS、{report['loudness']['input_tp']}dBTP。最终视频AAC仍需根制作流程复查。", '',
        f"母带SHA256：`{report['outputs']['master-v07.wav']}`。", '',
        '声音报告：research/audio/v07-motion-mix-report.json、v07-final-loudness.json。器乐许可与单音哈希保留在research/music/；新增两粒竖琴的路径和SHA256也单独记录在mix-report。客观检查不代替全片人工试听，本记录不声称完成后者。', '',
        '## 科学依据与示意范围', '',
        '- Met Office，Rainbows: optical wonders：https://www.metoffice.gov.uk/weather/learn-about/weather/optical-effects/rainbows',
        '- Roland Stull，Practical Meteorology，Chapter22：https://www.eoas.ubc.ca/books/Practical_Meteorology/prmet102/Ch22-Optics-v102.pdf（研究资料；NC许可原页不在公开正片中）',
        '- Andrew Gettelman（2023），Rainbows and climate change: a tutorial on climate model diagnostics and parameterization，GMD16，4937–4956：https://doi.org/10.5194/gmd-16-4937-2023 （片尾两页来自同一篇论文，CC BY4.0）', '',
        '文字独立改写；球形小雨滴为示意。主虹一次内反射、副虹两次内反射，没有写成全反射。主虹红光42.428283°、紫光40.702730°；副虹红光50.259871°、紫光53.374869°。约51°为简略提示。光点、环和光束粗细是帮助理解的艺术化机制，不是光强测量。', '',
        '完整圆虹还需要下方存在合适的雨滴／水雾和开阔视线；升高位置本身不保证整圆出现。暗带仍有大气散射光。', '',
        '## 恢复文件', '',
        'V07母带、原分轨、39段原始／净化旁白、字幕、受保护字尾句源、词级时间记录和处理记录由本地恢复包选择器整理。保留仍在使用的assets_v06路径，模型权重和私人音色参考不复制；恢复渲染无需再次合成或API凭据。', '',
    ]
    note = delivery / '彩虹为什么是弧形_V07_口播与声音说明.md'
    note.write_text('\n'.join(lines) + '\n', 'utf8')
    print(json.dumps({'captions': len(captions), 'maximumCaptionCharacters': max(len(row['text']) for row in captions),
                      'srtSHA256': hashlib.sha256(srt.read_bytes()).hexdigest(),
                      'ttsRegenerated': False, 'humanFullListeningClaimed': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
