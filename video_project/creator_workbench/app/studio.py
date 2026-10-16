"""Series, editable cover templates, reference learning, and project organization."""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import uuid
import tempfile

from .harness import safe_path, junction, redact
from .local_paths import LOGO_ROOT, python_executable
from .export_metadata import exported_defaults
from .series_catalog import CatalogMixin, cover_spec, project_features

RATIOS = {'16:9': (1920, 1080), '3:4': (1440, 1920), '4:3': (1920, 1440), '9:16': (1080, 1920), '1:1': (1600, 1600)}
DEFAULT_STYLE = {'name': 'rainbow鱼 · 清透科普', 'font': 'Microsoft YaHei', 'accent': '#365d79', 'background': '#f6f3ec',
                 'titleColor': '#173047', 'coverTemplateId': 'rainbow-clean', 'brand': 'rainbow鱼',
                 'rules': '左上角图片Logo与rainbow鱼并排；系列胶囊颜色底白字；大标题少字；同一系列保持字体、品牌位置和封面层级；画面主物体讲清机制。'}
CAMERAS = [
 {'id': 'orbit', 'name': '环绕揭示', 'description': '沿主体做缓慢弧线环绕，关注点保持在同一结构。', 'keyframes': [{'t':0,'position':[6,3,8],'target':[0,1,0],'fov':40},{'t':.5,'position':[8,3,0],'target':[0,1,0],'fov':40},{'t':1,'position':[4,2,-5],'target':[0,1,0],'fov':40}]},
 {'id': 'dive', 'name': '连续下潜', 'description': '从母层锚点进入内部，透明层逐步退让。', 'keyframes':[{'t':0,'position':[0,3,12],'target':[0,1,0],'fov':42},{'t':.5,'position':[0,2,6],'target':[0,1,0],'fov':42},{'t':1,'position':[0,1,2],'target':[0,1,0],'fov':42}]},
 {'id': 'reveal', 'name': '前景遮挡接力', 'description': '沿侧向轨迹经过前景，保持两端速度连续。', 'keyframes':[{'t':0,'position':[-8,2,6],'target':[-2,1,0],'fov':45},{'t':.5,'position':[0,2,5],'target':[0,1,0],'fov':45},{'t':1,'position':[8,2,6],'target':[2,1,0],'fov':45}]},
 {'id': 'drone', 'name': '高空俯冲建立空间', 'description': '先建立空间关系，再下降到可读的主体细节。', 'keyframes':[{'t':0,'position':[12,16,14],'target':[0,0,0],'fov':45},{'t':.55,'position':[8,6,8],'target':[0,1,0],'fov':45},{'t':1,'position':[4,2,4],'target':[0,1,0],'fov':45}]},
]


def stamp():
    return time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.pending')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
    os.replace(tmp, path)


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf8'))
    except (OSError, ValueError):
        return copy.deepcopy(default)


def clean_text(value, limit=20000):
    value = str(value or '').strip()
    if len(value) > limit or redact(value) != value:
        raise ValueError('内容过长或包含凭据，请只保存创作信息')
    return value


def identifier(value):
    value = str(value or '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,90}', value):
        raise ValueError('记录编号无效')
    return value


