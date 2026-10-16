"""Prepare the reviewable narration/music/caption delivery note."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
story=json.loads((ROOT/'research/story.json').read_text('utf8'))
timeline=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
qa_path=ROOT/'research/qa/audio-v06.json'
qa=json.loads(qa_path.read_text('utf8')) if qa_path.exists() else None
headings={'street':'追不到的桥','drop':'从一滴水开始','dispersion':'白光里的颜色',
          'reflection':'回一次头','angle':'四十二度从哪里量','cone':'眼睛与圆锥',
          'circle':'地面藏住的那半个圆','observer':'每个人的彩虹',
          'secondary':'另一道弧与暗带','return':'自己做一次小实验'}
lines=['# 彩虹为什么是弧形 · V06口播与声音说明','',
       f"最终时长：{timeline['duration']/timeline['fps']:.3f}秒，{timeline['fps']}fps，{timeline['duration']}帧。39段口播，片尾约5秒。",
       '', '## 口播', '']
for scene in timeline['scenes']:
    if scene['id']=='references': continue
    lines += [f"### {headings[scene['id']]}（{scene['start']:.2f}—{scene['end']:.2f}秒）",'']
    lines += [row['text']+'\n' for row in story['clips'] if row['scene']==scene['id']]
lines += ['## 声音与字幕','',
          '旁白使用rainbow鱼本人参考音色，通过本地Qwen3-TTS 0.6B重新分句生成；保留完整语音波形，温和降噪、去齿音、动态控制，补偿滤波器延迟，未做VAD裁尾或语速拉伸。',
          '', '字幕来自Whisper-small词级时间戳与字级插值，按语义分句。它属于ASR辅助时间映射，没有冒称人工听审或强制对齐。',
          '', f"字幕共{len(timeline['captions'])}条，最长{max(len(c['text']) for c in timeline['captions'])}字。字幕文件：`彩虹为什么是弧形_V06.srt`。",
          '', '本集新配乐《雨后追光》：F大调/D小调，6/8，附点四分音符56拍/分钟。暖钢琴、竖琴、轻弦乐与稀疏拨弦，副虹段转向小调，回到喷雾实验时恢复明亮主题，片尾F(add9)收束。音乐随章节变化，旁白时平滑降低配乐，留出人声频段；雨水为固定种子设计音效。',
          '', '原创音符和配器没有导入旧版母带或旋律。实际乐器单音来自VSCO 2 Community Edition（CC0-1.0），40个样本哈希及许可已留存。音乐许可与哈希：`research/music/music-history-entry-v06.json`。']
if qa:
    lines += ['', '技术检查：'+('通过' if qa['technicalPassed'] else '尚需修复')+'。',
              f"WAV综合响度{qa['masterLoudness']['input_i']} LUFS，真峰值{qa['masterLoudness']['input_tp']} dBTP；独立QA AAC真峰值{qa['aacLoudness']['input_tp']} dBTP。最终视频AAC需另行复查。",
              '', f"母带SHA-256：`{qa['masterSHA256']}`。",'',
              '原始音频、保护后音频、净化音频和混音分轨均保留，技术检测不能替代人工听感验收。']
lines += ['', '## 阅读与科学依据','',
          '- Met Office, “Rainbows: optical wonders”：https://www.metoffice.gov.uk/weather/learn-about/weather/optical-effects/rainbows',
          '- Roland Stull, Practical Meteorology, Chapter 22, Atmospheric Optics：https://www.eoas.ubc.ca/books/Practical_Meteorology/prmet102/Ch22-Optics-v102.pdf',
          '', '基于资料独立改写口播，并使用几何光学计算验证角度；小球形水滴为示意，主虹一次内反射、副虹两次内反射，未把它误写成全反射。主虹红光约42.428°、紫光约40.703°；副虹红光约50.260°、紫光约53.375°，“副虹约51°”为概括带宽。暗带仍有大气散射光。',
          '', '删去的两个重复桥接句r016/r040及41段长稿留在`research/audio/long-edit-41-clips/`，最终稿与声音没有加速。']
(ROOT/'delivery/彩虹为什么是弧形_V06_口播与声音说明.md').write_text('\n'.join(lines)+'\n','utf8')
print('Wrote V06 narration, score and caption delivery note')
