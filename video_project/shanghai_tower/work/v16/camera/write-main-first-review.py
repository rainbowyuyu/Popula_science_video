from pathlib import Path
from datetime import datetime, timezone
import json, hashlib

root = Path(__file__).resolve().parents[3]
media_path = root / 'research/qa/v16/main-media/media-report.json'
media = json.loads(media_path.read_text(encoding='utf-8-sig'))
frames = json.loads((root/'research/qa/v16/main-media/extracted-frames.json').read_text(encoding='utf-8-sig'))
report = {
    'schema':'rainbow.visual-review/1', 'generatedUTC':datetime.now(timezone.utc).isoformat(),
    'reviewer':'Codex camera reviewer', 'aspect':'16:9',
    'status':'requires_local_repairs_before_final_acceptance',
    'phase':'first complete encoded main, prior to sky-crane and legend fixes',
    'video':str(root/'delivery/ShanghaiTower_1080p_v16.mp4'),
    'videoSHA256':media['videoSHA256'],
    'mediaReport':{'path':str(media_path),'sha256':hashlib.sha256(media_path.read_bytes()).hexdigest(),'automaticChecksPassed':media['automaticChecksPassed']},
    'coverage':{'contactSheetsOpened':24,'uniqueSampledFramesViewed':209,'firstFrame':0,'lastFrame':10799,
        'fullDurationRealTimePlayback':False,'completeTransitionRealTimePlayback':False,'subjectiveAudioListening':False},
    'contactSheets':media['contactSheets'],
    'framesViewed':frames,
    'observations':[
        {'id':'opening-and-assembly','result':'pass_at_sampled_frames','observation':'已检查照片至点云、整楼拆解、单层逐件讲解的联系表。楼冠与镜头主题连续，字幕和品牌清楚；不是全程实时播放结论。'},
        {'id':'member-wind-tmd','result':'pass_at_sampled_frames','observation':'已检查受力、表面风压、流场剖面和TMD取样。变量颜色及单位可读，剖面贴近建筑；TMD透明关系可看见内部。'},
        {'id':'workflow-papers','result':'pass_at_sampled_frames','observation':'论文页占满各自纸张，标题作者位于纸张下方。主片尾页抽帧保持统一字级和暖白底色。'},
        {'id':'foundation-legend','severity':'minor','result':'repair_requested','observation':'单桩图例与侧向力箭头接近，土层纹理示意在部分深色物体前对比不足；已交主代理修复。'},
        {'id':'glass-at-hidden-source-cut','severity':'major','result':'repair_required','frames':[3146,3147,3148,3754,3755,3756],
         'observation':'F3146主体已离场，但F3147/3148左下突然露出远处拆开的蓝色幕墙网格。F3754/3755左上网格在F3756切到左下。纯侧向off-axis转场暴露源时钟切换。已要求修复相机后局部重渲染。'},
        {'id':'chapter-heading-travel','severity':'note','result':'accepted_at_sampled_frames','frames':[1898,5580],'observation':'章节文字在离场横移时经过楼体，为动态离场过程；没有认定为静止遮挡，完整实时运动未检查。'},
    ],
    'scope':'只记录实际打开的24张联系表209个取样帧及剪接附近相邻帧。保存修复前发现，不等同于最终修复版验收；没有完整实时播放、主观听音或本报告独立的计算数据验证。'
}
target=root/'research/qa/v16/main-visual-review.json'
if target.exists():
    raise RuntimeError('Preserve existing first-review report; refuse overwrite')
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(target)
