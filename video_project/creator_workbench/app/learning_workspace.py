"""Independent, durable learning collections with an explicit bounded background queue."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import threading
import time
import uuid
from urllib.parse import urlsplit

from .context_budget import validate_budget, DEFAULT_BUDGET
from .harness import redact, safe_path
from pathlib import Path
from .studio import clean_text, write_json

ACTIVE = {'queued', 'waiting', 'running', 'cancelling'}
RUN_ACTIVE = {'queued', 'running', 'cancelling', 'awaiting_selection'}


class LearningWorkspace:
    def __init__(self, app):
        self.app = app
        self.root = app.state_root / 'learning'
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / 'workspace.json'
        self.lock = threading.RLock()
        self.worker = None
        try:
            self.data = json.loads(self.path.read_text(encoding='utf8'))
            if not isinstance(self.data, dict) or not isinstance(self.data.get('collections'), list) or not isinstance(self.data.get('tasks'), list):
                raise ValueError('invalid learning workspace')
        except (OSError, ValueError):
            self.data = {'version': 1, 'collections': [], 'tasks': []}
        interrupted = False
        for collection in self.data['collections']:
            if collection.get('independent') is True:
                workspace = self.app.library.register_learning_project(collection['id'], collection['name'])
                collection.update(projectId=None, workspaceId=workspace['id'])
        for task in self.data['tasks']:
            if task.get('status') in ACTIVE:
                task.update(status='interrupted', message='工作台曾关闭，已有产物保留；请明确重新加入队列。', updatedAt=time.time())
                interrupted = True
        if interrupted:
            self._save()

    def _save(self):
        write_json(self.path, self.data)

    def has_active(self):
        with self.lock:
            return any(t['status'] in ACTIVE for t in self.data['tasks'])

    def snapshot(self):
        with self.lock:
            return copy.deepcopy({'collections': self.data['collections'], 'tasks': self.data['tasks'][-200:],
                                  'queueLimit': 20, 'iterationLimit': None, 'executionPolicy': 'continuous', 'background': True})

    def _collection(self, ident):
        row = next((c for c in self.data['collections'] if c['id'] == ident), None)
        if row is None:
            raise ValueError('学习工程不存在')
        return row

    def _task(self, ident):
        row = next((t for t in self.data['tasks'] if t['id'] == ident), None)
        if row is None:
            raise ValueError('学习任务不存在')
        return row

    def _models_ready(self):
        states = {p['id']: p for p in self.app.providers.public_status()}
        if not all(states.get(p, {}).get('configured') for p in ('openai', 'claude')):
            raise ValueError('开始学习前，请先在CC Switch配置 ChatGPT 和 Claude 接口；参考可以先保存。')

    def _create(self, body):
        if len(self.data['collections']) >= 100:
            raise ValueError('学习工程最多100个')
        name = clean_text(body.get('name'), 80)
        if not name:
            raise ValueError('请输入学习工程名称')
        pid = body.get('projectId')
        if pid is not None and (not isinstance(pid, str) or not pid.strip()):
            raise ValueError('关联工程标识无效；独立学习请省略projectId')
        if pid:
            project = self.app.library.project(pid)
            if project.get('kind') == 'learning':
                raise ValueError('内部学习工作空间不能作为视频工程绑定')
        row = {'id': uuid.uuid4().hex, 'name': name, 'projectId': pid or None,
               'independent': not bool(pid), 'references': [], 'createdAt': time.time()}
        if not pid:
            workspace = self.app.library.register_learning_project(row['id'], name)
            row['workspaceId'] = workspace['id']
        self.data['collections'].append(row)
        self._save()
        return copy.deepcopy(row)

    def _reference(self, body):
        name = clean_text(body.get('name') or '镜头参考', 100)
        source = clean_text(body.get('source'), 4000)
        if not source:
            raise ValueError('请输入视频链接或本地路径')
        start, end = body.get('startSec', 0), body.get('endSec', 15)
        if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or not math.isfinite(start) or not math.isfinite(end) or not 0 <= start < end <= 86400:
            raise ValueError('参考区间需为0至86400秒内的有效数值')
        parsed = urlsplit(source)
        if parsed.scheme.lower() in {'http', 'https'}:
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('请输入公开 HTTPS 视频链接')
            request = {'url': source}
        else:
            request = {'path': source}
        return {'id': uuid.uuid4().hex, 'name': name, 'source': source, 'startSec': start, 'endSec': end,
                'notes': clean_text(body.get('notes'), 6000), 'request': request, 'createdAt': time.time()}

    def _workspace_id(self, collection):
        if collection.get('independent'):
            return self.app.library.register_learning_project(collection['id'], collection['name'])['id']
        return collection['projectId']

    def action(self, body):
        action = body.get('action')
        if action == 'learning.list':
            return self.snapshot()
        with self.lock:
            if action == 'learning.create':
                return self._create(body)
            if action == 'learning.quick_start':
                ref = self._reference(body)
                # Validate execution settings before creating any persistent row.
                from .providers import validate_model_efforts
                from .workflows import normalize_learning_iterations
                budget = validate_budget(body.get('contextBudgetTokens', DEFAULT_BUDGET))
                efforts = validate_model_efforts(body.get('modelEfforts'))
                normalize_learning_iterations(body.get('iterations'))
                client_id = body.get('clientRequestId')
                identity = None
                if client_id is not None:
                    if not isinstance(client_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', client_id):
                        raise ValueError('学习提交标识无效')
                    signature = hashlib.sha256(json.dumps({
                        'source': ref['source'], 'name': ref['name'], 'notes': ref['notes'],
                        'startSec': ref['startSec'], 'endSec': ref['endSec'],
                        'collectionId': body.get('collectionId'), 'contextBudgetTokens': budget,
                        'modelEfforts': efforts}, ensure_ascii=False, sort_keys=True).encode('utf8')).hexdigest()
                    previous = [t for t in self.data['tasks'] if t.get('clientRequestId') == client_id]
                    if previous:
                        if any(t.get('requestSignature') != signature for t in previous):
                            raise ValueError('同一学习提交标识的内容已变化，请使用新的提交标识')
                        first = previous[0]
                        saved_collection = self._collection(first['collectionId'])
                        saved_reference = first.get('referenceSnapshot') or next((r for r in saved_collection['references'] if r['id'] == first['referenceId']), None)
                        return {'collection': copy.deepcopy(saved_collection), 'reference': copy.deepcopy(saved_reference),
                                'tasks': copy.deepcopy(previous), 'reused': True}
                    identity = {'clientRequestId': client_id, 'requestSignature': signature,
                                'referenceSnapshot': copy.deepcopy(ref)}
                self._models_ready()
                if len([t for t in self.data['tasks'] if t['status'] in ACTIVE]) >= 20:
                    raise ValueError('后台队列最多20条任务')
                collection_id = body.get('collectionId')
                if collection_id:
                    row = self._collection(collection_id)
                    if len(row['references']) >= 100:
                        raise ValueError('每个学习工程最多100条参考')
                else:
                    default_name = Path(ref['source']).stem if 'path' in ref['request'] else '视频参考学习'
                    created = self._create({'name': body.get('name') or default_name[:80] or '视频参考学习'})
                    row = self._collection(created['id'])
                row['references'].append(ref)
                try:
                    result = self._enqueue({**body, 'collectionId': row['id'], 'referenceIds': [ref['id']]}, request_identity=identity)
                except Exception:
                    row['references'].remove(ref)
                    self._save()
                    raise
                return {'collection': copy.deepcopy(row), 'reference': copy.deepcopy(ref), **result}
            if action == 'learning.rename':
                row = self._collection(body.get('collectionId'))
                name = clean_text(body.get('name'), 80)
                if not name:
                    raise ValueError('请输入学习工程名称')
                row['name'] = name
                if row.get('independent'):
                    self.app.library.register_learning_project(row['id'], name)
                self._save()
                return copy.deepcopy(row)
            if action == 'learning.preview':
                task = self._task(body.get('id'))
                if not task.get('previewPath'):
                    raise ValueError('该任务还没有生成可预览样片')
                root = Path(self.app.library.project(task['projectId'])['path'])
                source = safe_path(root, task['previewPath'])
                if not source.is_file():
                    raise ValueError('样片文件已移动或不存在')
                media = self.app.library.register_media(source, task['projectId'])
                return {'url': '/api/media/' + media['id'], 'path': task['previewPath']}
            if action == 'learning.reference.add':
                row = self._collection(body.get('collectionId'))
                if len(row['references']) >= 100:
                    raise ValueError('每个学习工程最多100条参考')
                ref = self._reference(body)
                row['references'].append(ref)
                self._save()
                return copy.deepcopy(ref)
            if action == 'learning.import':
                row = self._collection(body.get('collectionId'))
                if not row.get('projectId'):
                    raise ValueError('独立学习没有关联视频工程，请直接添加视频路径或链接')
                existing = {r.get('projectReferenceId') for r in row['references']}
                added = 0
                for ref in self.app.studio.config(row['projectId']).get('references', []):
                    if ref['id'] in existing or len(row['references']) >= 100:
                        continue
                    row['references'].append({'id': uuid.uuid4().hex, 'projectReferenceId': ref['id'],
                        'name': ref.get('name') or '工程参考', 'source': ref.get('url') or ref.get('sourcePath') or ref.get('path', ''),
                        'startSec': ref.get('startSec', 0), 'endSec': ref.get('endSec', 15), 'notes': ref.get('notes', ''),
                        'request': {'referenceId': ref['id']}, 'createdAt': time.time()})
                    added += 1
                self._save()
                return {'imported': added}
            if action == 'learning.enqueue':
                return self._enqueue(body)
            if action == 'learning.cancel':
                task = self._task(body.get('id'))
                if task['status'] not in ACTIVE:
                    return copy.deepcopy(task)
                if task.get('workflowId'):
                    task['status'] = 'cancelling'
                    self.app.workflows.stop(task['workflowId'])
                else:
                    task.update(status='cancelled', message='已从队列移除，未提交模型请求。')
                task['updatedAt'] = time.time()
                self._save()
                return copy.deepcopy(task)
            if action == 'learning.remove':
                row = self._collection(body.get('collectionId'))
                ident = body.get('referenceId')
                if any(t['collectionId'] == row['id'] and t['referenceId'] == ident and t['status'] in ACTIVE for t in self.data['tasks']):
                    raise ValueError('请先停止该参考的学习任务')
                if not any(r['id'] == ident for r in row['references']):
                    raise ValueError('参考不存在')
                row['references'] = [r for r in row['references'] if r['id'] != ident]
                self._save()
                return {'removed': True}
        raise ValueError('未知学习操作')

    def _enqueue(self, body, *, request_identity=None):
        from .providers import validate_model_efforts
        from .workflows import normalize_learning_iterations
        row = self._collection(body.get('collectionId'))
        self._models_ready()
        selected = body.get('referenceIds')
        if not isinstance(selected, list) or not 1 <= len(selected) <= 10 or any(not isinstance(i, str) for i in selected):
            raise ValueError('单次请选择1至10条参考')
        selected = list(dict.fromkeys(selected))
        refs = {ref['id']: ref for ref in row['references']}
        if any(ident not in refs for ident in selected):
            raise ValueError('所选参考不存在')
        iterations = normalize_learning_iterations(body.get('iterations'))
        active = [t for t in self.data['tasks'] if t['status'] in ACTIVE]
        if len(active) + len(selected) > 20:
            raise ValueError('后台队列最多20条任务')
        if any(t['collectionId'] == row['id'] and t['referenceId'] in selected for t in active):
            raise ValueError('所选参考已在队列中')
        pid = self._workspace_id(row)
        self.app.library.project(pid)
        config = self.app.studio.config(pid)
        budget = validate_budget(body.get('contextBudgetTokens', config.get('contextBudgetTokens', DEFAULT_BUDGET)))
        efforts = validate_model_efforts(body.get('modelEfforts', config.get('modelEfforts')))
        tasks = []
        for ident in selected:
            ref = refs[ident]
            task = {'id': uuid.uuid4().hex, 'collectionId': row['id'], 'referenceId': ident, 'projectId': pid,
                    'independent': bool(row.get('independent')), 'targetProjectId': row.get('projectId'),
                    'name': ref['name'], 'status': 'queued', 'message': '等待工作台空闲，随后读取参考并试做。',
                    'executionPolicy': 'continuous',
                    'createdAt': time.time(), 'updatedAt': time.time(),
                    'request': {'kind': 'learn', 'projectId': pid, **copy.deepcopy(ref['request']), 'startSec': ref['startSec'],
                                'endSec': ref['endSec'], 'prompt': ref['notes'], 'iterations': iterations,
                                'executionPolicy': 'continuous',
                                'independentLearning': bool(row.get('independent')),
                                'contextBudgetTokens': budget, 'modelEfforts': efforts}}
            if request_identity:
                task.update(copy.deepcopy(request_identity))
            tasks.append(task)
        self.data['tasks'].extend(tasks)
        self._save()
        if self.worker is None or not self.worker.is_alive():
            self.worker = threading.Thread(target=self._work, name='learning-workspace', daemon=True)
            self.worker.start()
        return {'tasks': copy.deepcopy(tasks)}

    def _busy(self):
        return self.app.workflows.has_active() or any(r['status'] in RUN_ACTIVE for r in self.app.runs.summary())

    def _work(self):
        while True:
            with self.lock:
                task = next((t for t in self.data['tasks'] if t['status'] in ACTIVE), None)
                if task is None:
                    self.worker = None
                    return
            try:
                self._tick(task)
            except Exception as error:
                with self.lock:
                    task.update(status='failed', message=redact(error), updatedAt=time.time())
                    self._save()
            time.sleep(.5)

    def _tick(self, task):
        with self.lock:
            if task['status'] not in ACTIVE:
                return
            if not task.get('workflowId'):
                if self._busy():
                    if task['status'] != 'waiting':
                        task.update(status='waiting', message='等待当前创作或学习阶段完成；可继续使用编辑器。', updatedAt=time.time())
                        self._save()
                    return
                result = self.app.workflows.start(copy.deepcopy(task['request']))
                task.update(workflowId=result['workflowId'], status='running', updatedAt=time.time())
                self._save()
                return
            workflow = self.app.workflows.get(task['workflowId'])
            changed = task.get('message') != workflow.get('message') or task['status'] != workflow['status']
            task.update(status=workflow['status'], message=workflow.get('message', ''), phase=workflow.get('phase'),
                        previewPath=workflow.get('previewPath'), learned=workflow.get('learned'),
                        results=copy.deepcopy(workflow.get('results', [])), runIds=copy.deepcopy(workflow.get('runIds', [])))
            if changed:
                task['updatedAt'] = time.time()
                self._save()
