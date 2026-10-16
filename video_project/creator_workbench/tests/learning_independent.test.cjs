/* Local DOM/transport contracts only. No browser, network, media writes or model calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '../web/learning.html'), 'utf8');
const code = fs.readFileSync(path.join(__dirname, '../web/learning.js'), 'utf8');

class Element {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toLowerCase(); this.attrs = {...attrs}; this.children = [];
    this.listeners = {}; this.dataset = {}; this.value = attrs.value || '';
    this.defaultValue = this.value; this.disabled = 'disabled' in attrs;
    this.hidden = 'hidden' in attrs; this.open = false; this.className = attrs.class || ''; this._text = '';
    for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) {
      this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    this.classList = {toggle: (name, enabled) => {
      const classes = new Set(this.className.split(/\s+/));
      enabled ? classes.add(name) : classes.delete(name); this.className = [...classes].join(' ');
    }};
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  append(...nodes) { for (const n of nodes) { this.children.push(n); n.parent = this; } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  dispatch(type, extras = {}) {
    for (const callback of this.listeners[type] || []) callback({preventDefault() {}, target: this, ...extras});
  }
  matches(selector) {
    const match = selector.match(/^([\w-]+)?(?:\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\])?$/);
    return Boolean(match && (!match[1] || this.tagName === match[1]) &&
      (!match[2] || match[2] in this.attrs && (!match[3] || this.attrs[match[2]] === match[3])));
  }
  querySelectorAll(selector) {
    return this.children.flatMap(n => [...(n.matches(selector) ? [n] : []), ...n.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  focus() {} pause() {} load() {}
  reset() {
    for (const node of this.querySelectorAll('input')) node.value = node.defaultValue;
    for (const node of this.querySelectorAll('select')) node.value = '';
  }
  replaceWith(node) {
    const index = this.parent.children.indexOf(this); this.parent.children.splice(index, 1, node); node.parent = this.parent;
  }
}

function parseDocument() {
  const root = new Element('root'), stack = [root], ids = {};
  for (const token of html.match(/<[^>]+>|[^<]+/g)) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<!')) continue;
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
      const attrs = {};
      for (const match of token.matchAll(/\s([\w:-]+)(?:="([^"]*)")?/g)) attrs[match[1]] = match[2] ?? '';
      const node = new Element(tag, attrs); stack.at(-1).append(node);
      if (attrs.id) ids[attrs.id] = node;
      if (!['meta', 'link', 'img', 'input', 'br'].includes(tag)) stack.push(node);
    } else if (token.trim()) stack.at(-1)._text += token;
  }
  return {root, ids};
}
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };

async function fixture({projects = [], collections = [], tasks = [], store = new Map(),
  quickFailures = [], failListAfterSubmit = false, denyStorage = false} = {}) {
  const {root, ids} = parseDocument(), calls = [], timers = [], navigation = [], requests = new Map();
  const data = {collections: structuredClone(collections), tasks: structuredClone(tasks)};
  let sequence = 0, submitted = false, uuidCalls = 0;
  const document = {
    getElementById: id => ids[id] || null, createElement: tag => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
    querySelectorAll: selector => root.querySelectorAll(selector), hidden: false,
  };
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null; calls.push({url, body});
    let out = {}, ok = true;
    if (url === '/api/bootstrap') out = {projects, csrfToken: 'fixture'};
    else if (url === '/api/learning') {
      if (submitted && failListAfterSubmit) throw new Error('列表暂时不可用');
      out = structuredClone(data);
    } else if (body.action === 'learning.quick_start') {
      const failure = quickFailures.shift();
      if (failure === 'network') throw new Error('网络连接中断');
      if (failure === 'http') { ok = false; out = {error: '请先配置两个模型接口'}; }
      else {
        if (requests.has(body.clientRequestId)) out = requests.get(body.clientRequestId);
        else {
          sequence++;
          const reference = {id: `r${sequence}`, name: '输入视频', source: body.source,
            startSec: body.startSec, endSec: body.endSec, notes: body.notes};
          const collection = {id: `c${sequence}`, name: '镜头学习', independent: true,
            projectId: null, references: [reference]};
          const task = {id: `t${sequence}`, name: '独立试做', collectionId: collection.id,
            referenceId: reference.id, independent: true, targetProjectId: null,
            projectId: 'learning_internal_only', status: 'queued', message: '等待观察'};
          data.collections.push(collection); data.tasks.push(task);
          out = {collection, reference, tasks: [task]}; requests.set(body.clientRequestId, out);
        }
        submitted = true;
        if (failure === 'response-lost') throw new Error('服务端已接收，但响应连接中断');
      }
    } else if (body.action === 'learning.create') {
      out = {id: 'created', name: body.name, independent: !body.projectId,
        projectId: body.projectId || null, references: []}; data.collections.push(out);
    } else if (body.action === 'learning.import') out = {imported: 2};
    return {ok, json: async () => out};
  };
  const storageCheck = () => { if (denyStorage) throw new Error('Storage unavailable'); };
  const localStorage = {
    getItem: key => { storageCheck(); return store.get(key) || null; },
    setItem: (key, value) => { storageCheck(); store.set(key, value); },
    removeItem: key => { storageCheck(); store.delete(key); },
  };
  const location = {origin: 'http://127.0.0.1:8765', search: '', assign: value => navigation.push(value)};
  vm.runInNewContext(code, {document, fetch, localStorage, location, window: {},
    crypto: {randomUUID: () => { uuidCalls++; return randomUUID(); }},
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    URL, URLSearchParams, console, prompt: () => null});
  await flush();
  return {ids, calls, store, navigation, timers, data,
    get uuidCalls() { return uuidCalls; },
    get submissions() { return calls.filter(c => c.body?.action === 'learning.quick_start').map(c => c.body); },
    submit: async id => {
      ids[id].dispatch('submit', {submitter: ids[id].querySelector('button[type=submit]')}); await flush();
    },
  };
}

test('empty library can create a collection without a project or model call', async () => {
  const f = await fixture(); assert.equal(f.calls.filter(c => c.body).length, 0);
  assert.equal(f.ids.notice.hidden, true); assert.equal(f.ids['target-project'].getAttribute('required'), null);
  f.ids['new-collection'].dispatch('click'); assert.equal(f.ids['collection-dialog'].open, true);
  assert.equal(f.ids['target-project'].value, ''); f.ids['collection-name'].value = '独立运镜';
  await f.submit('collection-form');
  assert.deepEqual(f.calls.find(c => c.body?.action === 'learning.create').body,
    {action: 'learning.create', name: '独立运镜'});
});

test('quick start sends explicit source/segment, and independent tasks hide execution projects', async () => {
  const f = await fixture(); f.ids['quick-source'].value = ' D:\\参考\\video.mp4 ';
  f.ids['quick-notes'].value = ' 运镜连续性 '; f.ids['quick-start'].value = '3'; f.ids['quick-end'].value = '18';
  await f.submit('quick-learning-form'); const {clientRequestId, ...request} = f.submissions[0];
  assert.match(clientRequestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(request, {action: 'learning.quick_start', source: 'D:\\参考\\video.mp4',
    notes: '运镜连续性', startSec: 3, endSec: 18});
  assert.equal(f.ids['open-project'].hidden, true); assert.equal(f.ids['import-references'].disabled, true);
  assert.match(f.ids['collection-subtitle'].textContent, /独立学习/);
  const before = f.calls.length; f.ids['import-references'].dispatch('click'); await flush();
  assert.equal(f.calls.length, before);
  f.ids['task-list'].querySelectorAll('button').find(b => b.textContent === '查看进度').dispatch('click');
  await flush(); assert.match(f.ids['task-details'].textContent, /独立学习/);
  assert.doesNotMatch(f.ids['task-details'].textContent, /learning_internal_only|工程已移动|打开关联作品/);
});

test('navigation restores draft inputs without starting paid work during boot or polling', async () => {
  const f = await fixture(); f.ids['quick-source'].value = 'D:\\参考\\video.mp4';
  f.ids['quick-notes'].value = '连续性'; f.ids['quick-start'].value = '3'; f.ids['quick-end'].value = '18';
  f.ids['quick-source'].dispatch('input'); const restored = await fixture({store: f.store});
  assert.equal(restored.ids['quick-source'].value, 'D:\\参考\\video.mp4');
  assert.equal(restored.ids['quick-start'].value, '3'); assert.equal(restored.ids['quick-notes'].value, '连续性');
  await restored.timers[0](); await flush();
  assert.equal(restored.calls.filter(c => c.body).length, 0); assert.equal(restored.uuidCalls, 0);
});

test('HTTP and network retries preserve source and reuse the same request id', async () => {
  const f = await fixture({quickFailures: ['http', 'network']});
  f.ids['quick-source'].value = 'https://example.org/reference.mp4';
  await f.submit('quick-learning-form'); assert.match(f.ids['quick-learning-status'].textContent, /配置/);
  assert.equal(f.ids['quick-source'].value, 'https://example.org/reference.mp4');
  assert.equal(f.ids['quick-learning-form'].querySelector('button[type=submit]').disabled, false);
  await f.submit('quick-learning-form'); await f.submit('quick-learning-form');
  assert.equal(new Set(f.submissions.map(r => r.clientRequestId)).size, 1);
  assert.equal(f.uuidCalls, 1); assert.equal(f.data.tasks.length, 1);
});

test('failed submission keeps its request id across reload and avoids automatic retries', async () => {
  const failed = await fixture({quickFailures: ['network']});
  failed.ids['quick-source'].value = 'D:\\reference.mp4'; await failed.submit('quick-learning-form');
  const restored = await fixture({store: failed.store}); assert.equal(restored.submissions.length, 0);
  await restored.submit('quick-learning-form');
  assert.equal(restored.submissions[0].clientRequestId, failed.submissions[0].clientRequestId);
  assert.equal(restored.uuidCalls, 0);
});

test('retry after a lost accepted response recovers the existing task rather than duplicating work', async () => {
  const f = await fixture({quickFailures: ['response-lost']});
  f.ids['quick-source'].value = 'D:\\reference.mp4'; await f.submit('quick-learning-form');
  assert.equal(f.data.tasks.length, 1); assert.match(f.ids['quick-learning-status'].textContent, /状态待确认/);
  await f.submit('quick-learning-form');
  assert.equal(f.submissions[0].clientRequestId, f.submissions[1].clientRequestId);
  assert.equal(f.data.tasks.length, 1); assert.equal(f.data.collections.length, 1);
  assert.doesNotMatch(f.ids['quick-learning-status'].textContent, /状态待确认/);
});

test('changing source, notes or segment creates a different request; whitespace alone does not', async () => {
  const f = await fixture({quickFailures: ['network', 'network', 'network', 'network', 'network']});
  f.ids['quick-source'].value = 'D:\\reference.mp4'; await f.submit('quick-learning-form');
  f.ids['quick-source'].value = ' D:\\reference.mp4 '; await f.submit('quick-learning-form');
  f.ids['quick-source'].value = 'D:\\other.mp4'; await f.submit('quick-learning-form');
  f.ids['quick-notes'].value = '更关注构图'; await f.submit('quick-learning-form');
  f.ids['quick-end'].value = '20'; await f.submit('quick-learning-form');
  const ids = f.submissions.map(r => r.clientRequestId);
  assert.equal(ids[0], ids[1]); assert.equal(new Set(ids.slice(1)).size, 4); assert.equal(f.uuidCalls, 4);
});

test('a repeated successful quick start still identifies the same requested task', async () => {
  const f = await fixture(); f.ids['quick-source'].value = 'D:\\reference.mp4';
  await f.submit('quick-learning-form'); await f.submit('quick-learning-form');
  assert.equal(f.submissions[0].clientRequestId, f.submissions[1].clientRequestId);
  assert.equal(f.data.tasks.length, 1); assert.equal(f.uuidCalls, 1);
});

test('blocked local storage still retains retry identity within the open page', async () => {
  const f = await fixture({denyStorage: true, quickFailures: ['network']});
  f.ids['quick-source'].value = 'D:\\reference.mp4';
  await f.submit('quick-learning-form'); await f.submit('quick-learning-form');
  assert.equal(f.submissions[0].clientRequestId, f.submissions[1].clientRequestId);
  assert.equal(f.uuidCalls, 1); assert.equal(f.data.tasks.length, 1);
});

test('successful submission remains successful when the subsequent list refresh fails', async () => {
  const f = await fixture({failListAfterSubmit: true}); f.ids['quick-source'].value = 'D:\\reference.mp4';
  await f.submit('quick-learning-form');
  assert.match(f.ids['quick-learning-status'].textContent, /已加入|已开始|已排队|已提交/);
  assert.doesNotMatch(f.ids['quick-learning-status'].textContent, /提交状态待确认|未开始学习/);
  assert.equal(f.data.tasks.length, 1);
  await f.submit('quick-learning-form'); assert.equal(f.data.tasks.length, 1);
});

test('invalid segment makes no request and generates no request id', async () => {
  const f = await fixture(); f.ids['quick-source'].value = 'D:\\reference.mp4';
  f.ids['quick-start'].value = '15'; f.ids['quick-end'].value = '10'; await f.submit('quick-learning-form');
  assert.equal(f.submissions.length, 0); assert.equal(f.uuidCalls, 0);
  assert.match(f.ids['quick-learning-status'].textContent, /起止秒数/);
});

test('associated collections retain project navigation and new learned result fields', async () => {
  const f = await fixture({projects: [{id: 'p1', displayName: '实际影片'}],
    collections: [{id: 'c1', name: '作品参考', projectId: 'p1', independent: false, references: []}],
    tasks: [{id: 'learned', collectionId: 'c1', projectId: 'p1', status: 'completed', name: '样片任务',
      learned: {name: '有层次的转场', summary: '已复核运动连续性', rules: ['先跟随再移焦'],
        projectSkill: 'skills/motion.md'}, results: []}]});
  assert.equal(f.ids['import-references'].disabled, false); assert.equal(f.ids['open-project'].hidden, false);
  assert.match(f.ids['collection-subtitle'].textContent, /实际影片/);
  f.ids['open-project'].dispatch('click'); assert.deepEqual(f.navigation, ['/']);
  assert.equal(f.store.get('rainbow-workbench:project'), 'p1');
  assert.match(f.ids['result-list'].textContent, /有层次的转场.*已复核运动连续性.*先跟随再移焦/);
});
