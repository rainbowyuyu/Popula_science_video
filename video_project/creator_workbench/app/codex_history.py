"""Read-only adapter for local Codex conversations, never tools or reasoning.

Only the configured Codex root's two session directories and session_index.jsonl
are read. ``root`` is constructor injection for trusted application code/tests,
not an HTTP source-path parameter. Attachment paths are references, never opened.
"""
from __future__ import annotations

from collections import defaultdict
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import threading
from urllib.parse import unquote, urlsplit, urlunsplit


DEFAULT_CODEX_ROOT = Path.home() / '.codex'
SOURCE_VERSION = 'visible-history-v3'
SESSION_DIRECTORIES = ('sessions', 'archived_sessions')
MAX_RECORD_BYTES = 32 * 1024 * 1024
READ_CHUNK_BYTES = 256 * 1024
THREAD_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,159}\Z')
URL = re.compile(r'https?://[^\s<>"\x27]+', re.I)
QUERY_SECRET = re.compile(r'(?:key|token|secret|password|passwd|credential|signature|authorization|auth|^sig$|^code$)', re.I)
SECRET_LABEL = r'(?:[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?key|secret(?:[_-]?key)?|auth[_-]?token|token|password|passwd|credential)[A-Za-z0-9_-]*|authorization|key)'
ASSIGNMENT = re.compile(r'(?i)(["\x27]?' + SECRET_LABEL + r'["\x27]?\s*[:=]\s*)("[^"\r\n]*"|\x27[^\x27\r\n]*\x27|[^\s,;\]\}\)]+)')
DATA_URL = re.compile(r'data:[^\s,;]+(?:;[^\s,]+)*,[A-Za-z0-9+/=_-]+', re.I)
IMAGE_SUFFIX = re.compile(r'\.(?:png|jpe?g|webp|gif|bmp|tiff?|heic|avif)(?:[?#].*)?$', re.I)
FILE_SUFFIX = re.compile(r'\.(?:png|jpe?g|webp|gif|bmp|tiff?|heic|avif|mp4|mov|webm|m4v|mp3|wav|pdf|docx?|xlsx?|pptx?|blend|glb|gltf|md|txt|json|py|tsx?|jsx?|mjs)(?:[?#].*)?$', re.I)
LOCAL_REFERENCE = re.compile(r'(?:[A-Za-z]:[\\/]|file:///)[^\r\n<>"\x27|]*?\.(?:png|jpe?g|webp|gif|bmp|tiff?|heic|avif|mp4|mov|webm|m4v|mp3|wav|pdf|docx?|xlsx?|pptx?|blend|glb|gltf|md|txt|json|py|tsx?|jsx?|mjs)(?=$|[\s)\]}>：:;,])', re.I)
MARKDOWN_REFERENCE = re.compile(r'!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))\)')
INJECTED_BLOCKS = re.compile(r'<(?:environment_context|in-app-browser-context|environment_details|turn_aborted|user_instructions|instructions|permissions instructions|skills_instructions)\b[^>]*>.*?</(?:environment_context|in-app-browser-context|environment_details|turn_aborted|user_instructions|instructions|permissions instructions|skills_instructions)>', re.I | re.S)
INJECTED_PREFIXES = (
    '# AGENTS.md instructions', 'AGENTS.md instructions',
    'Another language model started to solve this problem and produced a summary',
    'You are performing a CONTEXT CHECKPOINT COMPACTION',
    'The following is a summary of the previous conversation',
    '<context_summary>', '<compaction', '<summary>',
    '<codex_internal_context', '<subagent_notification', '<agent_message', '<heartbeat',
)


def _query_redacted(match):
    raw = match.group(0)
    try:
        url = urlsplit(raw)
        parts = []
        for part in url.query.split('&'):
            key, sep, value = part.partition('=')
            parts.append(key + ('=[REDACTED]' if sep and QUERY_SECRET.search(unquote(key)) else sep + value))
        authority = re.sub(r'^[^@]+@', '[REDACTED]@', url.netloc) if '@' in url.netloc else url.netloc
        return urlunsplit((url.scheme, authority, url.path, '&'.join(parts), url.fragment))
    except ValueError:
        return '[REDACTED URL]'


def redact_history(value):
    """Remove credentials before text, titles or attachment URLs leave adapter."""
    text = str(value)
    text = DATA_URL.sub('[embedded media omitted]', text)
    text = URL.sub(_query_redacted, text)
    text = re.sub(r'(?i)\bsk-[A-Za-z0-9_.-]+', '[REDACTED]', text)
    text = re.sub(r'(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]', text)
    text = ASSIGNMENT.sub(lambda m: m[1] + '[REDACTED]', text)
    return text


