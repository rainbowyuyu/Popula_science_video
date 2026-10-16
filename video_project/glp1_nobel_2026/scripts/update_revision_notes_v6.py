"""Refresh current production notes after accepted, hash-bound V6 finalization."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    final = json.loads((ROOT / 'research/revision-v5/finalization.json').read_text('utf8'))
    qa = json.loads((ROOT / 'research/qa/final-v5/automatic-report.json').read_text('utf8'))
    review = json.loads((ROOT / 'research/qa/final-v5/visual-review.json').read_text('utf8'))
    marker = json.loads((ROOT / 'tmp/final-render.json').read_text('utf8'))
    video = ROOT / 'delivery/GLP1_V5_1080p.mp4'
    digest = sha(video)
    assert digest == final['videoSHA256'] == qa['videoSHA256'] == review['videoSHA256'] == marker['videoSHA256']
    assert final['productionRevision'] == 'v6' and qa['automaticChecksPass'] and review['sampledVisualReviewCompleted']
    assert not review.get('blockingIssues') and not review.get('openBlockingFindings')
    archive = ROOT / 'research/revision-v6/historical-notes'
    archive.mkdir(parents=True, exist_ok=True)
    motion = ROOT / 'research/revision-v5/current-motion-repair.md'
    medical = ROOT / 'research/revision-v5/medical-visual-audit.md'
    for path in (motion, medical):
        snapshot = archive / path.name
        if not snapshot.exists():
            shutil.copy2(path, snapshot)
    motion.write_text(f'''# 人物、调节机制与运镜：V6交付记录

本轮交付为 `delivery/GLP1_V5_1080p.mp4`，文件名沿用V5，实际生产版本V6。
时长14分14.033秒，1920×1080，30 fps，共25,621帧。视频SHA256：`{digest}`。

## 已安装修改

- 开头改为“减肥，光靠少吃就够了吗？肚子上的脂肪，怎么牵动血糖、血压和血脂？咱们从这顿饭说起。”保留自然8.08秒口播，没有变速。
- 持叉手背朝上，手指包覆叉柄，前臂旋前；采用较小幅度的取食、抬起和放回动作。没有把该镜头描述为完整入口或吞咽动作。
- 短裤沿最终姿态皮肤表面同步；测压袖带由当前上臂截面重建，软管、读数与侧桌使用实际锚点。人物与器官在共同解剖坐标中交接。
- 微观缩放保留固定尺寸的父层参照，内容相关结构优先显现，透明变化伴随镜头移动。LDL回收和血小板段退出的两处弱参照桥已局部补修。
- 配乐使用用户指定的《幽蓝键 - Lemon Tree (柠檬树) - 钢琴曲》。按乐句衔接、内容调节和旁白闪避处理，保留原曲速度和音高，片尾使用自然尾奏；没有随机变调或额外添加鼓点。
- 四比例封面独立布局，标题“如何科学减肥？”，黑底白字“5分钟科普 · 血糖 血压 血脂”；胰岛、小动脉和脂蛋白来自本片模型。发布文案明确本集约14分钟特别篇。

## 生成与检查

V6先完成整片静音渲染，然后对F12000—12249、F20250—20749共750帧重新渲染并按IDR边界替换。实际光学改动仅在F12071—12194、F20431—20534；重新编码覆盖更宽的完整GOP。其余24,871帧与完整c9基线解码像素逐帧一致，补片750帧与各自渲染片段一致。原片、两补片、合成输出及源快照均保留校验记录。

- 当前源锁：`{marker['sourceLock']}`，SHA256 `{marker['sourceLockSHA256']}`。
- 时间线：`{final['timelineSHA256']}`；母带：`{review['masterSHA256']}`。
- 全片自动检查：`research/qa/final-v5/automatic-report.json`；完整解码、帧数、时长、BT.709、黑场与音频响度均通过。
- 补片来源与逐帧一致性：`{marker['validation']}`；锁定母带从零编码一次，无分段音频拼接、填补或变速。
- 视觉结论：`research/qa/final-v5/visual-review.json`。未变化帧的既有实看证据通过解码像素一致性继承；两处修复和四处接缝单独检查新编码画面。
- 原c9检查归档：`research/qa/archive-c9-before-continuity-v6/`。更早修订记录见 `research/revision-v6/historical-notes/current-motion-repair.md`，不作为当前版本结论。

## 仍需准确理解的边界

实际完成的是全片自动检查、各段代表帧和重点连续帧的视觉检查，没有声明完整逐秒主观观看或全长主观听审。极近景可见原人体网格棱角和轻微肘部折痕；药物分子过渡中部分蛋白参照较淡。微观几何和粒子流是教学示意，0D Windkessel是集中参数模型，不能称作患者三维CFD或分子动力学。医学证据范围见 `medical-visual-audit.md` 与交付来源说明。
''', encoding='utf8')
    text = (archive / medical.name).read_text('utf8')
    text = re.sub(r'^# .*', '# 如何科学减肥？从一顿饭看懂血糖、血压和血脂', text, count=1)
    text = text.replace('V5 医学与视觉专项审计｜2026-10-09', '医学与视觉专项审计｜初始V5证据，V6交付更新｜2026-10-09')
    note = f'''## 当前交付状态

最终成片：`delivery/GLP1_V5_1080p.mp4`；14分14.033秒；25,621帧；SHA256 `{digest}`。
当前口播文件SHA256为 `{sha(ROOT / 'docs/story-v5.json')}`。下方早期审计记录及快照保留原始哈希；不能把它们说成当前文件的哈希。本轮开头h001改为从少吃、腹部脂肪与三高的生活问题引入；h002以后沿用既有讲解和已完成的多音字修订。早期医学审计仍按其列明的资料阅读范围理解。

全片自动检查通过，实际画面抽样与两处后补透明交接的记录已绑定当前MP4，见 `research/qa/final-v5/visual-review.json`。未改变的画面通过解码像素一致性继承c9基线的实看证据，新补片另行检查。没有完成全片逐秒主观观看或全长主观听审；以下“待复看”是早期审计时点的记录，现阶段结论以本段和最终视觉报告为准。

当前配乐是用户指定的Lemon Tree钢琴录音，权利属于相应权利人，不适用早期器乐采样的CC0许可。人体、论文、字体和分子数据的许可保持各自原有范围。

'''
    text = text.replace('## 证据与版本', note + '## 早期证据与版本（保留原始审计范围）', 1)
    text = text.replace('人体数据CC BY 4.0、Human Atlas应用MIT、音乐采样CC0、字体SIL OFL', '人体数据CC BY 4.0、Human Atlas应用MIT、字体SIL OFL；早期音乐采样为CC0，当前Lemon Tree录音不在此许可内')
    text = text.replace('## 尚需最终成片验收', '## 早期待查清单（历史记录，当前状态见文首）')
    text = text.replace('## 本次审计快照', '## 早期审计文件快照（非当前文件哈希）')
    text = text.replace('最终成片路径、时长、帧数与SHA-256：**[待最终检查回填]**。', '当时尚无最终成片；现行路径、时长、帧数与SHA-256见文首“当前交付状态”。')
    medical.write_text(text, encoding='utf8')
    out = ROOT / 'research/revision-v6/current-notes-update.json'
    out.write_text(json.dumps({'updatedUTC':datetime.now(timezone.utc).isoformat(), 'videoSHA256':digest,
        'files':[{'path':p.relative_to(ROOT).as_posix(), 'sha256':sha(p)} for p in (motion, medical)],
        'historicalNotes':archive.relative_to(ROOT).as_posix()}, ensure_ascii=False, indent=2), 'utf8')
    print(out)


if __name__ == '__main__':
    main()
