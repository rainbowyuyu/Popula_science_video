"""V8 private recovery package. Small docs may be generated before final render.

python scripts/package_v8.py --docs-only
python scripts/package_v8.py --dry-run --selection-json PATH
python scripts/package_v8.py --video FINAL --encoding-report REPORT --audio-sync-report SYNC --freeze FREEZE
No deletion, no fallback modification, and no broad public/audio inclusion.
"""
from __future__ import annotations
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit
import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'rainbow-marine-ep01-v8' / 'release'
VENDOR = ROOT / 'work/waterpro-v4/vendor-valid/threejs-water-pro'
DENY_PARTS = {'.git', 'node_modules', '__pycache__', '.venv', '.cache', 'bundle', 'qa-bundle', 'prior'}
DENY_NAMES = {'auth.json', 'credentials.json', 'secrets.json', 'settings.json', 'known_hosts', 'config.toml'}
DENY_SUFFIX = {'.pem', '.key', '.p12', '.pfx', '.cer', '.crt', '.der', '.ppk', '.pyc', '.pyo', '.7z', '.zip', '.tmp', '.blend1', '.blend2'}
TEXT = {'.py', '.js', '.mjs', '.ts', '.tsx', '.json', '.md', '.txt', '.svg', '.html', '.css', '.toml', '.yaml', '.yml', '.csv', '.log'}
SECRETS = [re.compile(rb'sk-[A-Za-z0-9_.\-]{24,}'), re.compile(rb'AKIA[0-9A-Z]{16}'),
           re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
           re.compile(rb'(?i:Bearer)\s+[A-Za-z0-9_.\-]{24,}')]


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''):
            h.update(b)
    return h.hexdigest()


def local(path):
    p = Path(path)
    return (p if p.is_absolute() else ROOT / p).resolve()


def archive_name(name):
    s = str(name).replace('\\', '/')
    p = PurePosixPath(s)
    if p.is_absolute() or '..' in p.parts or ':' in s:
        raise ValueError('Unsafe archive entry')
    return p.as_posix()


def permitted(path):
    return (not any(p.lower() in DENY_PARTS or p.lower().startswith(('bundle-', 'qa-bundle-')) for p in path.parts)
            and path.name.lower() not in DENY_NAMES and not path.name.lower().startswith('.env')
            and path.suffix.lower() not in DENY_SUFFIX
            and not re.search(r'(?i)(?:^|[-_])(credential|secret|private[-_]?key)(?:[-_.]|$)', path.name))



def scan_credentials(files):
    found = []
    for name, p in files.items():
        if p.suffix.lower() in TEXT:
            data = p.read_bytes()
            if any(pat.search(data) for pat in SECRETS):
                found.append(name)
    if found:
        raise ValueError('Credential-like content: ' + ', '.join(found) + ' (values withheld)')


def entries(files):
    return [{'path': n, 'bytes': p.stat().st_size, 'sha256': sha(p)} for n, p in sorted(files.items())]


def write_zip(path, files, listing, instructions):
    tmp = path.with_suffix('.zip.tmp')
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        for name, p in sorted(files.items()):
            z.write(p, name)
        # No archive hash or delivery manifest is embedded; avoids self-hash loops.
        z.writestr('delivery/' + path.stem + '-file-hashes.json', json.dumps(listing, ensure_ascii=False, indent=2))
        z.writestr('delivery/' + path.stem + '-README.md', instructions)
    with zipfile.ZipFile(tmp) as z:
        invalid = z.testzip()
        if invalid:
            raise ValueError('Archive CRC failed: ' + invalid)
        actual = set(z.namelist())
        if any(x.endswith(('.pem', '.key', '.p12', '.pfx')) for x in actual):
            raise ValueError('Forbidden certificate/key in ZIP')
    tmp.replace(path)
    return {'file': path.name, 'sha256': sha(path), 'bytes': path.stat().st_size, 'crc': 'passed', 'files': listing}


