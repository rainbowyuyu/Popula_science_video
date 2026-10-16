"""Project display names, fixed series cover contracts and compact module state."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import re
import time
import uuid

from .harness import safe_path, redact
from .local_paths import LOGO_ROOT

PLATFORMS = {'douyin':'抖音','xiaohongshu':'小红书','bilibili':'哔哩哔哩','wechat':'微信视频号'}
SCIENCE = 'rainbow-science'
AI = 'ai-evolution'
INDEPENDENT = 'independent'
FEATURE_DEFAULTS = {'creative': True, 'covers': True, 'audio': True, 'camera': True, 'subtitles': True}

def project_features(value=None):
    value=value if isinstance(value,dict) else {}
    return {key:(value[key] if isinstance(value.get(key),bool) else default) for key,default in FEATURE_DEFAULTS.items()} | {'creative':True}
# Episode numbers are the local catalogue order, not claims about publication dates.
PROJECT_NAMES = {
    'topology_optimization':('拓扑优化：材料该留在哪里',SCIENCE,1),
    'rainbow_arc_2026':('彩虹为什么是弧形',SCIENCE,2),
    'episode3':('榫卯：一座亭子怎样拼起来',SCIENCE,3),
    'glp1_nobel_2026':('科学减重：从身体调节说起',SCIENCE,4),
    'dna_storage_algorithms':('DNA存储：把文件写进分子',SCIENCE,5),
    'cryptography_key_exchange':('密码学：公开传话怎样保密',SCIENCE,6),
    'c_pointers':('C语言指针：地址里藏着什么',SCIENCE,7),
    'llm_hallucination':('大模型为什么会一本正经地胡说',SCIENCE,8),
    'nobel_chemistry_2026':('诺贝尔化学奖专题',SCIENCE,9),
    'nobel_physics_2026':('诺贝尔物理学奖专题',SCIENCE,10),
    'shanghai_tower':('上海中心：高楼怎样站稳',SCIENCE,11),
    'ai_evolution_trailer':('看见人工智能的进化',AI,0),
    'ai_evolution_ch01_vision_choice':('视觉与选择',AI,1),
    'ai_evolution_ch02_creation':('从识别走向创造',AI,2),
    'ai_evolution_ch03_language':('语言与理解',AI,3),
    'ai_evolution_ch04_space_time':('空间与时间',AI,4),
    'ai_evolution_ch05_reasoning_agents':('推理与智能体',AI,5),
    'publication_2026-09-23':('AI进化 · 封面与发布资料',AI,None),
    'ai_engineer_science':('AI工程师 · 科研演示素材',INDEPENDENT,None),
    'beso_ai_research_2026':('AI工程师 · 研究与产品演示',INDEPENDENT,None),
    'cs2_c4':('CS2 · C4爆炸与冲击波',INDEPENDENT,None),
    'math_demos':('数学演示 · 平方根的直观理解',INDEPENDENT,None),
    'zhiwo':('知我 · 视觉叙事',INDEPENDENT,None),
    'zju_marine_ep01':('浙江大学 · 海洋可再生能源',INDEPENDENT,None),
}


def cover_spec(font='Microsoft YaHei', badge_text='每天5分钟科普'):
    ratios={}
    definitions={
        '16:9':((1920,1080),(.055,.31,.73),(.055,.205),150,52),
        '3:4':((1440,1920),(.07,.27,.86),(.07,.18),136,52),
        '4:3':((1920,1440),(.055,.29,.78),(.055,.19),152,56),
        '9:16':((1080,1920),(.075,.27,.85),(.075,.19),108,44),
        '1:1':((1600,1600),(.065,.29,.82),(.065,.19),142,52),
    }
    for ratio,(size,title,badge,ts,bs) in definitions.items():
        w,h=size;short=min(size)
        ratios[ratio]={'size':list(size),'safeArea':.045,
            'logo':{'x':.045,'y':.035,'width':round(short*.067/w,5),'height':round(short*.067/h,5)},
            'brand':{'x':round(.045+short*.083/w,5),'y':.035,'fontSize':round(short*.033)},
            'badge':{'x':badge[0],'y':badge[1],'height':round(bs*1.65/h,5),'fontSize':bs,'textColor':'#ffffff','maxWidth':.88},
            'titleAnchor':{'x':title[0],'y':title[1],'maxWidth':title[2],'fontSize':ts,'lineHeight':1.22,'maxLines':3}}
    return {'version':1,'strict':True,'font':font,'brandText':'rainbow鱼','badgeText':badge_text,
        'logoAsset':str(LOGO_ROOT),'ratios':ratios,
        'locked':['font','logo','brand','badge','titleAnchor'],'subjectFreedom':'主体、视角、材质、景深和构图可自由设计；避开品牌、标题、系列栏保留区。',
        'rules':['使用原始图片Logo，左上角与rainbow鱼并排。','系列栏颜色底白字；文字少而清晰。','同系列同画幅固定品牌、系列栏、标题锚点和字号。','四种比例各自构图，不直接裁切；不得遮挡核心机制。']}


def inferred_metadata(project):
    folder=Path(project['path']).name
    title,sid,episode=PROJECT_NAMES.get(folder,(str(project.get('name') or folder),INDEPENDENT,None))
    if folder not in PROJECT_NAMES and not re.search(r'[\u4e00-\u9fff]',title):
        title='独立工程 · '+title.replace('_',' ').replace('-',' ')
    return {'metadataVersion':1,'title':title,'episode':episode,'seriesId':sid,'useSeriesStyle':sid!=INDEPENDENT}


def display_name(config):
    title=config['title'];episode=config.get('episode')
    return f'E{episode:02d} · {title}' if episode is not None else title


class CatalogMixin:
    def init_catalog(self):
        self._config_cache={}
        changed=False
        if not any(t.get('id')=='rainbow-editorial' for t in self.store.get('templates',[])):
            self.store.setdefault('templates',[]).append({'id':'rainbow-editorial','name':'留白排版 · 上文下图','style':{'font':'Microsoft YaHei','accent':'#365d79','background':'#f6f3ec'},'layout':{'presentation':'split'}})
            changed=True
        existing={s['id'] for s in self.store.get('series',[])}
        for sid,name in ((AI,'AI进化'),(INDEPENDENT,'独立工程')):
            if sid not in existing:
                base=copy.deepcopy(self.store['series'][0]['style'])
                base.update({'name':name,'coverTemplateId':'rainbow-clean'})
                self.store['series'].append({'id':sid,'name':name,'style':base});changed=True
        for series in self.store['series']:
            if not isinstance(series.get('coverSpec'),dict):
                series['coverSpec']=cover_spec(series.get('style',{}).get('font','Microsoft YaHei'),series['name']);changed=True
        if changed:self.save()

    def ensure_metadata(self,project):
        pid=project['id'];config=self.config(pid)
        if config.get('metadataVersion')==1:return config
        inferred=inferred_metadata(project)
        def migrate(current):
            if current.get('metadataVersion')==1:return
            # Keep explicitly chosen custom series and titles from previous versions.
            if current.get('seriesId') not in {None,SCIENCE}:
                inferred['seriesId']=current['seriesId']
                inferred['useSeriesStyle']=current['seriesId']!=INDEPENDENT
            for key,value in inferred.items():
                if key in {'seriesId','metadataVersion'} or key not in current:current[key]=value
            current['displayName']=display_name(current)
        result=self.update_config(pid,migrate)
        self.activity(pid,'project.metadata.migrate',{'title':result['title'],'seriesId':result['seriesId']})
        return result

    def decorate_projects(self,projects):
        result=[];names={s['id']:s['name'] for s in self.store['series']}
        for project in projects:
            config=self.ensure_metadata(project)
            result.append({**project,**{key:copy.deepcopy(config.get(key)) for key in ('title','episode','seriesId','useSeriesStyle')},
                'displayName':display_name(config),'seriesName':names.get(config.get('seriesId'),'独立工程'),
                'features':project_features(config.get('features'))})
        return result

    def activity(self,pid,action,details=None):
        if not pid:return
        row={'at':time.time(),'action':action,'details':details or {}}
        encoded=redact(json.dumps(row,ensure_ascii=False,separators=(',',':')))
        if len(encoded)>6000:row['details']={'summary':str(details)[:800]};encoded=redact(json.dumps(row,ensure_ascii=False))
        with self.lock:
            target=safe_path(self.project_root(pid),'.studio/activity.jsonl')
            target.parent.mkdir(parents=True,exist_ok=True)
            with target.open('a',encoding='utf8') as stream:stream.write(encoded+'\n')

    def project_configure(self,pid,body):
        project=self.app.library.project(pid);self.ensure_metadata(project)
        changes={}
        if 'title' in body or 'name' in body:
            value=str(body.get('title',body.get('name',''))).strip()
            if not value or len(value)>100 or redact(value)!=value:raise ValueError('工程标题需为1—100字且不包含凭据')
            changes['title']=value
        if 'seriesId' in body:
            sid=body['seriesId'] or INDEPENDENT
            if sid not in {s['id'] for s in self.store['series']}:raise ValueError('系列不存在')
            if sid!=self.config(pid).get('seriesId') and any(s['id']==sid and s.get('archived') for s in self.store['series']):raise ValueError('请先恢复已归档的系列')
            changes['seriesId']=sid
        if 'features' in body:
            values=body['features']
            if not isinstance(values,dict) or set(values)-set(FEATURE_DEFAULTS) or any(not isinstance(v,bool) for v in values.values()):raise ValueError('功能配置需为covers/audio/camera/subtitles的布尔值')
            if values.get('creative') is False:raise ValueError('主创作功能始终保留')
            changes['features']=project_features({**self.config(pid).get('features',{}),**values})
        if 'episode' in body:
            value=body['episode']
            if value in ('',None):value=None
            elif isinstance(value,bool) or not isinstance(value,int) or not 0<=value<=999:raise ValueError('集数需为0—999的整数，独立工程可留空')
            changes['episode']=value
        if 'useSeriesStyle' in body:
            if not isinstance(body['useSeriesStyle'],bool):raise ValueError('参考系列风格需要布尔值')
            changes['useSeriesStyle']=body['useSeriesStyle']
        if 'templateId' in body:
            tid=body['templateId']
            if tid and tid not in {t['id'] for t in self.store['templates']}:raise ValueError('模板不存在')
            changes['templateId']=tid
        def update(current):current.update(changes);current['displayName']=display_name(current)
        config=self.update_config(pid,update)
        self.activity(pid,'project.configure',changes)
        return {**config,'project':self.decorate_projects([project])[0]}

    def copy_read(self,pid,body=None):
        body=body or {};selected=body.get('platform')
        if selected and selected not in PLATFORMS:raise ValueError('发布平台无效')
        rows={};root=self.project_root(pid)
        for platform in ([selected] if selected else PLATFORMS):
            path=safe_path(root,'source/publish/'+platform+'.json')
            if not path.is_file() or path.stat().st_size>100000:continue
            try:data=json.loads(path.read_text(encoding='utf8'))
            except (ValueError,OSError):continue
            if isinstance(data,dict):rows[platform]={**data,'path':path.relative_to(root).as_posix()}
        return {'platforms':rows,'files':[row['path'] for row in rows.values()]}

    def copy_save(self,pid,body):
        platform=body.get('platform')
        if platform not in PLATFORMS:raise ValueError('发布平台无效')
        title=str(body.get('title','')).strip();text=str(body.get('body','')).strip();tags=body.get('tags',[])
        if not title or len(title)>150 or len(text)>20000:raise ValueError('标题需1—150字，正文最多20000字')
        if not isinstance(tags,list) or len(tags)>30 or any(not isinstance(tag,str) or len(tag)>60 for tag in tags):raise ValueError('标签需为最多30项文字列表')
        tags=[tag.strip().lstrip('#') for tag in tags if tag.strip().lstrip('#')]
        row={'platform':platform,'title':title,'body':text,'tags':tags,'updatedAt':time.time()}
        if redact(json.dumps(row,ensure_ascii=False))!=json.dumps(row,ensure_ascii=False):raise ValueError('文案包含疑似凭据')
        from .studio import write_json
        with self.lock:
            path=safe_path(self.project_root(pid),'source/publish/'+platform+'.json')
            write_json(path,row)
            markdown=safe_path(self.project_root(pid),'source/publish/'+platform+'.md')
            markdown.write_text('# '+title+'\n\n'+text+'\n\n'+' '.join('#'+t for t in tags)+'\n',encoding='utf8')
            row['path']=path.relative_to(self.project_root(pid)).as_posix()
            self.activity(pid,'copy.save',{'platform':platform,'path':row['path'],'title':title})
        return row

    def project_state(self,pid,module=None):
        project=self.decorate_projects([self.app.library.project(pid)])[0];config=self.config(pid);root=self.project_root(pid)
        files=[]
        def add(relative,kind,excerpt=0):
            try:
                path=safe_path(root,relative)
                if not path.is_file():return
                row={'path':relative,'kind':kind,'bytes':path.stat().st_size}
                if excerpt and row['bytes']<1_000_000:row['excerpt']=redact(path.read_text(encoding='utf8',errors='replace')[:excerpt])
                files.append(row)
            except (OSError,ValueError):return
        for relative in ('README.md','project.json','package.json','.studio/project.json','.studio/activity.jsonl'):
            add(relative,'project',350 if relative=='README.md' else 0)
        copies=self.copy_read(pid)['platforms'];copy_summary={}
        for name,row in copies.items():
            add(row['path'],'copy');copy_summary[name]={key:row.get(key) for key in ('title','tags','path','updatedAt')}
            copy_summary[name]['excerpt']=str(row.get('body',''))[:250]
        cameras=config.get('cameraPresets',[])[-3:]
        for camera in cameras:add('source/cameras/'+camera['id']+'.json','camera')
        for skill in config.get('learnedSkills',[])[-4:]:
            if skill.get('path'):add(skill['path'],'learned-skill',500)
        references=[{k:(r.get(k)[:800] if isinstance(r.get(k),str) else r.get(k)) for k in ('id','name','path','url','startSec','endSec','status')} for r in config.get('references',[])[-4:]]
        for ref in references:
            if ref.get('path'):add(ref['path'],'reference')
        # Local media index supplies concrete files without probing entire videos.
        media=self.app.library.media_page(pid,scope='latest')['items'] if hasattr(self.app.library,'media_page') else self.app.library.media(pid)
        videos=sorted((m for m in media if m.get('kind')=='video'),key=lambda m:m.get('modified',0),reverse=True)[:3]
        sources=[]
        for video in videos:
            raw=video.get('relativePath')
            if not raw:
                try:raw=Path(video['path']).relative_to(root).as_posix()
                except (KeyError,ValueError):continue
            add(raw,'video');sources.append({'path':raw,'name':video.get('name'),'bytes':video.get('size',video.get('bytes'))})
        cover=next(iter(reversed(config.get('covers',[]))),None)
        cover_summary={k:cover.get(k) for k in ('id','path','ratio','name','createdAt')} if cover else None
        if cover:add(cover['path'],'cover')
        # Older publishing notes remain discoverable without copying their full history.
        for folder in ('publish','delivery','source',''):
            directory=root/folder
            if not directory.is_dir():continue
            for candidate in sorted(directory.glob('*.md'))[:60]:
                if any(word in candidate.name.lower() for word in ('发布','文案','copy','publishing')):add(candidate.relative_to(root).as_posix(),'legacy-copy')
                if len(files)>=28:break
        jobs=[];media_studio=getattr(self.app,'media_studio',None)
        if media_studio:
            for job in media_studio.list_jobs():
                if job.get('projectId')!=pid:continue
                row={key:job.get(key) for key in ('id','kind','status','message')}
                output=job.get('output') or {}
                row['outputPath']=output.get('relativePath');jobs.append(row)
                if row['outputPath']:add(row['outputPath'],'module-output')
                if len(jobs)>=6:break
        if module=='audio':
            for candidate in sorted((root/'subtitles').glob('*'))[:12]:
                if candidate.suffix.lower() in {'.srt','.vtt','.json'}:add(candidate.relative_to(root).as_posix(),'subtitles')
        return {'project':{key:project.get(key) for key in ('id','displayName','title','episode','seriesId','seriesName','useSeriesStyle')},
            'module':module or 'project','files':files[:28],'copies':copy_summary,'cameras':[{'id':c['id'],'name':c.get('name')} for c in cameras],
            'references':references,'sourceVideos':sources,'latestCover':cover_summary,'jobs':jobs,'activityPath':'.studio/activity.jsonl'}

    def series_overview(self,body):
        sid=body.get('seriesId') or SCIENCE
        series=next((s for s in self.store['series'] if s['id']==sid),None)
        if not series:raise ValueError('系列不存在')
        try:snapshot=self.app.library.snapshot(lightweight=True)
        except TypeError:snapshot=self.app.library.snapshot()
        projects=self.decorate_projects(snapshot['projects']);items=[]
        for project in projects:
            if project['seriesId']!=sid:continue
            config=self.config(project['id']);cover=next(iter(reversed(config.get('covers',[]))),None)
            copies=self.copy_read(project['id'])['platforms']
            row={**project,'latestCover':{k:cover.get(k) for k in ('id','path','ratio','name','createdAt')} if cover else None,
                'copies':{key:{**{field:value.get(field) for field in ('title','tags','path','updatedAt')},'excerpt':str(value.get('body',''))[:300]} for key,value in copies.items()}}
            items.append(row)
        items.sort(key=lambda p:(p['episode'] is None,p['episode'] or 0,p['title']))
        return {'series':copy.deepcopy(series),'projects':items}

    def series_batch_plan(self,body):
        overview=self.series_overview(body);selection=body.get('projectIds')
        if selection is not None and (not isinstance(selection,list) or any(not isinstance(p,str) for p in selection)):raise ValueError('工程选择需为ID列表')
        projects=overview['projects'];allowed={p['id'] for p in projects}
        if selection is not None and (not selection or set(selection)-allowed):raise ValueError('批次必须选择该系列中已有工程')
        if selection is not None:projects=[p for p in projects if p['id'] in selection]
        kind=body.get('taskType','cover-copy')
        if kind not in {'cover','copy','cover-copy'}:raise ValueError('批次仅支持封面、文案或两者')
        ident='batch-'+uuid.uuid4().hex[:12]
        items=[{'projectId':p['id'],'displayName':p['displayName'],'context':self.context(p['id'],{'module':'cover' if kind=='cover' else 'copy' if kind=='copy' else 'publish','taskType':kind})} for p in projects]
        plan={'id':ident,'status':'planned','taskType':kind,'seriesId':overview['series']['id'],'projectIds':[p['id'] for p in projects],
            'items':items,'paidCalls':0,'createdAt':time.time(),'requiresExecution':True}
        from .studio import write_json
        path=self.root/'batches'/f'{ident}.json';write_json(path,plan)
        for project in projects:self.activity(project['id'],'series.batch.plan',{'id':ident,'taskType':kind})
        return {**plan,'path':str(path)}
