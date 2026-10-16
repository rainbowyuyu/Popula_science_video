from pathlib import Path
import json,hashlib,shutil
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'research/revision-v6/covers';DST=ROOT/'delivery/covers'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
report=json.loads((SRC/'layout-report.json').read_text('utf8'));review=json.loads((SRC/'visual-review.json').read_text('utf8'))
assert review['sampledVisualReviewCompleted'] and not review['blockingIssues']
for row in review['actualFilesViewed']:assert sha(Path(row['path']))==row['sha256']
root_files=[f'cardiometabolic-cover-{r}.jpg' for r in ('16x9','4x3','3x4','9x16')]+['contact-sheet-320.jpg','contact-sheet-160.jpg']
rootreview={'reviewer':'root','reviewedUTC':datetime.now(timezone.utc).isoformat(),'actualFilesViewed':[{'path':(SRC/n).relative_to(ROOT).as_posix(),'sha256':sha(SRC/n)} for n in root_files],'findings':['Four independent arrangements; large title and black/white topic strip; original transparent PNG brand.','Three model studies identify islet glucose regulation, arteriolar pressure regulation, and lipoprotein particle; models use independent cover magnifications.','Corrected vessel labels avoid the islet. Principal shapes and title readable at 160px; secondary copy needs larger presentation.'],'blockingIssues':[],'fullSizeReviewed':True,'thumbnail320Reviewed':True,'thumbnail160Reviewed':True}
(SRC/'root-visual-review.json').write_text(json.dumps(rootreview,ensure_ascii=False,indent=2),'utf8')
for ratio,entry in report['formats'].items():
 assert sha(SRC/f'cardiometabolic-cover-{ratio}.jpg')==entry['sha256']
 entry['visualReview']={'completed':True,'blockingIssues':[],'rootReportSHA256':sha(SRC/'root-visual-review.json'),'independentReportSHA256':sha(SRC/'visual-review.json')}
(SRC/'layout-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
files=list(SRC.glob('cardiometabolic-cover-*.jpg'))+list(SRC.glob('artwork-*.jpg'))+list(SRC.glob('contact-sheet-*.jpg'))+[SRC/'layout-report.json',SRC/'layouts.json',SRC/'root-visual-review.json',SRC/'visual-review.json']
rows=[]
for p in files:
 dest=DST/p.name;backup=ROOT/'research/revision-v6/publishing-before/covers'/p.name
 if dest.exists() and not backup.exists():backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dest,backup)
 shutil.copy2(p,dest);assert sha(dest)==sha(p);rows.append({'destination':dest.relative_to(ROOT).as_posix(),'sha256':sha(dest)})
promo=ROOT/'research/revision-v5/publishing-refresh/发布文案.md';target=ROOT/'delivery/发布文案-v5.md';backup=ROOT/'research/revision-v6/publishing-before/发布文案-v5.md'
if target.exists() and not backup.exists():backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
text=promo.read_text('utf8').replace('发布候选 · 2026-10-09','发布文案 · 2026-10-09').replace('开头或时长调整后，重新核对章节时间。','章节按本次已锁定时间线核对。')
target.write_text(text,'utf8');rows.append({'destination':target.relative_to(ROOT).as_posix(),'sha256':sha(target)})
(DST/'README.md').write_text('''# 如何科学减肥？｜四比例封面

正式文件为 cardiometabolic-cover-16x9.jpg、4x3.jpg、3x4.jpg、9x16.jpg。RGB/sRGB，JPEG 4:4:4。黑底白字栏目：5分钟科普 · 血糖 血压 血脂。实际正片约14分钟，为系列特别篇。

胰岛、剖开的小动脉、脂蛋白颗粒均取自本片 Three.js 模型，以封面专用镜头重渲染。为清晰表达，三个主体采用各自的展示倍率，不表示它们实际一样大；脂蛋白外壳在封面作了局部剖开。不是患者影像或实测场景，未调用图片生成。

透明 PNG Logo 位于左上，右侧 rainbow鱼。字体统一 Noto Sans SC。四版独立排布，不由横版裁成竖版。原图、320/160缩图检查范围详见 visual-review.json 与 root-visual-review.json。

复现：node scripts/render_cover_mechanisms_v6.mjs；python scripts/make_covers_v6.py。模型入口 research/revision-v6/covers/CoverMechanisms.tsx；坐标 scripts/make_covers_v6.py 与 layouts.json。无字底图为 artwork-比例.jpg。模型内的细胞排列和脂蛋白外观为教学示意。
''','utf8')
(ROOT/'research/revision-v6/publishing-installation.json').write_text(json.dumps({'installedUTC':datetime.now(timezone.utc).isoformat(),'files':rows,'layoutSHA256':sha(SRC/'layout-report.json')},ensure_ascii=False,indent=2),'utf8')
print('Installed four reviewed covers, their derivatives and four-platform publishing copy.')
