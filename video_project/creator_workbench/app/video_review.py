"""Version-scoped review annotations and reversible live-preview instructions."""
from __future__ import annotations
import hashlib, json, math, threading, time
from pathlib import Path
from .harness import safe_path
from .studio import write_json, read_json, clean_text

TARGET_MODULES={'creative','covers','audio','camera','subtitles'}

class ReviewConflict(ValueError):
    status_code=409
    code='review_conflict'

class VideoReview:
    def __init__(self,app):self.app=app;self.lock=threading.RLock()
    def source(self,body):
        pid=str(body.get('projectId',''));root=Path(self.app.library.project(pid)['path']).resolve()
        media_id=str(body.get('mediaId',''));source=self.app.media_path(media_id)
        if not source.resolve().is_relative_to(root) or source.suffix.lower() not in {'.mp4','.mov','.webm','.m4v'}:raise ValueError('请选择当前工程中的视频')
        stat=source.stat();relative=source.relative_to(root).as_posix()
        version=hashlib.sha256(f'{relative}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest()[:24]
        path=safe_path(root,'.studio/reviews/'+version+'.json')
        return pid,source,relative,version,path
    def read(self,body):
        pid,source,relative,version,path=self.source(body)
        result=read_json(path,{'revision':0,'notes':[]})
        return {**result,'projectId':pid,'mediaId':body['mediaId'],'sourcePath':relative,'sourceVersion':version,'path':'.studio/reviews/'+version+'.json'}
    def expected_revision(self,body,prior):
        revision=body.get('expectedRevision',body.get('revision'))
        if type(revision) is not int:raise ValueError('修改记录版本必须为整数')
        if 'expectedRevision' in body and 'revision' in body and body['revision']!=revision:raise ValueError('修改记录版本参数不一致')
        if revision!=prior['revision']:raise ReviewConflict('修改记录已在另一页面更新，请合并最新记录后再保存')
        return revision
    def save(self,body):
        with self.lock:
            pid,source,relative,version,path=self.source(body)
            if body.get('sourceVersion')!=version:raise ReviewConflict('成片已更新，请重新打开新版本再标记')
            prior=read_json(path,{'revision':0,'notes':[]})
            revision=self.expected_revision(body,prior)
            notes=body.get('notes')
            if not isinstance(notes,list) or len(notes)>200:raise ValueError('每版视频最多200条修改意见')
            duration=float(self.app.media_probe(str(body['mediaId']))['duration'])
            if not math.isfinite(duration) or duration<=0:raise ValueError('视频时长无效，无法保存修改区间')
            normalized=[];ids=set()
            def number(value,lo,hi):
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not lo<=value<=hi:raise ValueError('标记坐标或时间超出范围')
                return value
            for item in notes:
                if not isinstance(item,dict):raise ValueError('标记格式错误')
                ident=item.get('id');kind=item.get('kind')
                if not isinstance(ident,str) or len(ident)>60 or not ident or ident in ids:raise ValueError('标记编号无效或重复')
                ids.add(ident)
                if kind not in {'note','text','blur','brightness','zoom'}:raise ValueError('不支持此预演类型')
                start=number(item.get('startSec'),0,duration);end=number(item.get('endSec'),0,duration)
                if end<=start:raise ValueError('标记终点需晚于起点')
                row={'id':ident,'kind':kind,'startSec':start,'endSec':end,'text':clean_text(item.get('text',''),1600),'x':number(item.get('x',.5),0,1),'y':number(item.get('y',.5),0,1),'width':number(item.get('width',.25),.02,1),'height':number(item.get('height',.15),.02,1),'value':number(item.get('value',1),.5,2),'enabled':item.get('enabled',True)}
                if type(row['enabled']) is not bool:raise ValueError('标记开关需为布尔值')
                target=item.get('targetModule',{'text':'subtitles','zoom':'camera','brightness':'camera'}.get(kind,'creative'))
                if not isinstance(target,str) or target not in TARGET_MODULES:raise ValueError('标记所属模块无效')
                row['targetModule']=target
                normalized.append(row)
            data={'schemaVersion':2,'revision':revision+1,'sourcePath':relative,'sourceVersion':version,'mediaId':body['mediaId'],'updatedAt':time.time(),'notes':normalized,'status':'draft','previewOnly':True}
            for key in ('submittedRevision','submittedAt','preparedRevision','preparedAt'):
                if key in prior:data[key]=prior[key]
            if self.source(body)[3]!=version:raise ReviewConflict('成片已更新，请重新打开新版本再标记')
            write_json(path,data)
            return {**data,'path':'.studio/reviews/'+version+'.json','projectId':pid}
    def prepare(self,body):
        """Record composer preparation without implying the agent was submitted."""
        with self.lock:
            record=self.read(body)
            if body.get('sourceVersion')!=record['sourceVersion']:raise ReviewConflict('成片已更新，请重新打开新版本再标记')
            self.expected_revision(body,record)
            if not any(n.get('enabled',True) for n in record['notes']):raise ValueError('请至少采用一条修改意见')
            pid,source,relative,version,path=self.source(body)
            if version!=record['sourceVersion']:raise ReviewConflict('成片已更新，请重新打开新版本再标记')
            record.update(status='prepared',preparedRevision=record['revision'],preparedAt=time.time())
            write_json(path,{k:v for k,v in record.items() if k not in {'projectId','path'}})
            return record
    def snapshot(self,body):
        with self.lock:
            record=self.read(body)
            if body.get('sourceVersion')!=record['sourceVersion'] or type(body.get('reviewRevision')) is not int or body.get('reviewRevision')!=record['revision']:raise ValueError('修改清单已更新，请重新整理意见后发送')
            pid,source,relative,version,path=self.source(body)
            root=Path(self.app.library.project(pid)['path']).resolve()
            if version!=record['sourceVersion']:raise ValueError('成片已更新，请重新打开新版本再标记')
            snapshot=safe_path(root,f".studio/reviews/submissions/{version}-r{record['revision']}.json")
            if not snapshot.exists():write_json(snapshot,record)
            submitted={**record,'status':'submitted','submittedRevision':record['revision'],'submittedAt':time.time()}
            write_json(path,{k:v for k,v in submitted.items() if k not in {'projectId','path'}})
            return {**record,'path':snapshot.relative_to(root).as_posix()}
    def action(self,body):
        if body.get('action')=='review.read':return self.read(body)
        if body.get('action')=='review.save':return self.save(body)
        if body.get('action')=='review.prepare':return self.prepare(body)
        raise ValueError('未知视频标记操作')
