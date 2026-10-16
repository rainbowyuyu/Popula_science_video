/* Exercise the real navigation script with local events; no browser/network/model calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../web/app-navigation.js'), 'utf8');
const navigationKey = 'rainbow-workbench:navigation';
const flush = async () => { for (let n = 0; n < 4; n++) await new Promise(setImmediate); };

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type, extras = {}) {
    const event = {type, defaultPrevented: false, button: 0,
      preventDefault() { this.defaultPrevented = true; }, ...extras};
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
}

function fixture({pathname = '/', nativeReveal = true, reducedMotion = false,
  stored = null, from = null, denyStorage = false} = {}) {
  const classes = new Set(), classAdds = [], navigation = [], storage = new Map();
  if (stored !== null) storage.set(navigationKey, typeof stored === 'string' ? stored : JSON.stringify(stored));
  const root = {dataset: {}, classList: {
    add: name => { classes.add(name); classAdds.push(name); }, remove: name => classes.delete(name),
  }};
  const link = href => Object.assign(new Events(), {href: new URL(href, 'http://127.0.0.1:8765/').href});
  const links = {create: link('/'), learn: link('/learning.html'), brand: link('/')};
  const document = Object.assign(new Events(), {
    documentElement: root, querySelectorAll: () => Object.values(links),
  });
  const window = new Events(); if (nativeReveal) window.onpagereveal = null;
  if (from) window.navigation = {activation: {from: {url: new URL(from, 'http://127.0.0.1:8765/').href}}};
  const location = {href: 'http://127.0.0.1:8765' + pathname,
    origin: 'http://127.0.0.1:8765', assign: value => navigation.push(value)};
  const sessionStorage = {
    getItem: key => { if (denyStorage) throw new Error('Storage unavailable'); return storage.get(key) || null; },
    setItem: (key, value) => { if (denyStorage) throw new Error('Storage unavailable'); storage.set(key, value); },
    removeItem: key => { if (denyStorage) throw new Error('Storage unavailable'); storage.delete(key); },
  };
  vm.runInNewContext(source, {document, window, location, sessionStorage, URL, Date,
    matchMedia: () => ({matches: reducedMotion})});
  return {root, classes, classAdds, document, window, location, links, storage, navigation};
}

test('clicking the active surface does not reload or store a navigation', () => {
  for (const [pathname, linkName] of [['/', 'create'], ['/learning.html', 'learn']]) {
    const f = fixture({pathname}); const click = f.links[linkName].dispatch('click');
    assert.equal(click.defaultPrevented, true); assert.equal(f.navigation.length, 0);
    assert.equal(f.storage.size, 0); assert.equal(f.root.dataset.navDirection, undefined);
  }
});

test('modified, middle-button and already-handled clicks preserve native behavior', () => {
  const cases = [{ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true},
    {button: 1}, {defaultPrevented: true}];
  for (const extras of cases) {
    const f = fixture(), click = f.links.learn.dispatch('click', extras);
    assert.equal(click.defaultPrevented, Boolean(extras.defaultPrevented));
    assert.equal(f.storage.size, 0); assert.equal(f.navigation.length, 0);
  }
});

test('ordinary cross-surface links retain same-tab navigation and save transition direction', () => {
  const f = fixture(), click = f.links.learn.dispatch('click');
  assert.equal(click.defaultPrevented, false); assert.equal(f.navigation.length, 0);
  assert.equal(f.root.dataset.navDirection, 'forward');
  const pending = JSON.parse(f.storage.get(navigationKey));
  assert.equal(pending.to, 'learn'); assert.equal(pending.direction, 'forward');
  assert.ok(Math.abs(Date.now() - pending.at) < 1000);
  const back = fixture({pathname: '/learning.html'}); back.links.brand.dispatch('click');
  assert.equal(JSON.parse(back.storage.get(navigationKey)).direction, 'back');
});

test('programmatic navigation uses location.assign and rejects external origins', () => {
  const f = fixture(); f.window.WorkbenchNavigation.go('/learning.html');
  assert.deepEqual(f.navigation, ['http://127.0.0.1:8765/learning.html']);
  assert.equal(JSON.parse(f.storage.get(navigationKey)).direction, 'forward');
  f.window.WorkbenchNavigation.go('https://example.org/learning.html'); assert.equal(f.navigation.length, 1);
});

test('saved navigation enters with a CSS fallback only when native reveal is unavailable', () => {
  const pending = {to: 'learn', direction: 'forward', at: Date.now()};
  const fallback = fixture({pathname: '/learning.html', nativeReveal: false, stored: pending});
  assert.equal(fallback.root.dataset.navDirection, 'forward');
  assert.ok(fallback.classes.has('app-navigation-enter')); assert.equal(fallback.storage.size, 0);
  const native = fixture({pathname: '/learning.html', stored: pending});
  assert.equal(native.root.dataset.navDirection, 'forward'); assert.equal(native.classAdds.length, 0);
  for (const stored of [{...pending, at: Date.now() - 30000}, {...pending, to: 'create'}, 'invalid json']) {
    const ignored = fixture({pathname: '/learning.html', nativeReveal: false, stored});
    assert.equal(ignored.classAdds.length, 0); assert.equal(ignored.root.dataset.navDirection, undefined);
  }
});

test('native reveal rejection falls back without an unhandled promise rejection', async () => {
  const f = fixture({pathname: '/learning.html', from: '/'}), unhandled = [];
  const listen = error => unhandled.push(error); process.on('unhandledRejection', listen);
  try {
    f.window.dispatch('pagereveal', {viewTransition: {
      ready: Promise.reject(new Error('Transition skipped')), finished: Promise.reject(new Error('Transition finished early')),
    }});
    await flush(); assert.equal(unhandled.length, 0);
    assert.equal(f.root.dataset.navDirection, 'forward'); assert.ok(f.classes.has('app-navigation-enter'));
  } finally { process.removeListener('unhandledRejection', listen); }
});

test('a working native reveal does not add a second CSS animation', async () => {
  const f = fixture({pathname: '/learning.html', from: '/'});
  f.window.dispatch('pagereveal', {viewTransition: {ready: Promise.resolve(), finished: Promise.resolve()}});
  f.window.dispatch('pageshow', {persisted: false}); await flush();
  assert.equal(f.root.dataset.navDirection, 'forward'); assert.equal(f.classAdds.length, 0);
});

test('pageswap consumes skipped transition promises and keeps outgoing direction', async () => {
  const f = fixture(), unhandled = []; const listen = error => unhandled.push(error);
  process.on('unhandledRejection', listen);
  try {
    assert.doesNotThrow(() => f.window.dispatch('pageswap', {
      activation: {entry: {url: 'http://127.0.0.1:8765/learning.html'}},
      viewTransition: {ready: Promise.reject(new Error('Skipped')), finished: Promise.reject(new Error('Skipped'))},
    }));
    await flush(); assert.equal(unhandled.length, 0); assert.equal(f.root.dataset.navDirection, 'forward');
    assert.equal(f.classAdds.length, 0);
    assert.doesNotThrow(() => f.window.dispatch('pageswap'));
  } finally { process.removeListener('unhandledRejection', listen); }
});

test('reduced motion never starts a fallback on load, rejection or history restoration', async () => {
  const f = fixture({reducedMotion: true, nativeReveal: false, pathname: '/learning.html', from: '/',
    stored: {to: 'learn', direction: 'forward', at: Date.now()}});
  f.window.dispatch('pagereveal', {viewTransition: {ready: Promise.reject(new Error('Skipped')), finished: Promise.resolve()}});
  f.window.dispatch('pageshow', {persisted: true}); await flush();
  assert.equal(f.root.dataset.navDirection, 'forward'); assert.equal(f.classAdds.length, 0);
});

test('history return derives its back direction from activation and safely enters once', () => {
  const f = fixture({pathname: '/', from: '/learning.html'});
  f.window.dispatch('pagereveal'); assert.equal(f.root.dataset.navDirection, 'back');
  f.window.dispatch('pageshow', {persisted: true}); assert.equal(f.classAdds.length, 1);
  f.document.dispatch('animationend', {animationName: 'unrelated'});
  assert.ok(f.classes.has('app-navigation-enter'));
  f.document.dispatch('animationend', {animationName: 'app-surface-in'});
  assert.equal(f.classes.has('app-navigation-enter'), false);
});

test('pageshow fallback and pagehide reset support repeated bfcache restoration', () => {
  const f = fixture({pathname: '/learning.html', stored: {to: 'learn', direction: 'forward', at: Date.now()}});
  f.window.dispatch('pageshow', {persisted: false}); assert.equal(f.classAdds.length, 1);
  f.window.dispatch('pagehide'); assert.equal(f.classes.has('app-navigation-enter'), false);
  f.window.dispatch('pageshow', {persisted: true}); assert.equal(f.classAdds.length, 2);
  f.document.dispatch('animationcancel', {animationName: 'app-surface-in'});
  assert.equal(f.classes.has('app-navigation-enter'), false);
});

test('blocked session storage does not break normal navigation', () => {
  const f = fixture({denyStorage: true});
  assert.doesNotThrow(() => f.links.learn.dispatch('click'));
  assert.doesNotThrow(() => f.window.WorkbenchNavigation.go('/learning.html'));
  assert.equal(f.root.dataset.navDirection, 'forward'); assert.equal(f.navigation.length, 1);
});