def collect(qa_paths, docs, freeze=None):
    source, runtime, missing, excluded = {}, {}, [], []

    def add(path, name=None, required=False, private=False):
        p=local(path)
        name=archive_name(name or p.relative_to(ROOT).as_posix())
        if not p.is_file():
            if required:missing.append(name)
            return
        if not permitted(p) or not permitted(Path(name)):
            excluded.append(name)
            if required:missing.append(name+' (excluded)')
            return
        if p.is_symlink():raise ValueError('Symlink input: '+name)
        dest=runtime if private else source
        if name in dest and dest[name]!=p:raise ValueError('Duplicate archive path: '+name)
        dest[name]=p

    def tree(folder, accept=lambda p:True, private=False):
        base=local(folder)
        if base.exists():
            for p in sorted(base.rglob('*')):
                if p.is_file() and accept(p):add(p,private=private)

    def gltf(path, allowed, private=False):
        if path.suffix.lower() not in {'.gltf','.glb'} or not path.exists():return
        if path.suffix.lower()=='.gltf':doc=json.loads(path.read_text(encoding='utf-8-sig'))
        else:
            with path.open('rb') as f:
                header=f.read(20)
                if len(header)!=20:raise ValueError('Truncated GLB')
                magic,version,total,length,kind=struct.unpack('<5I',header)
                if magic!=0x46546C67 or version!=2 or kind!=0x4E4F534A or total!=path.stat().st_size:raise ValueError('Invalid GLB: '+str(path))
                doc=json.loads(f.read(length).decode('utf8').rstrip(' \x00'))
        for item in doc.get('buffers',[])+doc.get('images',[]):
            uri=item.get('uri','')
            if not uri or uri.startswith('data:'):continue
            url=urlsplit(uri)
            if url.scheme or url.netloc:raise ValueError('Remote glTF dependency: '+str(path))
            dep=(path.parent/unquote(url.path)).resolve()
            if not dep.is_relative_to(allowed.resolve()):raise ValueError('glTF path escape')
            add(dep,required=True,private=private)

    def asset(name):
        name=archive_name(name);path=ROOT/'public'/name
        private=name.startswith('vendor/waterpro/') or name in {
            'audio/episode01-mix-v8.wav','audio/episode01-xijian-v8.wav','audio/xijian-source.mp3'}
        add(path,required=True,private=private);gltf(path,ROOT/'public',private)

    for folder in ['src','scripts','data']:tree(folder)
    for name in ['package.json','package-lock.json','tsconfig.json']:add(name,required=True)
    for p in ROOT.glob('remotion.config.*'):add(p)
    refs=set()
    for p in (ROOT/'src').rglob('*'):
        if p.suffix.lower() not in {'.ts','.tsx','.js','.json'}:continue
        code=p.read_text(encoding='utf-8-sig')
        refs.update(re.findall(r"(?:staticFile|mask)\(\s*['\"]([^'\"]+)['\"]\s*(?=[,)])",code))
        refs.update(re.findall(r"['\"]((?:models|fonts|brand|vendor)/[^'\"]+\.(?:gltf|glb|hdr|exr|png|jpg|jpeg|webp|ktx2|woff2|svg|js|json))['\"]",code))
    story=json.loads((ROOT/'src/story.json').read_text(encoding='utf8'))
    refs.update({'audio/v8/narration.wav','audio/v8/subtitles.srt','audio/narration-immersive-v8.wav',
        'audio/water-crossings-v8.wav','audio/episode01-mix-v8.wav','audio/episode01-xijian-v8.wav','audio/xijian-source.mp3',
        'fonts/unified.woff2','fonts/marine-display.typeface.json','fonts/Noto-OFL.txt',
        'models/v8/turbine-rayao.glb','models/v8/outer-ray-ao.png','models/v8/mechanism-ray-ao.png',
        'models/v8/qwantani_late_afternoon_puresky_2k.hdr','models/v8-city/provenance.json',
        'brand/logo.png','brand/zju-emblem.svg','vendor/waterpro/foam2.jpg','vendor/waterpro/foam4.jpg',
        'vendor/waterpro/LICENSE.md','vendor/waterpro/provenance.json'})
    refs.update('audio/v8/'+c['id']+'.wav' for c in story['sentences'])
    for folder,materials in [('v7-city',['asphalt_02','brick_wall_001','concrete_layers_02']),
                             ('v8-city',['coast_sand_rocks_02','rock_boulder_dry'])]:
        for material in materials:
            for channel in ['diff','normal','rough']:refs.add(f'models/{folder}/{material}/{channel}.jpg')
    for name in sorted(refs):asset(name)
    # Existing production geometry is sufficient to replay; retain editable
    # Blender sources and model inputs as well, without older rendered movies.
    for name in ['work/model-qa/turbine.blend','work/v8/lighting/turbine-rayao-v8.blend',
                 'work/v7-city/tree_small_02_lod.blend','work/v7-city/tree-source/tree_small_02.gltf']:
        path=ROOT/name;add(path,required=True);gltf(path,ROOT/'work/v7-city/tree-source')
    # Forest/grass derivative scripts need these exact pre-V8 inputs to rebuild.
    for name in ['models/polyhaven/grass_ground/textures/grass_ground_diff_2k.jpg',
                 'models/v7-city/tree_small_02_lod/tree_small_02_lod.glb']:
        asset(name)
    add(Path('C:/Windows/Fonts/NotoSansSC-VF.ttf'),'work/source-font/NotoSansSC-VF.ttf',required=True)
    for folder in ['public/brand','public/fonts','public/models']:
        tree(folder,lambda p:any(t in p.name.lower() for t in ['license','provenance','copyright','ofl','source']))
    for name in ['build/index.js','build/index.d.ts','LICENSE.md','package.json']:
        add(VENDOR/name,required=True,private=True)
    for p in sorted((VENDOR/'build').rglob('*.d.ts')):add(p,required=True,private=True)
    vendor_source=(VENDOR/'build/index.js').read_text(encoding='utf8')
    if '\x00' in vendor_source or not vendor_source.lstrip().startswith('import '):raise ValueError('Invalid WaterPro ESM')
    imports=re.findall(r'(?m)^\s*import\s+(?:[^;\n]*?\s+from\s+)?[\'\"]([^\'\"]+)[\'\"]',vendor_source)
    if any(not name.startswith('three') for name in imports):raise ValueError('Review new vendor dependencies')
    add('work/waterpro-v4/verified-vendor-integrity.json',private=True)
    # Current V8 spoken sources only; do not recurse public/audio or old voices.
    for folder in ['work/audio-v8/raw','work/audio-v8/clean']:
        tree(folder,lambda p:p.suffix.lower() in {'.wav','.json'})
    tree('work/audio-v8/asr',lambda p:p.suffix=='.json')
    tree('work/audio-v8',lambda p:p.parent==ROOT/'work/audio-v8' and p.suffix.lower() in {'.json','.md','.txt','.srt'})
    for name in ['705058.html','705058.mp3','852167.html','852167.mp3']:
        add('work/audio-v7/references/'+name,required=True)
    for folder in ['research/iterations/v8-audio/official','work/v8-city/research']:
        tree(folder,lambda p:p.suffix.lower() in TEXT|{'.dat'})
    add('research/iterations/v8-audio/sources-fetched.json',required=True)
    # Documentation/QA, not transient bundles, old baselines or raw frame caches.
    for folder in ['work/v8','work/v8-city','work/v8-native']:
        tree(folder,lambda p:p.suffix.lower() in {'.json','.jsonl','.md','.txt','.py','.mjs','.ts'}
             and not any(x in p.parts for x in ['source-baseline','runtime'])
             and not p.name.startswith(('entry.','bundle-')))
    for name in ['work/v8/lighting/bake-manifest.json','work/v8-native/waterline-measured/immersion-timeline-native.json',
                 'work/audio-v8/audio-v8-report.json','work/audio-v8/pcm-audit-v8.json',
                 'work/v8/qa-subtitles/subtitle-audit.json','work/v8/qa-subtitles/widest-caption.png']:
        add(name,required=True)
    for name in ['work/v7-city/sources.md','work/v7-city/polyhaven-license.html','work/v7-city/volturnus-cad.pdf']:
        add(name,required=True)
    # Skill text is for reproducibility, not permission to redistribute assets.
    skill_root=Path('C:/Users/zju/.codex/skills/science-video')
    for name in ['SKILL.md','references/ocean-scene-rendering.md','references/qa-delivery.md']:
        add(skill_root/name,'skills/science-video/'+name,required=True)
    if freeze:add(freeze,'delivery/source-freeze-v8.json',required=True)
    for doc in docs:add(doc,'delivery/'+doc.name,required=True)
    for folder in qa_paths:
        if not folder.exists():missing.append('qa/'+folder.name);continue
        for p in sorted(folder.rglob('*')) if folder.is_dir() else [folder]:
            if p.is_file() and p.suffix.lower() in TEXT|{'.jsonl','.png','.jpg','.jpeg'}:
                add(p,'qa/'+folder.name+('/'+p.relative_to(folder).as_posix() if folder.is_dir() else ''),required=True)
    if set(source)&set(runtime):raise ValueError('Private runtime overlaps source package')
    forbidden_audio=[n for n in source|runtime if n.startswith('public/audio/') and not
        (n.startswith('public/audio/v8/') or n.endswith('-v8.wav') or n=='public/audio/xijian-source.mp3')]
    if forbidden_audio:raise ValueError('Obsolete audio was selected: '+','.join(forbidden_audio))
    return source,runtime,missing,excluded


