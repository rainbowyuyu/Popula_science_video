from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil,argparse

root=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('kind',choices=['vertical','main']);args=parser.parse_args()
kind=args.kind;vertical=kind=='vertical'
qa=root/'research/qa/v16';target=qa/f'{kind}-visual-review.json'
archive=root/'work/v16/finishing/baseline'/f'{kind}-visual-review.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if not archive.exists(): shutil.copy2(target,archive)
baseline=json.loads(archive.read_text(encoding='utf-8-sig'))
media_path=qa/f'{kind}-media/media-report.json';media=json.loads(media_path.read_text(encoding='utf-8-sig'))
proof_path=root/f'work/v16/finishing/{kind}/assembly-proof.json';proof=json.loads(proof_path.read_text(encoding='utf-8-sig'))
boundary_path=qa/f'{kind}-patch-boundaries/report.json';boundary=json.loads(boundary_path.read_text(encoding='utf-8-sig'))
assert proof['passed'] and media['automaticChecksPassed']
assert media['videoSHA256']==proof['outputSHA256']==boundary['videoSHA256']==sha(Path(proof['output']))
assert baseline['videoSHA256']==proof['baselineSHA256']
if vertical:
    sheets=[2,3,4,5,6,7,8,9,10,12,13]
    joins=[(305,312),(513,520),(932,939),(1030,1037),(1291,1298),(1695,1702),(1833,1840),(2431,2438)]
    full=[721]
    fixes=[{'id':'F721-legend','frames':[721],'result':'pass_at_full_resolution','observation':'原尺寸复核：浅底托住4.25刻度，青色桩侧力箭头没有穿过数字；压轴力单位MN和位移×300清楚。土层纹理示意采用深色底白字，位于暗楼板前仍清楚。'},
        {'id':'sky-whip-crown-and-glass','result':'pass_at_sampled_frames','observation':'8处源时钟切换前后相邻帧均是天空，没有拆出玻璃网格或高处楼冠在屏幕边缘突然出现；进入下一结构的末尾/到达帧已检查。'}]
else:
    # Main was reviewed after the localized sky-crane and legend repairs.  Keep
    # this list explicit so the final report records exactly which final
    # contact sheets and source-switch frames were opened, rather than
    # implying a full real-time playback.
    sheets=list(range(1,25))
    joins=[(2457,2483),(3147,3158),(3756,3763),(5434,5471),
           (6483,6489),(7646,7693),(9087,9135),(9688,9725),(10024,10032)]
    full=[1850,2160,2250,2700]
    fixes=[
        {'id':'foundation-soil-pile-legend','frames':full,
         'result':'pass_at_full_resolution',
         'observation':'4张基础补充帧原尺寸复核：桩基、承台与土层剖面保持比例关系；土层纹理示意、独立单桩压轴力图例、4.25刻度与MN单位清楚，未见图例穿过构件。'},
        {'id':'sky-whip-crown-and-glass','result':'pass_at_sampled_frames',
         'observation':'9处源时钟切换前后相邻帧均已抽查；天空 crane 先承接侧向甩镜再升高，未见拆出玻璃网格或高处楼冠在屏幕边缘突然刷入，进入下一结构的末尾/到达帧构图连续。'}]
contacts=[media['contactSheets'][n-1] for n in sheets]
seen=sorted({f for s in contacts for f in s['frames']})
boundary['manuallyViewed']=True
boundary['manualReview']={'reviewedUTC':datetime.now(timezone.utc).isoformat(),'result':'pass_at_sampled_boundary_pairs','observation':'实际打开所有接边联系表；相邻帧的楼体、TMD和片尾滑入保持连续构图，未见首次seek状态跳位。数字仅描述编码像素差，不单独证明动态美感。'}
boundary_path.write_text(json.dumps(boundary,ensure_ascii=False,indent=2),encoding='utf-8')
report={
 'schema':'rainbow.visual-review/2','generatedUTC':datetime.now(timezone.utc).isoformat(),'reviewer':'Codex camera reviewer','aspect':'9:16' if vertical else '16:9',
 'status':'passed_at_reviewed_frames_after_local_repairs','phase':'final assembled MP4 with hash-bound localized repair review',
 'video':proof['output'],'videoSHA256':proof['outputSHA256'],
 'mediaReport':{'path':str(media_path),'sha256':sha(media_path),'automaticChecksPassed':True},
 'baselineReview':{'path':str(archive),'sha256':sha(archive),'videoSHA256':baseline['videoSHA256'],'coverage':baseline['coverage'],'scope':'Preserved first-version observations; reused only for byte-identical unmodified ranges. Modified ranges use the new actual decoded frames below.'},
 'assemblyProof':{'path':str(proof_path),'sha256':sha(proof_path),'unchangedOutsidePatchFrames':proof['unchangedOutsidePatchFrames'],'replacementFramesVerified':proof['replacementFramesVerified'],'allFramesCompared':proof['allFramesCompared'],'AACPacketsIdentical':proof['AACPacketsIdentical']},
 'coverage':{'newMediaContactSheetsOpened':len(contacts),'newMediaSampledFramesViewed':len(seen),'boundaryContactSheetsOpened':len(boundary['contacts']),'boundaryFramesViewed':len(boundary['frames']),'uniqueFinalFramesViewedThisReview':len(set(seen+boundary['frames']+full)),'fullResolutionFramesOpened':full,'storyJoinsReviewed':len(joins),'patchEdgesReviewed':len(boundary['envelopesInclusive'])*2,'fullDurationRealTimePlayback':False,'completeTransitionRealTimePlayback':False,'subjectiveAudioListening':False},
 'contactsActuallyOpened':contacts,'sampledFramesActuallyViewed':seen,
 'storyJoins':[{'cutFrame':cut,'consecutiveSwitchFramesViewed':[cut-2,cut-1,cut],'arrivalFramesViewed':[end-1,end],'result':'pass_at_sampled_frames'} for cut,end in joins],
 'patchBoundaries':{'path':str(boundary_path),'sha256':sha(boundary_path),'envelopesInclusive':boundary['envelopesInclusive'],'contactsActuallyOpened':boundary['contacts'],'framesViewed':boundary['frames'],'comparisonsToSameBaselineFrames':boundary['comparisonsToSameBaselineFrames'],'result':'pass_at_sampled_boundary_pairs'},
 'repairObservations':fixes,
 'scope':'Final encoded frame review of requested repaired ranges, true story source-switch frames and GOP patch boundaries. Unmodified-frame identity is proven by assembly evidence. This is not a claim of full real-time playback, subjective audio listening, global C2 continuity or independent physics validation.',
 'outstandingBlockingFindingsInReviewedScope':[]
}
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':report['status'],'videoSHA256':report['videoSHA256'],'coverage':report['coverage'],'report':str(target)},ensure_ascii=False,indent=2))