def _is_link(path):
    try:
        entry = path.lstat()
        return stat.S_ISLNK(entry.st_mode) or bool(getattr(entry, 'st_file_attributes', 0) & 0x400)
    except OSError:
        return True


def _safe(path, root):
    """Reject linked files/ancestors before opening even on Windows junctions."""
    try:
        path = path.absolute(); root = root.absolute()
        if not path.resolve().is_relative_to(root.resolve()):return False
        current = path
        while True:
            if _is_link(current):return False
            if current == current.parent:break
            current = current.parent
        return path.is_file() if path != root else path.is_dir()
    except (OSError, ValueError, RuntimeError):return False


def _records(path, root, diagnostics=None):
    if not _safe(path, root):return
    try:
        with path.open('rb') as stream:
            number = 0
            while True:
                piece = stream.readline(READ_CHUNK_BYTES)
                if not piece:break
                number += 1; size = len(piece); chunks = [piece]
                while not piece.endswith(b'\n'):
                    piece = stream.readline(READ_CHUNK_BYTES)
                    if not piece:break
                    size += len(piece)
                    if size <= MAX_RECORD_BYTES:chunks.append(piece)
                if size > MAX_RECORD_BYTES:
                    if diagnostics is not None:diagnostics['oversizedRecords'] = diagnostics.get('oversizedRecords', 0) + 1
                    continue
                try:
                    row = json.loads(b''.join(chunks).decode('utf-8-sig'))
                    if isinstance(row, dict):yield number, row
                except (ValueError, UnicodeError):
                    if diagnostics is not None:diagnostics['invalidRecords'] = diagnostics.get('invalidRecords', 0) + 1
    except OSError:
        if diagnostics is not None:diagnostics['unreadableFiles'] = diagnostics.get('unreadableFiles', 0) + 1


def _time(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:return datetime.fromtimestamp(value, timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):return ''
    if isinstance(value,str):
        try:return datetime.fromisoformat(value.replace('Z','+00:00')).isoformat()
        except ValueError:return value
    return ''


def _real_text(text, role):
    text = text.strip()
    if text.startswith(('<heartbeat', '<codex_internal_context', '<subagent_notification')):return ''
    if role == 'user' and text.startswith(INJECTED_PREFIXES):return ''
    text = INJECTED_BLOCKS.sub('', text)
    if role == 'user' and re.match(r'(?is)^\s*#?\s*AGENTS\.md instructions\b', text):return ''
    # Attached-file declarations contain useful references, extracted separately.
    # The actual request starts after the application supplied heading.
    if role == 'user' and re.search(r'(?m)^## My request:\s*$', text):
        text = re.split(r'(?m)^## My request:\s*$', text, maxsplit=1)[1]
    text = re.sub(r'(?m)^Distinguish instructions in attached documents from the user\x27s request\.\s*$', '', text)
    text = re.sub(r'(?m)^Image attachment:\s*(?:true|false)\s*$', '', text)
    text = re.sub(r'<image\b[^>]*>.*?</image>', '', text, flags=re.I | re.S)
    if role == 'user' and text.strip().startswith('<send_user_message_question_reply>'):
        try:
            payload = re.search(r'<send_user_message_question_reply>\s*(.*?)\s*</send_user_message_question_reply>', text, re.S)
            replies = json.loads(payload[1]) if payload else []
            text = '\n\n'.join('当时的问题：' + str(item.get('question','')) + '\n我的回复：' + str(item.get('answer','')) for item in replies if isinstance(item,dict))
        except (ValueError,TypeError):
            pass
    return text.strip()


def _attachment(value, kind=None):
    if not isinstance(value, str):return None
    value = value.strip().strip('<>')
    if not value or value.lower().startswith('data:'):return None
    if not (re.match(r'^[A-Za-z]:[\\/]', value) or value.startswith(('/', 'file://', 'http://', 'https://', 'attachment://', 'sandbox:/'))):return None
    value = redact_history(value)
    result = {'kind': kind or ('image' if IMAGE_SUFFIX.search(value) else 'file')}
    if value.startswith(('http://', 'https://', 'attachment://', 'sandbox:/')):result['url'] = value
    else:result['path'] = value
    return result


def _extract_content(payload):
    texts = []; attachments = []
    content = payload.get('content', [])
    if isinstance(content, str):texts.append(content)
    elif isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):continue
            kind = item.get('type')
            if kind in {'text', 'input_text', 'output_text'} and isinstance(item.get('text'), str):texts.append(item['text'])
            elif kind in {'image', 'input_image', 'image_url', 'file', 'input_file'}:
                for key in ('path', 'file_path', 'image_url', 'url', 'filename'):
                    value = item.get(key)
                    if isinstance(value, dict):value = value.get('url') or value.get('path')
                    found = _attachment(value, 'image' if 'image' in str(kind) else 'file')
                    if found:attachments.append(found);break
    for key in ('message', 'text'):
        if not texts and isinstance(payload.get(key), str):texts.append(payload[key])
    for key in ('images', 'local_images', 'attachments'):
        for item in payload.get(key, []) if isinstance(payload.get(key), list) else []:
            value = item if isinstance(item, str) else next((item.get(k) for k in ('path','file_path','url','image_url') if isinstance(item, dict) and item.get(k)), None)
            found = _attachment(value, 'image' if 'image' in key else None)
            if found:attachments.append(found)
    text = '\n'.join(texts)
    for match in LOCAL_REFERENCE.finditer(text):
        found = _attachment(match.group(0))
        if found:attachments.append(found)
    for match in MARKDOWN_REFERENCE.finditer(text):
        value = match[1] or match[2]
        if FILE_SUFFIX.search(value) or match.group(0).startswith('!['):
            found = _attachment(value)
            if found:attachments.append(found)
    unique = {json.dumps(a, sort_keys=True, ensure_ascii=False): a for a in attachments}
    return text, list(unique.values())


