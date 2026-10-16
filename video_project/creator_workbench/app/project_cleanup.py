"""Manifest-based project cleanup. Scan first; apply only selected unchanged files."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import threading
import time
import uuid


LIMIT = 50_000
AGE_SECONDS = 24 * 60 * 60
VIDEO = {'.mp4', '.webm', '.mov', '.m4v'}
SOURCE = {'.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.html','.md','.txt','.json','.toml','.yaml','.yml','.glsl','.vert','.frag','.tex','.c','.h','.ps1','.bat','.srt','.vtt'}
SOURCE_CODE = {'.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.html','.toml','.yaml','.yml','.glsl','.vert','.frag','.tex','.c','.h','.ps1','.bat','.srt','.vtt'}
PRESERVE = {'.git','.studio','node_modules','.venv','venv','assets','asset','src','source','sources','audio','public','originals','history','_history','privatevoice','private-voice','private_voice','voices','voice','models','model','fonts','publish','.ssh','.codex','.claude'}
SECRET = re.compile(r'(^\.env($|\.)|(?:api[-_]?keys?|credentials?|secrets?|auth)\.(?:json|toml|ya?ml)$|id_(?:rsa|ed25519)|\.pem$)',re.I)
CACHE = re.compile(r'^(?:qa(?:[-_].*)?|scene-qa|media-qa-smoke|frames?|frame-cache|cache|caches|temp|tmp)$',re.I)
VERSION = re.compile(r'(?i)(?<![A-Za-z0-9])v(\d+)(?![A-Za-z0-9])')


def _link(path):
    st=path.lstat()
    return stat.S_ISLNK(st.st_mode) or bool(getattr(st,'st_file_attributes',0)&0x400)


def _safe(root,name):
    if not isinstance(name,str) or not name or '\x00' in name:raise ValueError('路径无效')
    relative=Path(name)
    if relative.is_absolute() or relative.drive or '..' in relative.parts:raise ValueError('仅允许工程相对路径')
    for part in relative.parts:
        if ':' in part or part.endswith((' ','.')) or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)',part,re.I):raise ValueError('不接受设备名或特殊路径')
    path=root/relative
    if not path.resolve().is_relative_to(root.resolve()):raise ValueError('路径超出工程')
    cursor=root
    if _link(root):raise ValueError('不跟随工程目录链接')
    for part in relative.parts:
        cursor/=part
        if os.path.lexists(cursor) and _link(cursor):raise ValueError('不跟随链接或目录联接')
    return path


def _hash(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def _stamp(path):
    st=path.stat()
    return {'size':st.st_size,'mtimeNs':st.st_mtime_ns,'ctimeNs':st.st_ctime_ns,'birthNs':getattr(st,'st_birthtime_ns',int(getattr(st,'st_birthtime',st.st_ctime)*1e9)),'links':st.st_nlink}


def _fingerprint(path):return {**_stamp(path),'sha256':_hash(path)}


def _old(st):return max(st['mtimeNs'],st['birthNs'])/1e9 < time.time()-AGE_SECONDS


def _atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp-'+uuid.uuid4().hex[:8])
    temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');os.replace(temp,path)


def _probe_video(path,complete=False):
    ffprobe=shutil.which('ffprobe')
    if not ffprobe:raise ValueError('未找到ffprobe，不能登记可用版本')
    done=subprocess.run([ffprobe,'-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,duration','-of','json',str(path)],capture_output=True,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if done.returncode:raise ValueError('视频探测失败，未登记为可用版本')
    try:
        data=json.loads(done.stdout);video=next(s for s in data['streams'] if s.get('codec_type')=='video');duration=float(data.get('format',{}).get('duration') or video.get('duration') or 0)
        if not 0<duration<86400 or int(video.get('width',0))<=0 or int(video.get('height',0))<=0:raise ValueError()
    except (ValueError,KeyError,TypeError,StopIteration):raise ValueError('视频没有有效时长或画面，未登记') from None
    if complete:
        ffmpeg=shutil.which('ffmpeg')
        if not ffmpeg:raise ValueError('未找到ffmpeg，不能完成全片解码核验')
        decoded=subprocess.run([ffmpeg,'-v','error','-xerror','-i',str(path),'-map','0:v:0','-map','0:a?','-f','null','-'],capture_output=True,timeout=600,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if decoded.returncode or decoded.stderr.strip():raise ValueError('全片解码检查失败，原可用版本仍保留')
    return {'duration':duration,'width':video['width'],'height':video['height'],'codec':video.get('codec_name'),'fullDecodeChecked':complete}


class CleanupManager:
    def __init__(self,app):
        self.app=app;self.lock=threading.RLock();self.store=Path(app.state_root)/'studio/cleanup'
        self.store.mkdir(parents=True,exist_ok=True)

    def _root(self,project_id):
        root=Path(self.app.library.project(project_id)['path']).absolute()
        if _link(root):raise ValueError('不清理目录链接')
        return root

    def _active(self,project_id,ignore_job_id=None):
        manager=getattr(self.app,'runs',None)
        if manager:
            with manager.lock:
                if any(r.get('projectId')==project_id and r.get('status') in {'queued','running','cancelling'} for r in manager.runs.values()):return True
        studio=getattr(self.app,'media_studio',None)
        if studio:
            # A background approval is itself an active media job. Ignore only
            # that exact job, while retaining the global media queue guard.
            if ignore_job_id is not None and hasattr(studio,'jobs') and hasattr(studio,'lock'):
                with studio.lock:
                    return any(key!=ignore_job_id and row.get('status') in {'queued','running','submitted','polling'} for key,row in studio.jobs.items())
            try:
                if studio.has_active(project_id):return True
            except TypeError:
                if studio.has_active():return True
        return False

    def _inventory(self,root):
        files=[];protected=[];pending=[root];count=0;truncated=False
        while pending:
            directory=pending.pop()
            try:
                with os.scandir(directory) as scan:entries=list(scan)
            except OSError:
                protected.append({'path':directory.relative_to(root).as_posix(),'reason':'无法读取，保留'});continue
            for entry in entries:
                count+=1
                if count>LIMIT:truncated=True;pending.clear();break
                path=Path(entry.path);rel=path.relative_to(root).as_posix()
                try:
                    if _link(path):protected.append({'path':rel,'reason':'链接或目录联接，保留'});continue
                    if entry.is_dir(follow_symlinks=False):
                        if entry.name.casefold() in PRESERVE:
                            protected.append({'path':rel,'reason':'源码、依赖、原素材或历史保留目录'});continue
                        pending.append(path)
                    elif entry.is_file(follow_symlinks=False):files.append(path)
                except OSError:protected.append({'path':rel,'reason':'无法读取，保留'})
        return files,protected,truncated

    def _references(self,root):
        # A separate source-only walk includes canonical src/public configuration,
        # but never dependencies, private voice, secrets or history.
        snippets=[];pending=[root];count=0
        skip=PRESERVE-{'src','source','sources','public','assets'}
        while pending:
            directory=pending.pop()
            try:
                with os.scandir(directory) as scan:entries=list(scan)
            except OSError:raise ValueError('源码引用扫描未完成，暂不清理') from None
            for entry in entries:
                count+=1
                if count>LIMIT:raise ValueError('源码引用扫描达到上限，暂不清理')
                path=Path(entry.path)
                if _link(path):continue
                if entry.is_dir(follow_symlinks=False):
                    if entry.name.casefold() not in skip:pending.append(path)
                elif path.suffix.lower() in SOURCE and not SECRET.search(path.name) and path.stat().st_size<=2_000_000:
                    text=path.read_text(encoding='utf-8-sig',errors='replace').replace('\\','/').casefold()
                    snippets.append((path.relative_to(root).as_posix(),text))
        return snippets

    def _referenced(self,root,path,references):
        rel=path.relative_to(root).as_posix().casefold();name=path.name.casefold()
        parents=[p.as_posix().casefold()+'/' for p in path.relative_to(root).parents if str(p)!='.']
        for owner,text in references:
            if owner.casefold()==rel:continue
            if rel in text or name in text or any(parent in text for parent in parents):return owner
        return None

    def _release(self,root):
        manifest=root/'.studio/current-release.json'
        if not manifest.exists():return None
        try:
            _safe(root,'.studio/current-release.json');data=json.loads(manifest.read_text(encoding='utf8'));source=_safe(root,data['path'])
            if _fingerprint(source)!=data['fingerprint']:return None
            if data.get('probe',{}).get('fullDecodeChecked') is not True:return None
            return data
        except (OSError,ValueError,KeyError,TypeError):return None

    def _canonical_dependencies(self,root,protected):
        result={};count=0
        names={'src','source','sources','assets','asset','audio','public','originals','fonts','models','model'}
        for entry in protected:
            if Path(entry['path']).name.casefold() not in names:continue
            try:path=_safe(root,entry['path'])
            except ValueError:continue # Linked/shared asset hosts stay protected.
            if not path.is_dir():continue
            pending=[path]
            while pending:
                folder=pending.pop()
                with os.scandir(folder) as scan:
                    for item in scan:
                        count+=1
                        if count>LIMIT:raise ValueError('依赖清单超过50000项，未登记')
                        child=Path(item.path)
                        if _link(child) or SECRET.search(item.name):continue
                        if item.is_dir(follow_symlinks=False):
                            if item.name.casefold() not in {'node_modules','.venv','venv','privatevoice','private_voice','private-voice','.git'}:pending.append(child)
                        elif item.is_file(follow_symlinks=False):result[child.relative_to(root).as_posix()]=_fingerprint(child)
        return result

    def approve(self,project_id,source_path,dependency_paths=None,ignore_job_id=None):
        with self.lock:
            root=self._root(project_id)
            if self._active(project_id,ignore_job_id):raise ValueError('工程正在执行任务，结束后再登记可用版本')
            source=_safe(root,source_path)
            if not source.is_file() or source.suffix.lower() not in VIDEO:raise ValueError('请选择工程内完整视频文件')
            before=_fingerprint(source);probe=_probe_video(source,complete=True)
            if _fingerprint(source)!=before:raise ValueError('核验过程中视频发生变化，未登记')
            files,protected,truncated=self._inventory(root)
            if truncated:raise ValueError('依赖清单扫描达到上限，未替换当前登记')
            dependencies=self._canonical_dependencies(root,protected)
            # Preserve all source/config files and lockfiles; canonical asset and
            # dependency directories are retained wholesale by every scan/apply.
            for path in files:
                if path==source or SECRET.search(path.name):continue
                if path.suffix.lower() in SOURCE_CODE or path.name.lower() in {'package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','requirements.txt','pyproject.toml','uv.lock'}:
                    dependencies[path.relative_to(root).as_posix()]=_fingerprint(path)
            if dependency_paths is not None:
                if not isinstance(dependency_paths,list) or len(dependency_paths)>5000:raise ValueError('依赖清单需为最多5000项相对路径')
                for name in dependency_paths:
                    path=_safe(root,name)
                    if not path.is_file() or SECRET.search(path.name):raise ValueError('依赖文件不存在或属于私密配置')
                    dependencies[path.relative_to(root).as_posix()]=_fingerprint(path)
            if self._active(project_id,ignore_job_id):raise ValueError('工程任务已启动，未登记')
            result={'schema':1,'projectId':project_id,'path':source.relative_to(root).as_posix(),'fingerprint':before,'probe':probe,'approvedAt':time.time(),'dependencies':[{'path':name,'fingerprint':fp} for name,fp in sorted(dependencies.items())],'protectedRoots':protected,'retention':'current-usable-release-and-render-dependencies'}
            _safe(root,'.studio/current-release.json');_atomic(root/'.studio/current-release.json',result)
            return result

    def _classify(self,root,path,release,references):
        rel=path.relative_to(root);parts=[p.casefold() for p in rel.parts]
        if any(part in PRESERVE for part in parts) or SECRET.search(path.name):return None,'源码、依赖或私密素材保留'
        if release and (rel.as_posix()==release['path'] or rel.as_posix() in {d['path'] for d in release.get('dependencies',[])}):return None,'当前可用版或登记依赖'
        if path.suffix.lower() in SOURCE_CODE:return None,'可重新制作所需源码保留'
        owner=self._referenced(root,path,references)
        if owner:return None,'源码或配置引用：'+owner
        stamp=_stamp(path)
        if not _old(stamp):return None,'创建或修改未满24小时'
        if stamp['links']>1:return None,'共享硬链接保留'
        work_at=parts.index('work') if 'work' in parts else -1
        if work_at>=0 and any(CACHE.fullmatch(p) for p in parts[work_at+1:-1]) and path.suffix.lower() in VIDEO|{'.png','.jpg','.jpeg','.webp','.log'}:
            return 'regenerable-cache','超过24小时的明确QA/帧/临时缓存'
        if release and path.suffix.lower() in VIDEO and any(p in {'output','outputs','delivery','deliverables'} for p in parts[:-1]):
            current=_safe(root,release['path'])
            if stamp['size']==release['fingerprint']['size'] and _hash(path)==release['fingerprint']['sha256']:
                return 'duplicate-output','与已登记可用成片逐字节一致的输出副本'
            left=list(VERSION.finditer(path.stem));right=list(VERSION.finditer(current.stem))
            if path.parent==current.parent and len(left)==len(right)==1 and int(left[0].group(1))<int(right[0].group(1)) and VERSION.sub('v#',path.stem).casefold()==VERSION.sub('v#',current.stem).casefold():
                old=_probe_video(path)
                if (old['width'],old['height'])==(release['probe']['width'],release['probe']['height']):return 'superseded-version','同目录、同标题、同画幅的显式旧版本；新版已登记并完整解码'
        return None,'未证实可再生或可替代，保留'

    def scan(self,project_id):
        with self.lock:
            root=self._root(project_id);ident=uuid.uuid4().hex
            if self._active(project_id):
                report={'id':ident,'projectId':project_id,'root':str(root),'candidates':[],'protected':[{'path':'.','reason':'工程或媒体任务正在运行'}],'summary':{'candidateCount':0,'candidateBytes':0,'active':True,'truncated':False}}
                _atomic(self.store/(ident+'.json'),report);return report
            files,protected,truncated=self._inventory(root)
            references=self._references(root);release=self._release(root);items=[]
            if truncated:protected.append({'path':'.','reason':'扫描达到50000项上限，本次不提供删除候选'})
            for path in files:
                rel=path.relative_to(root).as_posix()
                try:
                    kind,reason=self._classify(root,path,release,references)
                    if kind and not truncated:
                        fp=_fingerprint(path);items.append({'id':hashlib.sha256(rel.encode()).hexdigest()[:24],'path':rel,'bytes':fp['size'],'reason':reason,'kind':kind,'fingerprint':fp})
                    else:protected.append({'path':rel,'reason':reason})
                except (OSError,ValueError,subprocess.TimeoutExpired):protected.append({'path':rel,'reason':'无法完整验证，保留'})
            report={'id':ident,'projectId':project_id,'root':str(root),'createdAt':time.time(),'release':release and {'path':release['path'],'fingerprint':release['fingerprint']},'candidates':items,'protected':protected,'summary':{'candidateCount':len(items),'candidateBytes':sum(x['bytes'] for x in items),'protectedCount':len(protected),'active':False,'truncated':truncated,'hasApprovedRelease':release is not None}}
            _atomic(self.store/(ident+'.json'),report);return report

    def apply(self,project_id,scan_id,selected_ids):
        with self.lock:
            if not re.fullmatch(r'[a-f0-9]{32}',str(scan_id)):raise ValueError('扫描标识无效')
            if not isinstance(selected_ids,list) or len(selected_ids)>LIMIT or not all(isinstance(x,str) for x in selected_ids) or len(set(selected_ids))!=len(selected_ids):raise ValueError('请选择扫描中的唯一候选ID')
            root=self._root(project_id)
            scan=json.loads((self.store/(scan_id+'.json')).read_text(encoding='utf8'))
            if scan.get('projectId')!=project_id or Path(scan.get('root',''))!=root:raise ValueError('扫描不属于当前工程')
            known={x['id']:x for x in scan['candidates']}
            if any(ident not in known for ident in selected_ids):raise ValueError('仅允许删除本次扫描已列出的候选文件')
            before=shutil.disk_usage(root).free;deleted=[];skipped=[];references=self._references(root);release=self._release(root)
            source_stamps={owner:_stamp(_safe(root,owner)) for owner,_ in references}
            for ident in selected_ids:
                item=known[ident];reason=None
                try:
                    if self._active(project_id):reason='工程或媒体任务正在运行'
                    if not reason and any(_stamp(_safe(root,owner))!=fingerprint for owner,fingerprint in source_stamps.items()):reason='源码或引用文件已变化，请重新扫描'
                    path=_safe(root,item['path'])
                    if not reason and (not path.is_file() or _fingerprint(path)!=item['fingerprint']):reason='文件已变化或不存在'
                    if not reason:
                        kind,why=self._classify(root,path,release,references)
                        if kind!=item['kind']:reason=why
                    if not reason and item['kind'] in {'duplicate-output','superseded-version'} and (not release or scan.get('release')!={'path':release['path'],'fingerprint':release['fingerprint']}):reason='登记的可用版本已变化，需重新扫描'
                    if reason:skipped.append({'path':item['path'],'reason':reason});continue
                    # Journal intent before deleting a single unchanged regular file.
                    attempt={'projectId':project_id,'scanId':scan_id,'deleted':deleted,'skipped':skipped,'pending':item['path']}
                    _atomic(self.store/(scan_id+'-apply.json'),attempt)
                    path.unlink();deleted.append({'path':item['path'],'bytes':item['bytes'],'sha256':item['fingerprint']['sha256']})
                except (OSError,ValueError,subprocess.TimeoutExpired):skipped.append({'path':item['path'],'reason':'文件在用、已变化或校验失败；未强制删除'})
            after=shutil.disk_usage(root).free
            report={'projectId':project_id,'scanId':scan_id,'deleted':deleted,'skipped':skipped,'deletedBytes':sum(x['bytes'] for x in deleted),'releasedBytes':max(0,after-before),'diskFreeDeltaBytes':after-before,'completedAt':time.time(),'note':'deletedBytes为删除文件的逻辑字节；releasedBytes为磁盘可用空间实测增长，可能受同时运行的其他程序影响。仅删除选定普通文件，不递归删目录。'}
            _atomic(self.store/(scan_id+'-apply.json'),report);return report