def final_report_context(video=None, encoding=None, audio_sync=None):
    """Read actual final reports and bind each one to the supplied movie hash.

    Failed checks remain reportable, but final packaging rejects them below.
    No report means pending, never an inferred pass from the existence of MP4.
    """
    context={'video':None,'encoding':None,'audioSync':None}
    if not encoding and not audio_sync:return context
    if not video or not video.is_file():raise FileNotFoundError('Final reports require the exact --video file')
    digest=sha(video)
    context['video']={'path':str(video),'sha256':digest,'bytes':video.stat().st_size}
    for label,path,schema in [('encoding',encoding,'rainbow-science-video-encoding-v8'),
                              ('audioSync',audio_sync,'marine-final-aac-sync-v8')]:
        if not path:continue
        if not path.is_file():raise FileNotFoundError('Final report absent: '+str(path))
        doc=json.loads(path.read_text(encoding='utf-8-sig'))
        if doc.get('schema')!=schema or doc.get('version')!='v8':raise ValueError('Wrong final report schema/version: '+str(path))
        recorded=doc.get('sha256') if label=='encoding' else doc.get('film',{}).get('sha256')
        if recorded!=digest:raise ValueError('Final report does not match exact movie SHA256: '+str(path))
        if label=='audioSync':
            master=ROOT/'public/audio/episode01-mix-v8.wav'
            if doc.get('master',{}).get('sha256')!=sha(master):raise ValueError('Sync report master differs from current approved PCM')
        context[label]={'path':str(path),'sha256':sha(path),'data':doc}
    return context