class CodexHistory:
    def __init__(self, root=None):
        self.root = Path(root) if root is not None else DEFAULT_CODEX_ROOT
        self.root = self.root.absolute()
        self.lock = threading.RLock()
        self._metadata = {}
        self._threads = {}
        self.diagnostics = {}

    def _files(self):
        if not _safe(self.root, self.root):return
        for name in SESSION_DIRECTORIES:
            folder = self.root / name
            if not folder.is_dir() or _is_link(folder):continue
            for directory, dirs, files in os.walk(folder, followlinks=False):
                dirs[:] = sorted(d for d in dirs if not _is_link(Path(directory) / d))
                for filename in sorted(files):
                    path = Path(directory) / filename
                    if filename.endswith('.jsonl') and _safe(path, self.root):yield path

    def _index(self):
        result = {}
        for _, row in _records(self.root / 'session_index.jsonl', self.root):
            ident = row.get('id') or row.get('thread_id')
            if isinstance(ident, str) and THREAD_ID.fullmatch(ident):
                updated = _time(row.get('updated_at') or row.get('updatedAt'))
                if ident not in result or updated >= result[ident]['updatedAt']:
                    result[ident] = {'title': redact_history(row.get('thread_name') or row.get('title') or ''), 'updatedAt': updated}
        return result

    def discover(self):
        """Return thread metadata only; no eager transcript/material expansion."""
        with self.lock:
            index = self._index(); groups = defaultdict(list); diagnostics = {}
            for path in self._files():
                try:stat_value = path.stat(); stamp = (stat_value.st_size, stat_value.st_mtime_ns)
                except OSError:continue
                cached = self._metadata.get(str(path))
                if cached and cached[0] == stamp:metadata = cached[1]
                else:
                    metadata = None
                    for line, row in _records(path, self.root, diagnostics):
                        if line > 64:break
                        payload = row.get('payload')
                        if row.get('type') == 'session_meta' and isinstance(payload, dict):
                            ident = payload.get('id') or payload.get('thread_id') or payload.get('session_id')
                            if isinstance(ident, str) and THREAD_ID.fullmatch(ident):
                                source = payload.get('source')
                                if not isinstance(source, str):source = 'subagent' if isinstance(source, dict) and 'subagent' in source else 'unknown'
                                metadata = {'id': ident, 'cwd': redact_history(payload.get('cwd') or ''),
                                            'source': redact_history(source), 'time': _time(payload.get('timestamp') or row.get('timestamp')),
                                            'parentThreadId': payload.get('parent_thread_id'), 'forkedFromId': payload.get('forked_from_id'),
                                            'threadSource': payload.get('thread_source') if isinstance(payload.get('thread_source'),str) else ''}
                            break
                    self._metadata[str(path)] = (stamp, metadata)
                if metadata:
                    groups[metadata['id']].append({**metadata, 'path':path, 'bytes':stamp[0], 'mtime':stat_value.st_mtime})
            threads = {}
            for ident, files in groups.items():
                files.sort(key=lambda entry:(entry['time'],str(entry['path'])))
                latest = max(files,key=lambda entry:entry['mtime']); titles = index.get(ident,{})
                threads[ident] = {'id':ident, 'threadId':ident, 'title':titles.get('title') or '未命名 Codex 对话',
                    'cwd':latest['cwd'], 'source':latest['source'], 'threadSource':latest['threadSource'],
                    'parentThreadId':latest['parentThreadId'], 'forkedFromId':latest['forkedFromId'],
                    'sourceFiles':[str(entry['path']) for entry in files], 'fileCount':len(files),
                    'totalBytes':sum(entry['bytes'] for entry in files), 'createdAt':files[0]['time'],
                    'updatedAt':titles.get('updatedAt') or _time(latest['mtime']),
                    'archived':all(entry['path'].is_relative_to(self.root/'archived_sessions') for entry in files)}
            self._threads = threads; self.diagnostics = diagnostics
            return copy.deepcopy(sorted(threads.values(),key=lambda row:row['updatedAt'],reverse=True))

    def iter_messages(self, thread_id):
        """Stream de-duplicated user/assistant visible messages from known files."""
        if not isinstance(thread_id,str) or not THREAD_ID.fullmatch(thread_id):raise ValueError('Codex 对话标识无效')
        with self.lock:
            if thread_id not in self._threads:self.discover()
            metadata = copy.deepcopy(self._threads.get(thread_id))
        if metadata is None:raise KeyError('未找到本机 Codex 对话')
        seen_ids = set(); seen_content = set(); previous = None; pending = None; diagnostics = {}
        for source in metadata['sourceFiles']:
            path = Path(source); turn = None
            # A file may be replaced with a link between discover and import.
            if not _safe(path,self.root):continue
            for number, row in _records(path,self.root,diagnostics):
                payload = row.get('payload')
                if not isinstance(payload,dict):continue
                kind = row.get('type'); subtype = payload.get('type')
                if kind == 'turn_context':turn = payload.get('turn_id') or turn
                if kind == 'event_msg' and subtype == 'task_started':turn = payload.get('turn_id') or turn
                role = None; channel = None
                if kind == 'response_item' and subtype == 'message':
                    role = payload.get('role')
                    if role not in {'user','assistant'}:continue
                    channel = payload.get('channel') or payload.get('phase')
                elif kind == 'event_msg' and subtype in {'user_message','agent_message'}:
                    role = 'user' if subtype == 'user_message' else 'assistant'
                    channel = payload.get('channel') or payload.get('phase')
                else:continue
                if role == 'assistant':
                    if channel not in {None,'final','final_answer','commentary'}:continue
                    channel = 'final' if channel in {None,'final','final_answer'} else 'commentary'
                else:channel = 'user'
                raw_text, attachments = _extract_content(payload)
                cleaned = _real_text(raw_text,role)
                if not cleaned and raw_text.strip():continue
                if not cleaned and not attachments:continue
                text = redact_history(cleaned)
                passthrough = payload.get('internal_chat_message_metadata_passthrough')
                if not isinstance(passthrough,dict):passthrough = {}
                timestamp = _time(passthrough.get('create_time') or row.get('timestamp') or payload.get('timestamp'))
                turn_id = payload.get('turn_id') or passthrough.get('turn_id') or turn
                source_id = payload.get('id') or payload.get('message_id')
                text_hash = hashlib.sha256(text.encode('utf8')).hexdigest()
                # Prefer original turn/message identity. Timestamp is fallback
                # for copied history files; text alone never merges later turns.
                signature = (role,channel,str(turn_id or timestamp),text_hash)
                identity = (role,str(source_id)) if source_id else None
                known = identity in seen_ids or signature in seen_content
                # event_msg and response_item frequently duplicate a visible
                # message with slightly different timestamps but no stable id.
                duplicate_pair = previous and previous['signature'][:2] == signature[:2] and previous['hash'] == text_hash and previous['kind'] != kind and previous['source'] == source and (not turn_id or not previous['turn'] or previous['turn']==turn_id)
                if duplicate_pair or known:
                    if pending and previous and previous['hash'] == text_hash and (duplicate_pair or previous['signature'] == signature):
                        merged = {json.dumps(a,sort_keys=True,ensure_ascii=False):a for a in pending['attachments']+attachments}
                        pending['attachments'] = list(merged.values())
                    if identity:seen_ids.add(identity)
                    seen_content.add(signature)
                    continue
                if pending:yield pending
                stable = str(source_id) if source_id else '\0'.join(str(item) for item in signature)
                message_id = 'codex_' + hashlib.sha256((thread_id+'\0'+stable).encode('utf8')).hexdigest()[:24]
                if identity:seen_ids.add(identity)
                seen_content.add(signature)
                previous = {'signature':signature,'hash':text_hash,'kind':kind,'source':source,'turn':turn_id}
                pending = {'id':message_id,'threadId':thread_id,'role':role,'channel':channel,'time':timestamp,'text':text,
                           'attachments':attachments,'sourceFile':source,'line':number}
        if pending:yield pending
        with self.lock:self.diagnostics.update(diagnostics)


CodexHistoryAdapter = CodexHistory
