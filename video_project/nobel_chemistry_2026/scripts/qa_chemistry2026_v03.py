"""Prepare reproducibility manifests or audit the actual delivered chemistry MP4.

This script never deletes assets and never treats machine checks as a human
review of animation, scientific meaning, narration or pronunciation.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs/v03'
TIMELINE = ROOT / 'src/chemistry2026v03/timeline-v03.json'
NARRATION = DOCS / 'narration-v03.json'
DEFAULT_VIDEO = ROOT / 'delivery/chemistry2026_v03/2026诺贝尔化学奖_让化学选择同一只手_v03_1080p.mp4'
PLANS = {
 'catalyst': ('催化剂与配体', '相同起点/终点的两条能量路径展示较低能垒；金属催化中心完成循环并再生，配体围绕中心建立手性环境。'),
 'hook': ('镜像引入', '一对互为镜像的立体构型进入同一机位；旋转尝试重合；镜面连接后续手性解释。'),
 'award': ('奖项与研究者', 'Henri B. Kagan 与 Kenso Soai 随口播进入；非线性效应与自催化分别对应后续实物变化。'),
 'mirror': ('镜像不可重合', '保持原子/基团身份，连续旋转对齐两组，展示另外两组无法同时重合；不能以翻转二维图代替立体手性。'),
 'pasteur': ('晶体与偏振光', '展示互为镜像的晶体分选、样品溶解及两种溶液使偏振方向相反旋转。'),
 'life': ('生命的手性选择', '并排比较两类生物分子结构和匹配结果；不把所有氨基酸统一标成 R 或 S。'),
 'frank': ('自发手性模型', '初始扰动、同手性增强/相反手性抑制、自催化回路依次运动，明确模型条件。'),
 'kagan': ('复合物与活性差异', '两种配体组成 RR、RS、SS；同/异手性复合物反应速率产生可见对比，数量对应官方教学例。'),
 'nonlinear': ('非线性曲线', '坐标轴先稳定，组成变化带动 ee 与产物曲线；正非线性位于线性参考上方，公式与比例同步。'),
 'soai': ('产物成为催化剂', '由真实分子结构/官方反应图建立原料→产物→下一轮催化的连续动作；区分1995与2003数据。'),
 'autocatalysis': ('正反馈放大', '每轮产物接回催化位置，反应速度/产物数量随轮次改变；清楚保留左右两条可能路径。'),
 'chance': ('随机手性分叉', '同样起始条件的重复实验走向 R 或 S，轨迹与标记共用路径；不预设所有实验选择同一边。'),
 'result': ('极低偏差放大', '不同批次/轮次的 ee 用相同刻度和语音对应的数值呈现；核对0.00005%与>99.5%所属条件。'),
 'tool': ('方法和用途', '让反应分析、分子选择性及应用结果对应同一机制，不把人工反应等同于生命起源。'),
 'papers': ('证据回看', '对应镜像、非线性、自催化的真实图依次聚焦；保持原图可读、署名和许可记录完整。'),
 'coda': ('回收核心问题', '同一对映体与反馈路径回收主线，品牌完整出现并留下自然收尾。'),
}


def stamp():
    return datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds')


def sha(path: Path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def relative(path: Path):
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def resolve(value):
    p = Path(value)
    return (ROOT / p if not p.is_absolute() else p).resolve()


def file_record(path):
    return {'file': relative(path), 'bytes': path.stat().st_size, 'sha256': sha(path)}


def prepare_manifests(final=None):
    """Snapshot current source state; missing outputs stay explicitly pending."""
    timeline = read_json(TIMELINE) if TIMELINE.exists() else None
    narration = read_json(NARRATION) if NARRATION.exists() else {'clips': []}
    rows = {str(c['id']): c for c in narration['clips']}
    clips = timeline['clips'] if timeline else narration['clips']
    source_dirs = ['src', 'scripts']
    source_files = sorted({p for directory in source_dirs for p in (ROOT/directory).rglob('*')
                           if p.is_file() and '__pycache__' not in p.parts and p.suffix in {'.ts', '.tsx', '.json', '.py', '.mjs'}})
    source_files += [p for p in [ROOT/'package.json', ROOT/'package-lock.json', ROOT/'tsconfig.json', NARRATION, DOCS/'story-v03.md'] if p.exists()]
    science_files = sorted(p for p in (ROOT/'research').rglob('*') if p.is_file() and p.suffix.lower() in {'.pdf', '.png', '.jpg', '.json', '.md', '.tex', '.svg'})
    asset_files = sorted(p for p in (ROOT/'public').rglob('*') if p.is_file())
    node = ROOT/'node_modules'
    dependencies = {
      'nodeModules': {'path': str(node), 'realPath': str(node.resolve()), 'shared': node.resolve() != node.absolute()},
      'remotion': '4.0.526', 'react': '19.2.3', 'typescript': '5.9.3',
      'ttsPython': 'D:/python_project/tts/.venv/Scripts/python.exe',
      'ttsModel': 'D:/python_project/tts/models/Qwen3-TTS-0.6B',
      'ttsReference': 'D:/python_project/tts/work/clone-reference.wav',
      'ttsProcessor': 'D:/python_project/tts/broadcast_voice.py',
      'chrome': str(node/'.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),
      'executables': {name: shutil.which(name) for name in ['node', 'python', 'ffmpeg', 'ffprobe', 'latex', 'dvisvgm']},
      'note': 'Existing approved master can be rerendered without regenerating TTS; external reference voice/model are not copied into delivery.'}
    required = ['src/chemistry2026v03/timeline-v03.json', 'public/audio-v03/master.wav', 'public/fonts-v03/sans.woff2', 'public/fonts-v03/serif.woff2', 'public/brand/rainbow-white.svg']
    lock = {'version': 'chemistry-v03', 'generatedAt': stamp(), 'status': 'final-video-machine-audit-recorded' if final else 'source-snapshot-only',
            'files': [file_record(p) for p in source_files], 'scientificAssets': [file_record(p) for p in science_files],
            'renderAssets': [file_record(p) for p in asset_files], 'dependencies': dependencies,
            'missingRequiredInputs': [p for p in required if not (ROOT/p).exists()],
            'paperContentVerification': 'See research/nobelchemistry2026/content-review-v02.md and facts-v01.md; file hashes verify identity, not scientific correctness.',
            'licenseReview': 'Official illustration restrictions retained in source ledger; public availability is not a commercial-use grant.',
            'finalVideo': final, 'humanReview': 'pending; no automatic claim of complete listening/viewing'}
    write_json(DOCS/'source-lock-v03.json', lock)
    contract = {'version': 'chemistry-v03', 'generatedAt': stamp(), 'timeline': relative(TIMELINE),
                'timingStatus': 'measured-timeline-present' if timeline else 'pending-measured-audio-timeline',
                'fps': timeline.get('fps', 30) if timeline else 30,
                'safeAreas1080p': {'brand': [100,44,340,103], 'header': [104,143,1784,282], 'captionReserve': [100,926,1820,1038], 'evidenceWindow': [1110,330,1810,860]},
                'reviewRule': 'These are shot intentions, not assertions that the current render satisfies them. Check each clause against final video.', 'clips': []}
    for clip in clips:
        scene=clip['scene']; title, action=PLANS.get(scene, (scene, '随每句口播检查输入、过程、结果及连续镜头。'))
        row=rows.get(str(clip['id']),clip)
        contract['clips'].append({'id':clip['id'], 'scene':scene, 'title':title, 'startFrame':clip.get('start'), 'endFrame':clip.get('end'),
             'spoken':row.get('spoken',clip.get('spoken','')), 'subtitleParts':clip.get('subtitleParts',[]), 'dynamicIntention':action,
             'sourceLedger':'research/nobelchemistry2026/source-ledger-v01.json', 'revisionReview':'research/nobelchemistry2026/content-review-v02.md', 'implementationReview':'pending-final-render-review',
             'finalRenderReview':'machine-QA-recorded-human-motion-audio-review-pending' if final else 'pending',
             'avoid':['主体与证据窗口重叠','字幕遮挡公式','静态文字代替计算过程','画面变化与朗读时钟失配']})
    write_json(DOCS/'shot-contract-v03.json',contract)
    candidates=[]
    tmp=ROOT/'tmp'
    if tmp.exists():
        for p in sorted(tmp.iterdir()):
            if p.is_dir() and re.match(r'chemistry-v03-(?:bundle|public)-\d+$',p.name):
                candidates.append({'path':str(p.resolve()),'reason':'Reproducible per-process Remotion staging cache','status':'candidate-only-not-deleted'})
    write_json(DOCS/'cleanup-v03.json', {'version':'chemistry-v03','generatedAt':stamp(),'mode':'plan-only','deletionPerformed':False,
      'enabled':False,'gates':['Completed final render','Video and audio hashes match QA','Human motion/listening review recorded','No live render or generation task using target','Absolute resolved path remains inside this project'],
      'protected':['src/','scripts/','docs/','research/','public/','audio/v02/raw/','audio/v02/clean/','audio/v02/master.wav','audio/v02/music-source.m4a','delivery/','output/','node_modules junction and its target','External TTS model/reference/processor'],
      'candidates':candidates,'finalVideo':final,'instructions':'Do not apply this plan directly. Refresh after final acceptance; inspect exact paths and preserve selected assets, licenses and rerender dependencies.'})
    return lock


def command(args, log):
    process=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
    log.write_text(process.stdout+'\n'+process.stderr,encoding='utf-8')
    return process


def sample_groups(timeline):
    total=int(timeline['duration']);fps=int(timeline['fps']);clamp=lambda n:max(0,min(total-1,int(n)))
    groups=[]
    for clip in timeline['clips']:
        start,end=int(clip['start']),int(clip['end'])
        groups.append({'kind':'content','id':clip['id'],'scene':clip['scene'],'frames':[clamp(start+(end-start-1)*q) for q in [.2,.5,.8]]})
    for previous,clip in zip(timeline['clips'],timeline['clips'][1:]):
        center=int(clip['start'])
        groups.append({'kind':'seam','id':f"{previous['id']}-{clip['id']}",'scene':clip['scene'],'frames':[clamp(center+d) for d in [-fps//2,0,fps//2]]})
    return groups


def contact_sheets(out,groups):
    try:
        from PIL import Image,ImageDraw,ImageFont
    except ImportError:
        return {'status':'not-created','reason':'Pillow unavailable; individual frames remain available'}
    font_path=Path('C:/Windows/Fonts/msyh.ttc')
    font=ImageFont.truetype(str(font_path),23) if font_path.exists() else ImageFont.load_default()
    folder=out/'contact-sheets';folder.mkdir(exist_ok=True);files=[]
    for kind in ['content','seam']:
        rows=[g for g in groups if g['kind']==kind]
        for page in range(0,len(rows),4):
            chunk=rows[page:page+4];sheet=Image.new('RGB',(1920,418*len(chunk)),(14,27,37));draw=ImageDraw.Draw(sheet)
            for i,row in enumerate(chunk):
                draw.text((12,418*i+8),f"{row['id']} {row['scene']} · frames {row['frames']}",font=font,fill=(238,245,245))
                for col,n in enumerate(row['frames']):
                    p=out/'frames'/f'frame-{n}.jpg'
                    if p.exists():
                        with Image.open(p) as im:sheet.paste(im.convert('RGB').resize((640,360)),(640*col,418*i+48))
            target=folder/f'{kind}-{page//4+1:02d}.jpg';sheet.save(target,quality=92);files.append(relative(target))
    return {'status':'created','files':files,'meaning':'Static samples only; they do not certify temporal smoothness or pronunciation.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only',action='store_true',help='Refresh manifests without claiming a video audit')
    parser.add_argument('--video',type=Path,default=DEFAULT_VIDEO)
    parser.add_argument('--out',type=Path,default=ROOT/'delivery/chemistry2026_v03/qa-final')
    parser.add_argument('--skip-extract',action='store_true',help='Skip review frame extraction, explicitly recorded')
    args=parser.parse_args()
    if args.prepare_only:
        lock=prepare_manifests();print(json.dumps({'status':lock['status'],'missing':lock['missingRequiredInputs']},ensure_ascii=False));return 0
    video=resolve(args.video);out=resolve(args.out)
    if not video.exists() or not TIMELINE.exists():
        prepare_manifests();print('Final video or measured timeline missing; only source snapshot was written.',file=sys.stderr);return 2
    for program in ['ffmpeg','ffprobe']:
        if not shutil.which(program):raise RuntimeError(f'Missing {program}')
    if out.exists():out=out.with_name(out.name+'-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    out.mkdir(parents=True,exist_ok=False)
    timeline=read_json(TIMELINE);expected={'width':1920,'height':1080,'fps':int(timeline['fps']),'frames':int(timeline['duration']),'seconds':int(timeline['duration'])/int(timeline['fps'])}
    probe=command(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(video)],out/'ffprobe.log')
    if probe.returncode:raise RuntimeError('ffprobe failed; inspect log')
    info=json.loads(probe.stdout);write_json(out/'ffprobe.json',info)
    vs=[s for s in info['streams'] if s['codec_type']=='video'];aus=[s for s in info['streams'] if s['codec_type']=='audio'];v=vs[0] if vs else {};a=aus[0] if aus else {}
    fps=float(Fraction(v.get('avg_frame_rate','0/1')));frames=int(v.get('nb_read_frames',v.get('nb_frames',0)))
    decode=command(['ffmpeg','-hide_banner','-v','error','-i',str(video),'-map','0:v:0','-map','0:a:0','-f','null','-'],out/'decode.log')
    loud=command(['ffmpeg','-hide_banner','-i',str(video),'-map','0:a:0','-af','ebur128=peak=true','-f','null','-'],out/'loudness.log')
    tail=loud.stderr.rsplit('Summary:',1)[-1];ln=re.search(r'\bI:\s*([-+\d.]+)\s+LUFS',tail);pn=re.search(r'\bPeak:\s*([-+\d.]+)\s+dBFS',tail)
    levels={'integratedLUFS':float(ln.group(1)) if ln else None,'truePeakDBTP':float(pn.group(1)) if pn else None,'measuredOn':'Final MP4 decoded AAC'}
    digest=command(['ffmpeg','-hide_banner','-v','error','-i',str(video),'-map','0:a:0','-c:a','pcm_s32le','-f','hash','-hash','sha256','-'],out/'decoded-audio-hash.log')
    match=re.search(r'SHA256=([0-9a-f]{64})',digest.stdout)
    duration=float(v.get('duration',info['format'].get('duration',0)))
    checks={'oneVideoStream':len(vs)==1,'oneAudioStream':len(aus)==1,'resolution':v.get('width')==1920 and v.get('height')==1080,
            'fps':abs(fps-expected['fps'])<.0001,'frameCount':frames==expected['frames'],'duration':abs(duration-expected['seconds'])<=.08,
            'aac48k':a.get('codec_name')=='aac' and int(a.get('sample_rate',0))==48000,'fullDecode':decode.returncode==0 and not decode.stderr.strip(),
            'loudness':levels['integratedLUFS'] is not None and -16.5<=levels['integratedLUFS']<=-12.5,
            'truePeak':levels['truePeakDBTP'] is not None and levels['truePeakDBTP']<=-1.0,'decodedAudioHash':digest.returncode==0 and match is not None}
    groups=sample_groups(timeline);write_json(out/'sample-plan.json',groups)
    extraction={'status':'skipped-by-argument' if args.skip_extract else 'pending'}
    if not args.skip_extract:
        frame_dir=out/'frames';frame_dir.mkdir();numbers=sorted({n for group in groups for n in group['frames']})
        expression='+'.join(f'eq(n,{n})' for n in numbers)
        result=command(['ffmpeg','-hide_banner','-v','error','-i',str(video),'-vf',f"select='{expression}'",'-fps_mode','vfr','-q:v','2',str(frame_dir/'sample-%05d.jpg')],out/'extract.log')
        images=sorted(frame_dir.glob('sample-*.jpg'));ok=result.returncode==0 and len(images)==len(numbers)
        for number,p in zip(numbers,images):p.rename(frame_dir/f'frame-{number}.jpg')
        checks['reviewSamplesExtracted']=ok
        extraction={'status':'complete' if ok else 'failed','count':len(images),'requested':len(numbers),'contactSheets':contact_sheets(out,groups)}
    video_record=file_record(video);video_record['decodedAudioSHA256_PCM_s32le']=match.group(1) if match else None
    report={'version':'chemistry-v03','generatedAt':stamp(),'status':'technical-pass' if all(checks.values()) else 'technical-fail',
            'video':video_record,'expected':expected,'observed':{'fps':fps,'frames':frames,'durationSeconds':duration,'audio':a,'video':v},'checks':checks,'loudness':levels,
            'samples':extraction,'humanReview':{'status':'pending','required':['Full normal-speed viewing','Clause-by-clause narration/subtitle match','Names and polyphonic words listening review','Molecule structure/curves vs primary sources','Overlap and paper readability','All seams and ending hold']}}
    write_json(out/'qa-report.json',report)
    prepare_manifests({**video_record,'technicalQA':relative(out/'qa-report.json'),'technicalStatus':report['status']})
    print(json.dumps({'status':report['status'],'report':str(out/'qa-report.json'),'failedChecks':[k for k,value in checks.items() if not value]},ensure_ascii=False))
    return 0 if all(checks.values()) else 1


if __name__=='__main__':
    raise SystemExit(main())