def final_checks_text(context):
    encoding=context.get('encoding') if context else None
    sync=context.get('audioSync') if context else None
    if not encoding and not sync:
        return ('成片尚未完成，以下检查待最终MP4输出后执行：完整解码、帧数、黑帧/静音、AAC包时间戳、'
                '最终音画相关性、成片SHA256。此时只生成说明文档，不生成已通过的交付包。\n')
    lines=['## 最终成片实测结果','',
           f"成片：`{Path(context['video']['path']).name}`。SHA256：`{context['video']['sha256']}`。",'']
    def status(value):return '通过' if value is True else '未通过' if value is False else '未记录'
    if encoding:
        doc=encoding['data'];c=doc.get('checks',{})
        lines += [f"- 编码总结果：**{status(doc.get('encodingPassed'))}**；报告 `{Path(encoding['path']).name}`，SHA256 `{encoding['sha256']}`。",
                  f"- 1920×1080：{status(c.get('resolution'))}；30 fps：{status(c.get('fps'))}；10813帧：{status(c.get('frameCount'))}；完整解码：{status(c.get('fullDecode'))}。",
                  f"- AAC包时间戳连续：{status(c.get('audioPacketTimingContinuous'))}；音视频流时长差：{c.get('avDurationDeltaSec','未记录')} 秒。",
                  f"- 黑帧区间：{len(c['blackIntervals']) if isinstance(c.get('blackIntervals'),list) else '未记录'}；超过1.25秒静音起点：{len(c['silenceStartsOver1_25Sec']) if isinstance(c.get('silenceStartsOver1_25Sec'),list) else '未记录'}。",
                  f"- 最终AAC响度：{c.get('integratedLUFS','未记录')} LUFS；真峰值：{c.get('truePeakDbTP','未记录')} dBTP。"]
    else:lines.append('- 最终编码报告未提供；不声称该部分通过。')
    if sync:
        doc=sync['data'];windows=doc.get('windows',[]);tail=doc.get('tailEnergy',{})
        lines += [f"- 最终AAC与已批准PCM同步：**{status(doc.get('passed'))}**；报告 `{Path(sync['path']).name}`，SHA256 `{sync['sha256']}`。",
                  f"- 检查窗口：{len(windows)} 个；尾音能量保留：{status(tail.get('passed'))}。"]
        if windows:
            lag=max(abs(w['lagSamples']) for w in windows)
            correlation=min(w['normalizedCorrelation'] for w in windows)
            lines.append(f'- 窗口最大绝对延迟：{lag} 采样；最低归一化相关系数：{correlation:.6f}。')
        if doc.get('error'):lines.append('- 同步报告记录错误；详见报告，未通过项不得作为合格交付。')
    else:lines.append('- 最终AAC同步报告未提供；不声称尾音与同步已通过。')
    lines += ['', '以上状态来自与成片SHA256绑定的报告；抽帧审图、正常速度观看和听审另行记录，不能由数值结果推断。','']
    return '\n'.join(lines)