def probe(path):
    command = [shutil.which('ffprobe') or 'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]
    done = subprocess.run(command, capture_output=True, timeout=25, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if done.returncode:
        raise ValueError('无法读取媒体，请先完成渲染')
    return json.loads(done.stdout)


class Studio(CatalogMixin):
    def __init__(self, workbench):
        self.app = workbench
        self.root = workbench.state_root / 'studio'
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.store_path = self.root / 'catalog.json'
        self.store = read_json(self.store_path, {'series': [{'id':'rainbow-science','name':'每天5分钟科普','style':DEFAULT_STYLE}],
            'templates':[{'id':'rainbow-clean','name':'清透科普 · 系列统一','style':DEFAULT_STYLE,'layout':{'title':{'x':.07,'y':.27},'badge':{'x':.07,'y':.18},'subject':{'x':.62,'y':.6},'logo':{'x':.04,'y':.04},'font':'Microsoft YaHei'}}], 'editors':{}})
        self.init_catalog()

    def save(self):
        with self.lock:
            write_json(self.store_path, self.store)

    def project_root(self, project_id):
        return Path(self.app.library.project(project_id)['path']).resolve()

    def config(self, project_id):
        with self.lock:
            path=safe_path(self.project_root(project_id), '.studio/project.json')
            source=path if path.is_file() else safe_path(self.project_root(project_id),'project.json')
            info=source.stat() if source.is_file() else None
            signature=(info.st_mtime_ns,info.st_size) if info else None
            cached=self._config_cache.get(project_id)
            if cached and cached[0]==signature:return copy.deepcopy(cached[1])
            value=read_json(path, exported_defaults(self.project_root(project_id)))
            self._config_cache[project_id]=(signature,copy.deepcopy(value))
            return value

    def save_config(self, project_id, config):
        with self.lock:
            path=safe_path(self.project_root(project_id), '.studio/project.json')
            write_json(path, config)
            info=path.stat();self._config_cache[project_id]=((info.st_mtime_ns,info.st_size),copy.deepcopy(config))

    def update_config(self, project_id, change):
        # HTTP actions and background downloads share this read/modify/write lock.
        with self.lock:
            config=self.config(project_id)
            change(config)
            self.save_config(project_id,config)
            return config

    def selected_style(self, project_id):
        config = self.config(project_id)
        series = next((s for s in self.store['series'] if s['id'] == config.get('seriesId')), self.store['series'][0])
        return copy.deepcopy(series)

    def snapshot(self, project_id, module='all'):
        if module not in {'all','base','creative','covers','audio','motion','learn','organize','memory'}:
            raise ValueError('未知工程模块')
        config = self.ensure_metadata(self.app.library.project(project_id)) if project_id else {}
        series=self.selected_style(project_id) if project_id else None
        compact={key:copy.deepcopy(config.get(key)) for key in ('metadataVersion','title','displayName','episode','seriesId','templateId','useSeriesStyle')}
        compact['features']=project_features(config.get('features'))
        full=module=='all'
        want_covers=full or module=='covers';want_audio=full or module=='audio'
        want_motion=full or module=='motion';want_learn=full or module=='learn';want_organize=full or module=='organize'
        templates=copy.deepcopy(self.store['templates']) if want_covers else [{key:copy.deepcopy(t.get(key)) for key in ('id','name','style')} for t in self.store['templates']]
        result={'module':module,'series':[{key:copy.deepcopy(s.get(key)) for key in ('id','name','style','archived')} for s in self.store['series']],
            'templates':templates,'projectConfig':compact,
            'coverSpec':copy.deepcopy(series.get('coverSpec')) if series and config.get('useSeriesStyle',True) else None,
            'references':[],'cameraPresets':[],'audioLibrary':[],'jobs':[],'tts':{},'qwen':{},'editors':[],'ratios':RATIOS,
            'collaborationRoles':[{'provider':'openai','role':'叙事规划 / 三维建模 / 整合验收'},{'provider':'claude','role':'代码绘图 / 动效 / 镜头细化'}]}
        if want_covers:
            compact['covers']=[{key:copy.deepcopy(value) for key,value in c.items() if key!='layout'} for c in config.get('covers',[])[-20:]]
            result['copies']=self.copy_read(project_id)['platforms'] if project_id else {}
        if want_motion:
            result['cameraPresets']=copy.deepcopy(CAMERAS)+copy.deepcopy(config.get('cameraPresets',[])[-20:])
            result['qwen']=self.app.media_studio.qwen_status()
        if want_learn:
            result['references']=copy.deepcopy(config.get('references',[])[-30:])
            compact['learnedSkills']=copy.deepcopy(config.get('learnedSkills',[])[-20:])
        if want_audio:
            media=self.app.media_studio
            with media.lock:result['audioLibrary']=copy.deepcopy(list(media.music.values()))
            result['tts']=media.tts_status()
            if project_id:
                root=self.project_root(project_id);subtitle_paths=[]
                for key in ('subtitlePath','subtitlesPath'):
                    if isinstance(config.get(key),str):subtitle_paths.append(config[key])
                for folder in ('subtitles','output','delivery'):
                    directory=root/folder
                    if directory.is_dir():
                        subtitle_paths.extend(p.relative_to(root).as_posix() for p in sorted(directory.glob('*.srt'),key=lambda p:p.stat().st_mtime,reverse=True)[:8])
                        subtitle_paths.extend(p.relative_to(root).as_posix() for p in sorted(directory.glob('*.vtt'),key=lambda p:p.stat().st_mtime,reverse=True)[:4])
                result['subtitlePaths']=list(dict.fromkeys(subtitle_paths))
        if want_audio or want_motion or want_organize:
            result['jobs']=[{key:copy.deepcopy(value) for key,value in job.items() if key not in {'events','parameters','release'}} for job in self.app.media_studio.list_jobs() if not project_id or job.get('projectId')==project_id][:12]
        if want_motion or want_organize:result['editors']=self.editors()
        return result

    def series_save(self, body):
        name = clean_text(body.get('name'), 80)
        if not name:
            raise ValueError('请输入系列名称')
        sid = identifier(body.get('id') or 'series-' + uuid.uuid4().hex[:12])
        style = body.get('style') or {}
        if not isinstance(style, dict):
            raise ValueError('风格格式无效')
        clean_text(json.dumps(style, ensure_ascii=False))
        old=next((item for item in self.store['series'] if item['id']==sid),{})
        contract=copy.deepcopy(old.get('coverSpec') or cover_spec(style.get('font','Microsoft YaHei'),name))
        contract['font']=style.get('font',old.get('style',{}).get('font','Microsoft YaHei'));contract['badgeText']=name
        row = {'id':sid, 'name':name, 'style':{**DEFAULT_STYLE, **old.get('style',{}), **style},'coverSpec':contract,'archived':bool(old.get('archived'))}
        with self.lock:
            self.store['series'] = [s for s in self.store['series'] if s['id'] != sid] + [row]
            self.save()
        return row

    def series_manage(self,body):
        sid=body.get('id') or body.get('seriesId')
        with self.lock:
            series=next((s for s in self.store['series'] if s['id']==sid),None)
            if not series:raise ValueError('系列不存在')
            action=body['action']
            if action=='series.rename':return self.series_save({'id':sid,'name':body.get('name')})
            if action in {'series.archive','series.restore'}:
                if sid=='independent' and action=='series.archive':raise ValueError('独立工程分组始终保留')
                series['archived']=action=='series.archive';self.save();return copy.deepcopy(series)
            ids=body.get('projectIds')
            if not isinstance(ids,list) or not ids or any(not isinstance(p,str) for p in ids):raise ValueError('请选择需要归属的工程')
            if series.get('archived'):raise ValueError('请先恢复已归档的系列')
            for pid in ids:self.app.library.project(pid)
            rows=[self.project_configure(pid,{'seriesId':sid,'useSeriesStyle':True})['project'] for pid in dict.fromkeys(ids)]
            return {'seriesId':sid,'projects':rows}

    def template_save(self, body):
        data = body.get('template',body)
        if not isinstance(data,dict) or not isinstance(data.get('layout',{}),dict):
            raise ValueError('请导入含 name、layout、style 的 JSON 模板')
        clean_text(json.dumps(data,ensure_ascii=False),150000)
        row = {'id':identifier(data.get('id') or 'template-'+uuid.uuid4().hex[:10]),'name':clean_text(data.get('name') or '自定义封面',80),
               'layout':data.get('layout',{}),'style':data.get('style',{})}
        with self.lock:
            self.store['templates'] = [t for t in self.store['templates'] if t['id'] != row['id']] + [row]
            self.save()
        return row

    def cover_save(self, project_id, body):
        ratio = body.get('ratio','16:9')
        if ratio not in RATIOS:
            raise ValueError('不支持的封面比例')
        config=self.ensure_metadata(self.app.library.project(project_id))
        layout=body.get('layout',{})
        if not isinstance(layout,dict):raise ValueError('封面布局需为对象')
        clean_text(json.dumps(layout,ensure_ascii=False),120000)
        contract=self.selected_style(project_id).get('coverSpec') if config.get('useSeriesStyle',True) else None
        if contract:
            target=contract['ratios'][ratio];positions=layout.get('positions',{});sizes=layout.get('fontSizes',{})
            if layout.get('font')!=contract['font'] or layout.get('coverSpecVersion')!=contract['version']:
                raise ValueError('系列封面需先应用当前系列规范和统一字体')
            if layout.get('subtitle')!=contract['badgeText']:
                raise ValueError('系列封面的系列栏文字需与当前系列名称保持一致')
            for name,spec_name in (('logo','logo'),('subtitle','badge'),('title','titleAnchor')):
                actual=positions.get(name,{})
                if any(not isinstance(actual.get(axis),(int,float)) or not math.isfinite(actual[axis]) or abs(actual[axis]-target[spec_name][axis])>.0001 for axis in ('x','y')):
                    raise ValueError('系列封面的Logo、系列栏和标题位置需保持规范；可关闭参考系列风格自由设计')
            if any(sizes.get(name)!=target[field]['fontSize'] for name,field in (('title','titleAnchor'),('badge','badge'),('brand','brand'))):
                raise ValueError('系列封面字号与当前画幅规范不一致')
        data = str(body.get('dataUrl',''))
        if not data.startswith('data:image/jpeg;base64,'):
            raise ValueError('封面需要导出为 JPG')
        raw = base64.b64decode(data.split(',',1)[1], validate=True)
        if len(raw) > 15_000_000 or not raw.startswith(b'\xff\xd8\xff'):
            raise ValueError('封面不是有效 JPG 或超过15MB')
        root = self.project_root(project_id)
        directory = safe_path(root, 'covers/'+stamp())
        directory.mkdir(parents=True)
        out = directory / ('cover-'+ratio.replace(':','x')+'.jpg')
        out.write_bytes(raw)
        details = probe(out)
        stream = details['streams'][0]
        if (stream.get('width'),stream.get('height')) != RATIOS[ratio]:
            out.unlink()
            raise ValueError('封面尺寸不符合该比例规范')
        record = {'id':'cover-'+uuid.uuid4().hex[:10], 'name':clean_text(body.get('name') or '系列封面',100),'ratio':ratio,
                  'path':out.relative_to(root).as_posix(), 'layout':layout, 'templateId':body.get('templateId'), 'seriesId':config.get('seriesId'),
                  'useSeriesStyle':config.get('useSeriesStyle',True),'coverSpecVersion':contract['version'] if contract else None,'validation':'layout-contract-and-jpeg-dimensions; raster appearance requires visual review',
                  'sha256':hashlib.sha256(raw).hexdigest(),'createdAt':time.time()}
        editor=body.get('editorProject')
        if isinstance(editor,dict) and editor.get('type')=='minipaint':
            payload=editor.get('json')
            if isinstance(payload,str):
                if len(payload)>12_000_000:raise ValueError('图层工程超过12MB，请在miniPaint另存')
                payload=json.loads(payload)
            if not isinstance(payload,dict):raise ValueError('图层工程格式错误')
            write_json(directory/'minipaint.json',payload)
            record['editableProject']=(directory/'minipaint.json').relative_to(root).as_posix()
        write_json(directory/'layout.json',record)
        self.update_config(project_id,lambda config:config.setdefault('covers',[]).append(record))
        if hasattr(self.app.library,'media_page'):self.app.library.media_page(project_id,scope='latest',refresh=True)
        else:self.app.library.snapshot(refresh=True)
        self.activity(project_id,'cover.save',{'id':record['id'],'path':record['path'],'ratio':ratio,'coverSpecVersion':record['coverSpecVersion']})
        return record

    def cover_load(self, project_id, body):
        record=next((item for item in self.config(project_id).get('covers',[]) if item['id']==body.get('id')),None)
        if not record:raise ValueError('未找到此封面记录')
        result=copy.deepcopy(record)
        if record.get('editableProject'):
            path=safe_path(self.project_root(project_id),record['editableProject'])
            if path.is_file() and path.stat().st_size<=15_000_000:
                result['editorProject']={'type':'minipaint','json':path.read_text(encoding='utf8')}
        return result

    def cover_render(self,project_id,body,preview=False):
        """Render current-project pixels through the same local pipeline for preview/export."""
        root=self.project_root(project_id);config=self.ensure_metadata(self.app.library.project(project_id))
        source=self.app.media_path(str(body['mediaId'])) if body.get('mediaId') else safe_path(root,str(body.get('sourcePath','')))
        if not source.resolve().is_relative_to(root) or not source.is_file():raise ValueError('请选择当前工程中的图片或视频')
        source=safe_path(root,source.relative_to(root).as_posix())
        video=source.suffix.lower() in {'.mp4','.mov','.webm','.m4v'}
        if not video and source.suffix.lower() not in {'.jpg','.jpeg','.png','.webp'}:raise ValueError('封面来源需为图片或视频')
        title=clean_text(body.get('title',config.get('title')),100)
        if not title:raise ValueError('请填写封面标题')
        ratios=body.get('ratios',['16:9','3:4','4:3','9:16'])
        if not isinstance(ratios,list) or not ratios or len(ratios)>4 or len(set(ratios))!=len(ratios) or any(r not in RATIOS or r=='1:1' for r in ratios):raise ValueError('请选择四种标准比例')
        fmt=body.get('format','jpg')
        if fmt not in {'jpg','png'}:raise ValueError('导出格式仅支持JPG或PNG')
        use_series=body.get('useSeriesStyle',config.get('useSeriesStyle',True))
        if not isinstance(use_series,bool):raise ValueError('系列参考需为布尔值')
        series=self.selected_style(project_id)
        tid=body.get('templateId') or config.get('templateId') or series['style'].get('coverTemplateId')
        template=next((t for t in self.store['templates'] if t['id']==tid),None)
        if not template:raise ValueError('请选择已有封面模板')
        template=copy.deepcopy(template);style={**DEFAULT_STYLE,**template.get('style',{}),**(series.get('style',{}) if use_series else {})}
        contract=copy.deepcopy(series['coverSpec'] if use_series else cover_spec(style['font'],clean_text(body.get('badge') or series['name'],80)))
        if not use_series:
            for rule in contract['ratios'].values():
                for name,key in (('title','titleAnchor'),('badge','badge')):
                    pos=template.get('layout',{}).get(name,{})
                    if isinstance(pos,dict):
                        for axis in ('x','y'):
                            v=pos.get(axis)
                            if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and .02<=v<=.8:rule[key][axis]=v
        subject=body.get('subject') or {}
        if not isinstance(subject,dict) or set(subject)-set(ratios):raise ValueError('主体构图参数需按所选画幅提供')
        for ratio,values in subject.items():
            if not isinstance(values,dict) or set(values)-{'x','y','zoom'}:raise ValueError('主体构图参数无效')
            for key,value in values.items():
                lo,hi=(1,3) if key=='zoom' else (0,1)
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not lo<=value<=hi:raise ValueError('主体位置需在0到1，缩放需在1到3之间')
        at=body.get('timeSec',0)
        if isinstance(at,bool) or not isinstance(at,(int,float)) or not math.isfinite(at) or at<0:raise ValueError('请选择有效视频时间')
        if video:
            duration=float(probe(source).get('format',{}).get('duration') or 0)
            if at>=duration:raise ValueError('封面帧时间超出视频时长')
        logo_candidates=[self.app.resource_root/'web/assets/logo.png',LOGO_ROOT/'logo.png']
        logo=next((p for p in logo_candidates if p.is_file()),None)
        if not logo:raise ValueError('未找到现有rainbow鱼品牌Logo')
        python=python_executable(prefer_tts=False)
        if not python:raise ValueError('未找到Python，请安装Python或设置RAINBOW_PYTHON')
        script=Path(__file__).resolve().parents[1]/'scripts/render_series_cover.py'
        scratch=safe_path(root,'work/covers');scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='preview-' if preview else 'render-',dir=scratch) as temp:
            temp=Path(temp);frame=source
            if video:
                frame=temp/'frame.png';done=subprocess.run([shutil.which('ffmpeg') or 'ffmpeg','-v','error','-ss',str(at),'-i',str(source),'-frames:v','1',str(frame)],capture_output=True,timeout=40,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                if done.returncode or not frame.is_file():raise ValueError('无法读取该视频帧，请换一个时间点')
            output=temp/'rendered';spec={'source':str(frame),'sourcePath':source.relative_to(root).as_posix(),'timeSec':at if video else None,'output':str(output),'logo':str(logo),'title':title,'series':series['name'],'style':style,'coverSpec':contract,'templateSpec':template,'subject':subject,'ratios':ratios,'formats':[fmt],'preview':preview}
            spec_path=temp/'request.json';write_json(spec_path,spec)
            done=subprocess.run([python,str(script),str(spec_path)],capture_output=True,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if done.returncode:raise ValueError('本机封面排版失败：'+redact(done.stderr.decode('utf8',errors='replace'))[-900:])
            layouts=read_json(output/'layouts.json',{})
            if preview:
                return {'projectId':project_id,'sourcePath':spec['sourcePath'],'timeSec':spec['timeSec'],'items':[{'ratio':r,'width':RATIOS[r][0],'height':RATIOS[r][1],'dataUrl':'data:image/jpeg;base64,'+base64.b64encode((output/(r.replace(':','x')+'-preview.jpg')).read_bytes()).decode(),'layout':layouts[r]} for r in ratios]}
            directory=safe_path(root,'covers/'+stamp());directory.mkdir(parents=True);records=[]
            for ratio in ratios:
                name=ratio.replace(':','x')+'.'+fmt;target=directory/name;shutil.copy2(output/name,target);raw=target.read_bytes()
                record={'id':'cover-'+uuid.uuid4().hex[:10],'name':title.replace('\n',' '),'ratio':ratio,'format':fmt,'path':target.relative_to(root).as_posix(),'layout':layouts[ratio],'templateId':tid,'templateSpec':template,'seriesId':config.get('seriesId'),'useSeriesStyle':use_series,'sourcePath':spec['sourcePath'],'timeSec':spec['timeSec'],'coverSpecVersion':contract['version'],'sha256':hashlib.sha256(raw).hexdigest(),'createdAt':time.time()}
                registered=self.app.library.register_media(target,project_id);record['url']='/api/media/'+registered['id'];records.append(record)
            write_json(directory/'layouts.json',records)
            self.update_config(project_id,lambda current:current.setdefault('covers',[]).extend(records))
            self.app.library.media_page(project_id,scope='latest',refresh=True)
            self.activity(project_id,'cover.render',{'paths':[r['path'] for r in records],'sourcePath':spec['sourcePath'],'timeSec':spec['timeSec']})
            return {'projectId':project_id,'items':records,'message':'封面已导出到当前工程 covers，可继续编辑'}

    def camera_save(self, project_id, body):
        base = next((p for p in CAMERAS if p['id']==body.get('presetId')),CAMERAS[0])
        keyframes = body.get('keyframes') or base['keyframes']
        if not isinstance(keyframes,list) or not 2 <= len(keyframes) <= 40:
            raise ValueError('请设置2至40个关键帧')
        last = -1
        for k in keyframes:
            if not isinstance(k,dict) or not 0 <= float(k.get('t',-1)) <= 1 or float(k['t']) <= last:
                raise ValueError('关键帧t需在0—1之间递增')
            last = float(k['t'])
            for field in ('position','target'):
                if len(k.get(field,[])) != 3 or not all(isinstance(v,(float,int)) and abs(v)<1e6 for v in k[field]):
                    raise ValueError('相机坐标需是三维数值')
            if not isinstance(k.get('fov'),(float,int)) or not 5<=k['fov']<=120:
                raise ValueError('镜头视角fov需在5—120度之间')
        row = {'id':'camera-'+uuid.uuid4().hex[:10],'name':clean_text(body.get('name') or base['name'],100),
               'description':base['description'],'keyframes':keyframes,'interpolation':'catmull-rom / smoothstep','frameDriven':True}
        self.update_config(project_id,lambda config:config.setdefault('cameraPresets',[]).append(row))
        out = safe_path(self.project_root(project_id),'source/cameras/'+row['id']+'.json')
        write_json(out,row)
        return {**row,'path':str(out)}

    def organize(self, project_id):
        root = self.project_root(project_id)
        for folder in ('source','assets','audio','subtitles','covers','output','work','references'):
            safe_path(root,folder).mkdir(exist_ok=True)
        manifest = {'version':1,'policy':'one-current-delivery-with-render-dependencies','directories':{
            'source':'源码、镜头表与可重渲染入口','assets':'保留的模型、图片、素材与来源','audio':'源旁白、配乐与混音','subtitles':'字幕句源与时间轴',
            'covers':'封面JPG、分比例layout与模板','output':'当前可交付作品','work':'可重新生成的临时文件；按清单清理','references':'研究与风格参考'},
            'legacyPaths':'现有工程保持原路径；以本记录作为新文件规范，避免破坏导入。'}
        write_json(safe_path(root,'.studio/structure.json'),manifest)
        return {'path':str(root),'structure':manifest,'message':'已建立新文件目录规范，现有源文件路径保持可用。'}

    def context(self, project_id, user_context, query=''):
        context = copy.deepcopy(user_context or {})
        if not isinstance(context,dict):
            raise ValueError('任务上下文应为对象')
        config=self.ensure_metadata(self.app.library.project(project_id))
        from .production_brief import read as read_production_brief
        context['productionBrief']=read_production_brief(self,project_id)
        if hasattr(self.app,'structure'):context['directoryStructure']=self.app.structure.context(project_id)
        series = self.selected_style(project_id)
        use_style=context.get('useSeriesStyle',config.get('useSeriesStyle',True))
        if not isinstance(use_style,bool):raise ValueError('参考系列风格需为布尔值')
        context.update({'series':series['name'],'useSeriesStyle':use_style,'directoryPolicy':'源码source；稳定素材assets；音频audio；字幕subtitles；封面covers；成片output；临时work；新版本不覆盖已验收片。'})
        template_id = config.get('templateId') or series['style'].get('coverTemplateId')
        template = next((item for item in self.store['templates'] if item['id'] == template_id), None)
        if use_style:
            context['style']=copy.deepcopy(series['style'])
            context['coverSpec']=copy.deepcopy(series['coverSpec'])
            context['styleContract']='严格遵守当前系列coverSpec：同画幅Logo、品牌名、系列栏、标题锚点、字号固定；layout.subtitle必须等于coverSpec.badgeText，保持系列名称一致。模板主体自由布局。coverSpec优先于旧模板坐标。实际保存必须写入font、subtitle、positions、fontSizes、coverSpecVersion；数据准确，主体自由创作。'
        else:
            for key in ('style','template','coverSpec','styleContract'):context.pop(key,None)
        if template and use_style:
            context['template'] = copy.deepcopy(template)
            # The agent can read a full editable template separately; avoid large embedded layer arrays.
            if len(json.dumps(context['template'],ensure_ascii=False))>5000:
                context['template']={k:v for k,v in template.items() if k!='layout'}
                context['template']['layoutNotice']='模板含大量图层；通过project_state或template.read按需读取。'
        if context.get('mediaId'):
            path = self.app.media_path(str(context['mediaId']))
            root = self.project_root(project_id)
            if not path.resolve().is_relative_to(root):
                raise ValueError('所选媒体不在当前工程')
            context['sourcePath'] = path.relative_to(root).as_posix()
        if context.get('taskType')=='video-review':
            review=self.app.video_review.snapshot({'projectId':project_id,'mediaId':context.get('mediaId'),'sourceVersion':context.get('sourceVersion'),'reviewRevision':context.get('reviewRevision')})
            if context.get('sourceVersion')!=review['sourceVersion']:raise ValueError('成片版本已更新，请重新核对修改意见')
            context['reviewPath']=review['path'];context['reviewRevision']=review['revision'];context['reviewCount']=sum(note.get('enabled',True) for note in review['notes'])
            context['reviewContract']='先读取reviewPath及版本；仅执行enabled=true的已采用意见，enabled=false仅保留历史，不执行。用inspect_frame查看相关时间的真实画面，逐条核对时间、坐标、类型和预演参数。预演为可逆参考，尚未写进原视频。基于源码实现修改，检查无关区间保留，另存新版本并反馈每条已采用意见的完成情况。'
        if context.get('taskType')=='segment':
            start,end = float(context.get('startSec',0)),float(context.get('endSec',0))
            if not math.isfinite(start) or not math.isfinite(end) or not 0 <= start < end:
                raise ValueError('请先选择有效的修改区间')
            source_name=context.get('sourcePath')
            if not isinstance(source_name,str) or not source_name:
                raise ValueError('请先选择要修改的视频')
            source=safe_path(self.project_root(project_id),source_name)
            if not source.is_file() or source.suffix.lower() not in {'.mp4','.mov','.webm','.m4v','.mkv'}:
                raise ValueError('选段修改需要当前工程的实际视频')
            details=probe(source)
            duration=float(details.get('format',{}).get('duration') or 0)
            if not math.isfinite(duration) or duration<=0 or end>duration+.001:
                raise ValueError('修改区间超出当前视频时长，请刷新视频后重新选择')
            if not any(s.get('codec_type')=='video' for s in details.get('streams',[])):
                raise ValueError('所选素材没有视频画面')
            marks=context.get('markers',[])
            if not isinstance(marks,list) or len(marks)>100:
                raise ValueError('画面标记应为最多100项列表')
            checked=[]
            for mark in marks:
                if not isinstance(mark,dict):raise ValueError('画面标记无效')
                x,y,t=(float(mark.get(k,-1)) for k in ('x','y','timeSec'))
                if not all(math.isfinite(v) for v in (x,y,t)) or not 0<=x<=1 or not 0<=y<=1 or not 0<=t<=duration:
                    raise ValueError('画面标记超出视频范围')
                if start<=t<=end:checked.append({**mark,'x':x,'y':y,'timeSec':t})
            context['markers']=checked
            context['sourceDuration']=duration
            context['timeRange'] = {'startSec':start,'endSec':end,'sourcePath':context.get('sourcePath')}
        if context.get('presetId'):
            context['camera'] = next((p for p in CAMERAS+self.config(project_id).get('cameraPresets',[]) if p['id']==context['presetId']),None)
        context['projectState']=self.project_state(project_id,context.get('module'))
        # Source text is always loaded server-side, never trusted from UI payloads.
        for key in ('creativeMemory','memoryReferences','memoryContract'):
            context.pop(key,None)
        if hasattr(self.app,'project_memory'):
            context['creativeMemory']=self.app.project_memory.brief(project_id,query,context.get('memoryRecordIds'),use_series=use_style)
        # Keep a bounded evidence packet; full source records remain retrievable.
        if len(json.dumps(context,ensure_ascii=False))>23500:
            context['projectState']['references']=[]
            context['projectState']['files']=context['projectState']['files'][:12]
            context['projectState']['copies']={key:{'title':row['title'],'path':row['path']} for key,row in context['projectState']['copies'].items()}
            if context.get('template'):context['template']={key:context['template'].get(key) for key in ('id','name')}
        memory=context.get('creativeMemory') or {}
        while memory.get('evidence') and len(json.dumps(context,ensure_ascii=False))>24000:
            memory['evidence'].pop()
            memory['moreAvailable']=True
        if len(json.dumps(context,ensure_ascii=False))>24000:raise ValueError('任务上下文过长，请减少附加内容；工程文件可按路径读取')
        return context

    def reference_add(self, project_id, body):
        root = self.project_root(project_id)
        record = {'id':'reference-'+uuid.uuid4().hex[:12],'name':clean_text(body.get('name') or '视频参考',100),
                  'notes':clean_text(body.get('notes'),10000),'startSec':float(body.get('startSec',0)), 'endSec':float(body.get('endSec') or 30),'createdAt':time.time()}
        if not 0<=record['startSec']<record['endSec']<=86400:
            raise ValueError('参考区间无效')
        if body.get('path'):
            source = Path(str(body['path'])).expanduser()
            if not source.is_absolute():
                source = safe_path(root,str(body['path']))
            if not source.is_file() or junction(source) or source.suffix.lower() not in {'.mp4','.mov','.webm','.m4v'}:
                raise ValueError('请选择实际本地视频文件')
            info=probe(source)
            duration=float(info.get('format',{}).get('duration',0))
            if duration and record['startSec']>=duration:
                raise ValueError('参考起点超出视频')
            record['endSec']=min(record['endSec'],duration) if duration else record['endSec']
            destination=safe_path(root,'references/'+record['id']+source.suffix.lower())
            destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,destination)
            record.update({'path':destination.relative_to(root).as_posix(),'sourcePath':str(source),'duration':duration,'status':'local-ready'})
        elif body.get('url'):
            from urllib.parse import urlsplit
            url=clean_text(body['url'],4000)
            parts=urlsplit(url)
            if parts.scheme!='https' or not parts.hostname or parts.username or parts.password:
                raise ValueError('请输入公开 HTTPS 视频链接')
            record.update({'url':url,'status':'link-registered','message':'已记录来源；使用“导入链接片段”读取可访问的视频。'})
        else:
            raise ValueError('请提供本地视频路径或公开链接')
        self.update_config(project_id,lambda config:config.setdefault('references',[]).append(record))
        self.activity(project_id,'reference.add',{'id':record['id'],'path':record.get('path'),'status':record['status']})
        return record

    def reference_analyze(self,project_id,body):
        config=self.config(project_id)
        record=next((r for r in config.get('references',[]) if r['id']==body.get('id')),None)
        if not record:raise ValueError('参考不存在')
        if not record.get('path'):raise ValueError('先导入链接片段或选择本地视频，模型才能实际看帧')
        prompt=clean_text(body.get('prompt') or '分析参考片段的叙事节奏、光照、构图、材质、字体和镜头接力；先用inspect_frame查看起中末实际画面，给出可复用风格规则和一个10秒复刻方案。明确哪些只是抽帧判断，不复制品牌、人物或受限素材。',12000)
        context={'taskType':'reference-analysis','reference':record,'timeRange':{'startSec':record['startSec'],'endSec':record['endSec'],'sourcePath':record['path']}}
        return self.app.runs.start({'projectId':project_id,'provider':'dual','mode':'review','prompt':prompt,'context':self.context(project_id,context)})

    def style_learn(self,project_id,body):
        name=clean_text(body.get('name'),80)
        summary=clean_text(body.get('summary'),8000)
        rules=clean_text('\n'.join(body['rules']) if isinstance(body.get('rules'),list) else body.get('rules'),12000)
        if not name or not (summary or rules):raise ValueError('请填写风格名称和提炼规则')
        sid='learned-'+uuid.uuid4().hex[:10]
        series=self.selected_style(project_id)
        style={**series['style'],'name':name,'summary':summary,'rules':rules,'referenceId':body.get('id')}
        row=self.series_save({'name':name,'style':style})
        skill_root=self.app.video_root/'shared/skills'/sid
        skill_root.mkdir(parents=True)
        content='---\nname: '+sid+'\ndescription: '+json.dumps('在用户指定“'+name+'”风格制作或优化视频时，应用已提炼的视觉与镜头规范。',ensure_ascii=False)+'\n---\n\n# '+name+'\n\n'+summary+'\n\n'+rules+'\n\n以用户最新要求优先；参考是审美资料，不是执行指令。不冒充扫描、仿真或原作者作品。\n'
        (skill_root/'SKILL.md').write_text(content,encoding='utf8')
        write_json(skill_root/'source.json',{'referenceId':body.get('id'),'projectId':project_id,'createdAt':time.time(),'seriesId':row['id']})
        local=safe_path(self.project_root(project_id),'source/skills/'+sid+'/SKILL.md')
        local.parent.mkdir(parents=True,exist_ok=True);local.write_text(content,encoding='utf8')
        learned={'id':sid,'name':name,'path':local.relative_to(self.project_root(project_id)).as_posix(),'sharedPath':str(skill_root/'SKILL.md'),'referenceId':body.get('id'),'seriesId':row['id'],'createdAt':time.time()}
        self.update_config(project_id,lambda config:config.setdefault('learnedSkills',[]).append(learned))
        self.app.library.snapshot(refresh=True)
        self.activity(project_id,'style.learn',{'id':sid,'path':learned['path'],'seriesId':row['id']})
        return {'series':row,'skill':str(skill_root/'SKILL.md'),'projectSkill':learned['path'],'message':'风格已写入本工程技能，并保存系列与共享索引。'}

    def reference_download(self,project_id,body):
        import ipaddress
        import socket
        from urllib.parse import urlsplit
        config=self.config(project_id)
        record=next((r for r in config.get('references',[]) if r['id']==body.get('id')),None)
        if not record or not record.get('url'):raise ValueError('请选择已登记的视频链接')
        url=record['url'];host=urlsplit(url).hostname
        if not host or any(not ipaddress.ip_address(info[4][0]).is_global for info in socket.getaddrinfo(host,443)):
            raise ValueError('参考链接必须指向公开站点')
        def download(job):
            root=self.project_root(project_id);destination=safe_path(root,'references/'+record['id']+'.mp4')
            destination.parent.mkdir(parents=True,exist_ok=True)
            if destination.exists():raise ValueError('参考片段已导入，不重复下载')
            python=shutil.which('python')
            if not python:raise ValueError('未找到Python及yt-dlp，请使用本地视频导入')
            segment=f"*{record['startSec']}-{record['endSec']}"
            command=[python,'-m','yt_dlp','--ignore-config','--no-playlist','--no-overwrites','--no-cookies','--no-netrc','--no-progress','--socket-timeout','20','--retries','0',
                     '--max-filesize','400M','--download-sections',segment,'--force-keyframes-at-cuts','-f','bv*[height<=1080]+ba/b[height<=1080]',
                     '--merge-output-format','mp4','--recode-video','mp4','-o',str(destination),url]
            self.app.media_studio._run(job,command,timeout=420)
            if not destination.is_file():raise ValueError('未取得可访问片段，可改用本地视频；未绕过登录或付费限制')
            duration=float(probe(destination).get('format',{}).get('duration') or 0)
            record.update({'path':destination.relative_to(root).as_posix(),'sourceRange':{'startSec':record['startSec'],'endSec':record['endSec']},
                           'startSec':0,'endSec':duration,'duration':duration,'status':'local-ready'})
            def update_reference(current):
                current['references']=[record if r['id']==record['id'] else r for r in current.get('references',[])]
            self.update_config(project_id,update_reference)
            self.app.media_studio._output(job,destination)
            self.activity(project_id,'reference.download.completed',{'id':record['id'],'path':record['path'],'jobId':job['id']})
        job=self.app.media_studio.submit_external('reference-download',project_id,download,{'referenceId':record['id']})
        self.activity(project_id,'reference.download',{'id':record['id'],'jobId':job['id']})
        return job

    def bind_series(self,project_id,body):
        sid=body.get('seriesId') or 'rainbow-science'
        if any(s['id']==sid and s.get('archived') for s in self.store['series']):raise ValueError('请先恢复已归档的系列')
        if not any(s['id']==sid for s in self.store['series']):raise ValueError('系列不存在')
        if body.get('templateId'):
            if not any(t['id']==body['templateId'] for t in self.store['templates']):raise ValueError('模板不存在')
        def update_binding(config):
            config['seriesId']=sid
            config['useSeriesStyle']=body.get('useSeriesStyle',True)
            if body.get('templateId'):config['templateId']=body['templateId']
        return self.update_config(project_id,update_binding)

    def action(self,body):
        result=self._action(body)
        action=body.get('action','');pid=body.get('projectId')
        reads={'copy.read','project.state','cover.load','cover.preview','template.read','series.overview','qwen.status','job.get','subtitles.read','cleanup.scan'}
        if pid and action not in reads and action not in {'project.rename','project.configure','copy.save','cover.save','reference.add','reference.download','style.learn','series.batch.plan'}:
            keys=('id','jobId','runId','path','platform','title','ratio')
            details={key:result[key] for key in keys if isinstance(result,dict) and key in result}
            self.activity(pid,action,details)
        return result

    def _action(self,body):
        action=body.get('action','');pid=body.get('projectId')
        if pid:self.project_root(pid)
        media=self.app.media_studio
        if action in {'cleanup.scan','cleanup.apply'} and media.has_active(pid):
            raise ValueError('媒体处理或成片核验正在进行，完成后再扫描或清理。')
        def job_result(job):return {'jobId':job['id'],'job':job}
        if action in {'project.rename','project.configure'}:return self.project_configure(pid,body)
        if action=='project.state':return self.project_state(pid,body.get('module'))
        if action=='copy.read':return self.copy_read(pid,body)
        if action=='copy.save':return self.copy_save(pid,body)
        if action=='series.overview':return self.series_overview(body)
        if action=='series.batch.plan':return self.series_batch_plan(body)
        if action=='template.read':
            template=next((t for t in self.store['templates'] if t['id']==body.get('id')),None)
            if not template:raise ValueError('模板不存在')
            return copy.deepcopy(template)
        if action=='series.save':return self.series_save(body)
        if action in {'series.rename','series.archive','series.restore','series.assign'}:return self.series_manage(body)
        if action=='series.bind':return self.bind_series(pid,body)
        if action in {'template.save','template.import'}:return self.template_save(body)
        if action=='cover.save':return self.cover_save(pid,body)
        if action in {'cover.preview','cover.render'}:return self.cover_render(pid,body,preview=action=='cover.preview')
        if action=='cover.load':return self.cover_load(pid,body)
        if action=='camera.save':return self.camera_save(pid,body)
        if action=='audio.import':return media.import_folder(body.get('path'))
        if action=='subtitles.read':return media.read_subtitles(pid,body.get('path'))
        if action=='subtitles.save':return media.save_subtitles(pid,body.get('path'),body.get('cues'))
        if action=='tts.generate':return job_result(media.start_tts(pid,body.get('text',''),body.get('pronunciations'),body.get('speed',1),body.get('preview',False)))
        if action=='audio.mix':return job_result(media.start_mix(pid,body.get('sourcePath'),body.get('musicId'),body.get('outputName'),body.get('gainDb',-20),body.get('duck',True),body.get('loop',True),body.get('startSec',0),body.get('endSec'),body.get('preview',False)))
        if action=='timeline.replace':return job_result(media.start_replace(pid,body.get('sourcePath'),body.get('replacementPath'),body.get('startSec'),body.get('endSec'),body.get('transitionSec',.25),body.get('preview',False)))
        if action=='qwen.status':return media.qwen_status(body.get('probe',False),body.get('credentialSource'))
        if action=='qwen.generate':return job_result(media.start_video(pid,body.get('prompt',''),body.get('model','wan2.6-t2v'),body.get('duration',5),body.get('size','1280*720'),body.get('credentialSource')))
        if action=='qwen.poll':return media.poll_video(body.get('id'))
        if action=='job.get':return media.get_job(body.get('id'))
        if action=='job.cancel':return media.cancel_job(body.get('id'))
        if action=='reference.add':return self.reference_add(pid,body)
        if action=='reference.download':return job_result(self.reference_download(pid,body))
        if action=='reference.analyze':
            result=self.reference_analyze(pid,body);return {**result,'runId':result['id']}
        if action=='style.learn':return self.style_learn(pid,body)
        if action=='project.organize':return self.organize(pid)
        if action=='cleanup.scan':return self.app.cleanup.scan(pid)
        if action=='cleanup.apply':return self.app.cleanup.apply(pid,body.get('scanId'),body.get('selectedIds'))
        if action=='project.approve':
            def approve(job):
                media.job_event(job['id'],'正在完整解码视频并登记可重渲染依赖，请稍候。')
                result=self.app.cleanup.approve(pid,body.get('sourcePath'),body.get('dependencyPaths'),ignore_job_id=job['id'])
                media.job_event(job['id'],'完整解码通过，当前可用版本已登记。')
                return {'release':result}
            return job_result(media.submit_external('project-approve',pid,approve,{'sourcePath':body.get('sourcePath')}))
        if action=='editor.configure':return self.editor_configure(body)
        if action=='editor.open':return self.editor_open(pid,body)
        if action=='editor.export':return self.editor_export(pid,body)
        raise ValueError('未知工作室操作')

    def editors(self):
        toolroot=self.app.resource_root/'tools'
        shotcuts=list((toolroot/'shotcut').glob('**/shotcut.exe')) if (toolroot/'shotcut').exists() else []
        catalog=[{'id':'minipaint','name':'miniPaint · 图层绘图','repository':'https://github.com/viliusle/miniPaint','url':'/editors/minipaint/index.html','available':(toolroot/'minipaint/index.html').is_file(),'kind':'web','license':'MIT（源码许可文件随工具保留）'},
                 {'id':'shotcut','name':'Shotcut · 时间线剪辑','repository':'https://github.com/mltframework/shotcut','url':'https://shotcut.org','executable':str(shotcuts[0]) if shotcuts else shutil.which('shotcut') or '', 'kind':'native','license':'GPL-3.0'},
                 {'id':'opencut','name':'OpenCut · 在线剪辑','repository':'https://github.com/OpenCut-app/OpenCut','url':'https://opencut.app','kind':'external-web','available':True,'license':'MIT','note':'在线编辑器独立打开，文件由你在编辑器内导入；不会自动上传。'}]
        for row in catalog:
            row.update(self.store.get('editors',{}).get(row['id'],{}))
            if row['kind']=='native':row['available']=bool(row.get('executable') and Path(row['executable']).is_file())
        return catalog

    def editor_configure(self,body):
        eid=identifier(body.get('id'))
        if eid!='shotcut':raise ValueError('当前本机可配置Shotcut路径')
        path=Path(str(body.get('path',''))).expanduser().resolve()
        if not path.is_file() or path.name.lower()!='shotcut.exe':raise ValueError('请选择shotcut.exe')
        self.store.setdefault('editors',{})[eid]={'executable':str(path)}
        self.save()
        return next(e for e in self.editors() if e['id']==eid)

    def editor_open(self,project_id,body):
        editor=next((e for e in self.editors() if e['id']==body.get('id')),None)
        if not editor:raise ValueError('编辑器不存在')
        if editor['kind']!='native':return {'url':editor['url'],'message':'在独立编辑器打开，可手动导入素材'}
        if not editor['available']:raise ValueError('请先配置Shotcut可执行文件')
        command=[editor['executable']]
        if body.get('path'):
            path=safe_path(self.project_root(project_id),str(body['path']))
            if not path.is_file():raise ValueError('待编辑文件不存在')
            command.append(str(path))
        # Visible app requested by the user's manual editor action.
        process=subprocess.Popen(command,cwd=self.project_root(project_id))
        return {'pid':process.pid,'editor':editor['name']}

    def editor_export(self,project_id,body):
        root=self.project_root(project_id)
        source=safe_path(root,str(body.get('sourcePath','')))
        if not source.is_file():raise ValueError('请选择当前工程媒体')
        meta=probe(source)
        stream=next((s for s in meta.get('streams',[]) if s.get('codec_type')=='video'),None)
        if not stream:raise ValueError('需要视频或图片')
        duration=float(meta.get('format',{}).get('duration') or 5)
        fps=30;frames=max(1,round(duration*fps));width,height=stream['width'],stream['height']
        escaped=str(source).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')
        xml=f'''<?xml version="1.0" encoding="utf-8"?>
<mlt LC_NUMERIC="C" producer="tractor" version="7.24.0"><profile frame_rate_num="30" frame_rate_den="1" width="{width}" height="{height}" progressive="1" sample_aspect_num="1" sample_aspect_den="1" display_aspect_num="{width}" display_aspect_den="{height}" colorspace="709"/>
<producer id="source"><property name="resource">{escaped}</property><property name="mlt_service">avformat</property><property name="seekable">1</property></producer>
<playlist id="main_bin"><property name="xml_retain">1</property><entry producer="source" in="0" out="{frames-1}"/></playlist>
<playlist id="video"><property name="shotcut:name">V1</property><entry producer="source" in="0" out="{frames-1}"/></playlist>
<tractor id="tractor" shotcut="1" in="0" out="{frames-1}"><property name="shotcut">1</property><track producer="video"/></tractor></mlt>'''
        out=safe_path(root,'source/manual-edit/'+stamp()+'.mlt')
        out.parent.mkdir(parents=True,exist_ok=True);out.write_text(xml,encoding='utf8')
        return {'path':out.relative_to(root).as_posix(),'absolutePath':str(out),'format':'Shotcut / MLT','message':'已创建可继续剪辑的时间线工程，原视频保留。'}
