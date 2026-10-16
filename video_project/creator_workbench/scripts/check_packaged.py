"""Exercise the actual EXE, local HTTP media, and bundled web UI without API billing."""
from pathlib import Path
import ctypes
import hashlib
import http.cookiejar
import json
import subprocess
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
exe = ROOT / 'output/RainbowVideoWorkbench.exe'
runtime = ROOT / 'work/runtime.json'
process = subprocess.Popen([str(exe), '--no-browser', '--port', '8765'], cwd=ROOT,
                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
deadline = time.monotonic() + 45
while time.monotonic() < deadline:
    if runtime.exists():
        state = json.loads(runtime.read_text(encoding='utf8'))
        base = 'http://127.0.0.1:' + str(state['port'])
        try:
            health = json.load(urllib.request.urlopen(base + '/health', timeout=2))
            if health['app'] == 'rainbow-creator-workbench':
                break
        except (OSError, ValueError):
            pass
    time.sleep(.25)
else:
    raise RuntimeError('Packaged server did not become ready')

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_bool, ctypes.c_ulong]
kernel.OpenProcess.restype = ctypes.c_void_p
kernel.QueryFullProcessImageNameW.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_ulong)]
kernel.CloseHandle.argtypes = [ctypes.c_void_p]
handle = kernel.OpenProcess(0x1000, False, state['pid'])
buffer = ctypes.create_unicode_buffer(32768)
size = ctypes.c_ulong(len(buffer))
try:
    assert handle and kernel.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size))
    assert Path(buffer.value).resolve() == exe.resolve(), 'Server is not the packaged executable'
finally:
    if handle:
        kernel.CloseHandle(handle)

jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
with client.open(base + '/?launch=' + state['token'], timeout=15) as response:
    assert response.geturl() == base + '/'
    assert b'video-preview' in response.read()
boot = json.load(client.open(base + '/api/bootstrap', timeout=45))
assert boot['projects'] and any(s['name'] == 'video-creative' for s in boot['skills'])
assert {p['id'] for p in boot['providers']} == {'openai', 'claude'}
assert all(p['configured'] for p in boot['providers'])
media = json.load(client.open(base + '/api/projects/' + boot['selectedProjectId'] + '/media'))['items']
video = next(m for m in media if m['kind'] == 'video')
with client.open(urllib.request.Request(base + video['url'], method='HEAD')) as response:
    assert response.headers['Accept-Ranges'] == 'bytes'
    total = int(response.headers['Content-Length'])
with client.open(urllib.request.Request(base + video['url'], headers={'Range': 'bytes=0-1023'})) as response:
    assert response.status == 206 and len(response.read()) == 1024
    assert response.headers['Content-Range'] == f'bytes 0-1023/{total}'
again = subprocess.run([str(exe), '--no-browser'], cwd=ROOT, timeout=20,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
assert again.returncode == 0
assert json.loads(runtime.read_text())['pid'] == state['pid']

qa_dir = ROOT / 'work/packaged-qa'
qa_dir.mkdir(exist_ok=True)
errors = []
def wait_video(page, expression, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if page.locator('#video-preview').evaluate(expression):
            return
        time.sleep(.1)
    raise AssertionError('Video state did not reach expected value')

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    context.add_cookies([{'name': c.name, 'value': c.value, 'url': base, 'httpOnly': True, 'sameSite': 'Strict'} for c in jar])
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base, wait_until='domcontentloaded')
    wait_video(page, '(v) => v.readyState >= 2', 45)
    duration = page.locator('#video-preview').evaluate('(v) => v.duration')
    page.locator('#video-preview').evaluate('(v) => { v.muted=true; return v.play(); }')
    wait_video(page, '(v) => v.currentTime > .5', 12)
    page.locator('#video-preview').evaluate('(v) => { v.pause(); v.currentTime=85; }')
    wait_video(page, '(v) => Math.abs(v.currentTime - 85) < .2 && !v.seeking', 15)
    page.screenshot(path=str(qa_dir / 'wide.png'), full_page=True)
    page.set_viewport_size({'width': 420, 'height': 960})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(qa_dir / 'narrow.png'), full_page=True)
    assert not errors, errors
    browser.close()

report = {
    'packagedExecutable': str(exe), 'sha256': hashlib.sha256(exe.read_bytes()).hexdigest(),
    'actualExeProcess': True, 'launchCookieExchange': True, 'repeatLaunchReusesServer': True,
    'totals': boot['totals'], 'providersConfigured': [p['id'] for p in boot['providers']],
    'mediaHead': True, 'mediaRange': True, 'videoDuration': duration, 'videoPlayAndSeek85s': True,
    'responsiveNoOverflow': True, 'browserErrors': errors,
    'liveConnectionChecks': json.loads((ROOT / 'work/connection-checks.json').read_text(encoding='utf8')),
    'liveToolChecks': json.loads((ROOT / 'work/live-tools-report.json').read_text(encoding='utf8')),
    'noAdditionalPaidCallsInPackagedCheck': True,
    'screenshots': [str(qa_dir / 'wide.png'), str(qa_dir / 'narrow.png')],
}
(ROOT / 'output/verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if not k.startswith('live')}, ensure_ascii=True, indent=2))