def make_documents(out, final_context=None):
    out.mkdir(parents=True,exist_ok=True)
    story=json.loads((ROOT/'src/story.json').read_text(encoding='utf8'))
    sources=json.loads((ROOT/'research/iterations/v8-audio/sources-fetched.json').read_text(encoding='utf8'))
    used={s for c in story['sentences'] for s in c.get('sourceIds',[])}
    lines=['# 浙江大学·海洋新能源｜第一期：海上的风，怎样点亮岸上的灯？','',
        '本片采用介绍者视角，以风能转为电能并送上岸的过程为主线。研究案例来自以下公开资料。访问日期：2026-10-14。','',
        '## 研究与原理来源','']
    for s in sources:
        status='正文引用' if s['id'] in used else '背景阅读，未在本集口播展开'
        lines.extend([f"- **{s['id']} · {s['title']}**（{status}）",
            f"  {s['url']}",f"  原网页快照 SHA256：`{s['sha256']}`。"])
    lines += ['', '## 使用范围与归属','',
        '- Zwind：按浙江大学公开报道介绍气动、水动、土动、多体动力学与控制耦合能力；本片画面未使用 Zwind 求解结果。',
        '- 陈鹰、钱鹏团队：依据2025年12月漠河极寒测试报道；不把报道中的后续量产计划说成已完成。',
        '- 司玉林：引用公开研究方向，不宣称某套算法已在本片模型部署。',
        '- 葛晗等指导的团队：介绍2024年研究生竞赛获奖监测方案，不等同规模商业工程。',
        '- 直驱风机、导管架、半潜浮体与校园为教学重建。无官方CAD或真实工程设计认证。',
        '- 原网页正文与快照保留其原始著作权，归档用于私人核查与可追溯性。']
    (out/'sources.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    narration=['浙江大学·海洋新能源','第一期 海洋风电总览','海上的风，怎样点亮岸上的灯？','']
    for c in story['sentences']:narration.extend([f"[{c['start']:.2f}–{c['end']:.2f}] {c['id']}",c['text'],''])
    (out/'旁白-v8.txt').write_text('\n'.join(narration),encoding='utf8')
    shutil.copy2(ROOT/'public/audio/v8/subtitles.srt',out/'subtitles-v8.srt')
    production='''# V8 制作说明与恢复方法

主片目标规格：1920×1080、30 fps、10813帧，360.433333秒。旁白实际360.42秒，末尾补640个静音采样匹配帧网格，完整保留句源。

## 画面实现

Blender制作可拆解直驱风机部件，并用Cycles/OptiX烘焙近场接触遮蔽（AO）；Three.js/WebGPU组织连续摄影机、机械运动与场景光照。付费WaterPro 3.1.1使用原生WebGPU/TSL水面。HDR天空、扫描植被和PBR贴图用于材质与环境响应。

这是 **Cycles AO烘焙 + WebGPU实时渲染的混合流程**，不是全片路径追踪影片。风机载荷、叶片形变、控制信号、海缆监测等为教学原理示意；未运行本片风机的CFD/FEA求解，不把动画热力/信号效果解释为实验测量。

## 声音与字幕

rainbow鱼既有参考音色，由用户本地Qwen3-TTS模型在授权SSH服务器GPU1合成。保留raw/clean与每句台账，不打包个人参考录音、TTS大模型或登录凭据。原句不变速、不截字；母带温和降噪、去齿音与动态控制。水下声场按真实GPU水线时间处理，保持中文解说清晰。

配乐沿用用户提供的《汐渐》（MoFeansy、Warsic），按乐句匹配衔接并在人声段平滑降低音量。字幕124条，统一Noto Sans SC，按实际句源ASR锚点对齐；没有旧版字幕延长覆盖表参与播放。

## 本地恢复

1. 将 `source-v8.zip` 与 `private-runtime.zip` 解压到同一个空目录。
2. 运行 `python scripts/restore_v8_dependencies.py`。它先保留原始package文件，再采用 `work/v8/recovery/` 中独立registry锁，执行 `npm ci --ignore-scripts` 和 `npm run check`。原始生产锁有12个兄弟工程链接，不能在空目录直接使用；portable锁保留实际生产版本并补齐registry校验信息。
3. 视频主入口为 `src/index.tsx` / `EpisodeFilm.tsx`，只使用 `audio/episode01-mix-v8.wav` 一条最终音轨，避免重复叠加stem。
4. 按脚本中的项目路径和实际机器调整：Blender原路径 `D:/blender/blender.exe`，TTS原工程 `D:/python_project/tts`；字体源已包含在 `work/source-font/`，改字后需调整字体脚本源路径并重建。
5. portable锁在本机D盘独立目录完成 `npm ci`、离线重装、`npm ls` 与 `npm run check`；没有使用兄弟工程的node_modules。仅验证依赖安装和编译，未在全新机器完整重渲染。正式渲染仍需FFmpeg、支持WebGPU的Chromium和可用GPU。记录见 `work/v8/recovery/recovery-validation.json`。

归档不删除、不覆盖旧版成片或用户原始素材。WaterPro、品牌、个人音色和配乐均保留各自授权边界；两个ZIP仅供原授权用户本地恢复。
'''
    (out/'制作与恢复说明-v8.md').write_text(production,encoding='utf8')
    rights='''# 来源、许可与分发说明

|资源|来源与许可|本包处理|
|---|---|---|
|WaterPro 3.1.1|用户已购商业运行库，https://docs.threejswaterpro.com/guide/installation.html |仅必要build、声明和LICENSE，放private-runtime.zip；不含demo、证书、私钥|
|Poly Haven植被/PBR/HDR|https://polyhaven.com/license ，CC0 1.0|保留生产资产、衍生文件、URL和SHA256；树木LOD/季节调色在provenance中说明|
|Noto Sans SC|SIL Open Font License 1.1|保留字幕WOFF2、三维字形、原字体和OFL文本|
|水下录音705058|felix.blume，https://freesound.org/people/felix.blume/sounds/705058/ ，CC0|保留网页许可证据与下载的HQ MP3预览；不称无损原始录音|
|水下转场852167|KolbyRFX，https://freesound.org/people/KolbyRFX/sounds/852167/ ，CC0|原作者说明为水听器录音与合成/颗粒元素组合；本片进一步做音效设计|
|《汐渐》|MoFeansy、Warsic，用户提供MP3|曲目及含曲目的混音归入private-runtime.zip；本工作不授予新增公播/再分发许可|
|浙江大学标识、rainbow鱼标识|用户提供/既有品牌素材|保留原资产；不能据此声称校方正式背书|
|个人参考音色|用户既有rainbow鱼参考|保留本集生成句源与参数；不打包参考录音和TTS权重|
|官方网页与研究介绍|见sources.md|公开阅读不等同CC0，网页快照供私人溯源|

OpenFAST/NREL公开半潜结构资料用于了解构件连接关系；本片几何是教学重建，不是照搬认证工程CAD。软件依赖的许可证以package-lock对应的软件包为准。所有恢复包均为私人恢复用途，未承诺整包可公开再分发。

凭据筛查拒绝API密钥、Bearer令牌、私钥、PEM/P12/PFX/证书、.env及授权配置；归档不会包含用户SSH密钥或Claude/Qwen连接配置。
'''
    (out/'来源与许可-v8.md').write_text(rights,encoding='utf8')
    checks='''# 检查范围与尚未验证事项

已取得的检查证据：

- 旁白27句逐样本拼接一致、保长、首尾保护与ASR记录；123条初版字幕在一句尾部修复后变为124条。
- Chromium用实际字幕WOFF2和实际CSS检查124条：零缺字、零字体回退、零换行、零越界、零阅读密度告警。
- 最终PCM完整解码，48kHz/24bit/双声道、17300800采样；−16.01 LUFS、−1.30 dBTP，无超过1.25秒长静音。
- 两处水下旁白处理的互相关延迟为0采样；过水点来自60Hz原生GPU水面测量，按源码SHA核对。
- 机械/镜头/字体与渲染检查以归档中的各份报告为准。抽帧或数值检查不能代替完整观看。

'''
    checks+=final_checks_text(final_context)
    checks+='\n**主观全片实时观看与完整听审尚未完成，不声称已完成。** ASR正确不能证明声调或音色悦耳；数值指标也不能单独证明审美或物理真实性。最终manifest中保留独立字段，避免把打包/CRC检查与审美审阅混为一谈。\n'
    (out/'检查范围-v8.md').write_text(checks,encoding='utf8')
    return [out/n for n in ['sources.md','旁白-v8.txt','subtitles-v8.srt','制作与恢复说明-v8.md','来源与许可-v8.md','检查范围-v8.md']]


def verify_freeze(path):
    doc=json.loads(path.read_text(encoding='utf-8-sig'))
    records=doc.get('files',doc.get('sources',doc.get('entries')))
    if isinstance(records,dict):records=[{'path':k,'sha256':v if isinstance(v,str) else v.get('sha256')} for k,v in records.items()]
    if not isinstance(records,list) or not records:raise ValueError('Freeze must have files/sources/entries with path + sha256')
    checked=[]
    for item in records:
        name=item.get('path',item.get('file'));expected=item.get('sha256')
        if not name or not expected:raise ValueError('Freeze entry lacks path/hash')
        p=local(name)
        if not p.is_relative_to(ROOT):raise ValueError('Freeze path outside project')
        if not p.is_file() or sha(p)!=expected:raise ValueError('Frozen input changed: '+str(name))
        checked.append(p.relative_to(ROOT).as_posix())
    needed={'src/story.json','src/EpisodeFilm.tsx','src/CameraRail.ts','src/MarineWorld.ts','src/NativeWaterV7.ts',
            'public/audio/episode01-mix-v8.wav','public/fonts/unified.woff2','package-lock.json'}
    if not needed.issubset(checked):raise ValueError('Freeze incomplete: '+','.join(sorted(needed-set(checked))))
    return {'path':str(path),'sha256':sha(path),'filesVerified':len(checked)}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=OUT);ap.add_argument('--video',type=Path)
    ap.add_argument('--encoding-report',type=Path);ap.add_argument('--audio-sync-report',type=Path);ap.add_argument('--freeze',type=Path)
    ap.add_argument('--qa-report',type=Path,action='append',default=[])
    ap.add_argument('--docs-only',action='store_true');ap.add_argument('--dry-run',action='store_true')
    ap.add_argument('--selection-json',type=Path);ap.add_argument('--overwrite',action='store_true')
    args=ap.parse_args();out=local(args.output)
    if out==Path(out.anchor) or out==ROOT or ROOT.is_relative_to(out):raise ValueError('Dedicated delivery directory required')
    if any(re.match(r'rainbow-marine-ep01-v[1-7](?:-|$)',p) for p in out.parts):raise ValueError('Do not write into prior delivery')
    video=local(args.video) if args.video else None
    encoding=local(args.encoding_report) if args.encoding_report else None
    audio_sync=local(args.audio_sync_report) if args.audio_sync_report else None
    if not audio_sync and encoding and (encoding.parent/'audio-sync-v8.json').is_file():audio_sync=encoding.parent/'audio-sync-v8.json'
    final_context=final_report_context(video,encoding,audio_sync)
    docs=make_documents(out,final_context)
    if args.docs_only:
        print(json.dumps({'mode':'documents-only','documents':[str(p) for p in docs],'videoClaimedComplete':False},ensure_ascii=False,indent=2));return 0
    qa=[local(p) for p in args.qa_report]
    if encoding and encoding.exists():qa.append(encoding.parent)
    if audio_sync and audio_sync.parent not in qa:qa.append(audio_sync.parent)
    freeze=local(args.freeze) if args.freeze else None
    source,runtime,missing,excluded=collect(qa,docs,freeze)
    scan_credentials(source);scan_credentials(runtime)
    summary={'schema':'rainbow-science-video-package-selection-v8','sourceFiles':len(source),'privateRuntimeFiles':len(runtime),
        'sourceBytes':sum(p.stat().st_size for p in source.values()),'privateRuntimeBytes':sum(p.stat().st_size for p in runtime.values()),
        'missingRequired':missing,'excludedCount':len(excluded),'output':str(out),'allPriorDeliveriesUnmodified':True}
    if args.selection_json:
        selection=local(args.selection_json);selection.parent.mkdir(parents=True,exist_ok=True)
        selection.write_text(json.dumps({**summary,'source':sorted(source),'privateRuntime':sorted(runtime),'excluded':excluded},ensure_ascii=False,indent=2),encoding='utf8')
    if args.dry_run:print(json.dumps(summary,ensure_ascii=False,indent=2));return 0 if not missing else 2
    if missing:raise ValueError('Missing required files: '+','.join(missing))
    if not video or not encoding or not audio_sync or not freeze:raise ValueError('Final packaging needs --video, --encoding-report, --audio-sync-report and --freeze')
    if not video.is_file() or not encoding.is_file() or not freeze.is_file():raise FileNotFoundError('Final video/report/freeze absent')
    frozen=verify_freeze(freeze)
    video_hash=final_context['video']['sha256'];cert=final_context['encoding']['data']
    if cert.get('version')!='v8' or not cert.get('encodingPassed') or cert.get('sha256')!=video_hash:raise ValueError('Encoding report does not certify exact V8 movie')
    if not final_context['audioSync']['data'].get('passed'):raise ValueError('Final AAC sync report has not passed')
    names=['source-v8.zip','private-runtime.zip','delivery-manifest-v8.json']
    if any((out/n).exists() for n in names) and not args.overwrite:raise FileExistsError('V8 named outputs exist; explicit --overwrite required')
    instructions=(out/'制作与恢复说明-v8.md').read_text(encoding='utf8')
    a=write_zip(out/names[0],source,entries(source),instructions)
    b=write_zip(out/names[1],runtime,entries(runtime),instructions)
    if video!=out/video.name:shutil.copy2(video,out/video.name)
    manifest={'schema':'rainbow-science-video-delivery-v8','version':'v8','created':datetime.now(timezone.utc).isoformat(),
        'video':{'file':video.name,'sha256':video_hash,'bytes':video.stat().st_size},'archives':{'source':a,'privateRuntime':b},
        'documents':[{'file':p.name,'sha256':sha(p)} for p in docs],'sourceFreeze':frozen,
        'encoding':{'report':str(encoding),'sha256':sha(encoding),'passed':True},
        'audioSync':{'report':str(audio_sync),'sha256':sha(audio_sync),'passed':True},
        'scientificBoundary':'Educational engineering visualization; Cycles AO + native WebGPU hybrid, not full-film path tracing; no turbine CFD/FEA solved output.',
        'rights':'Private original-license-holder recovery only; commercial runtime and music remain restricted.',
        'qa':{'packageCRC':'passed','sourceHashFreezeVerified':True,'freshMachineRerenderTested':False,
              'actualFullNormalSpeedViewing':False,'subjectiveListeningChecked':False,'evidence':[str(p) for p in qa]},
        'priorDeliveries':'Preserved in place; neither copied wholesale nor deleted.'}
    (out/names[2]).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({**summary,'videoSHA256':video_hash,'sourceZIP':a['sha256'],'privateRuntimeZIP':b['sha256'],'crc':'passed'},ensure_ascii=False,indent=2));return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,FileNotFoundError,FileExistsError,subprocess.CalledProcessError) as e:
        print('PACKAGE_V8_ERROR: '+str(e),file=sys.stderr);raise SystemExit(1)


