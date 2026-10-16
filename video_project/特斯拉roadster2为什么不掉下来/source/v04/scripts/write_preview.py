"""Write the local viewing page from the measured narration timeline."""
from pathlib import Path
import html, json

root = Path(__file__).resolve().parents[1]
out = root.parents[1] / 'output/v04'
out.mkdir(parents=True, exist_ok=True)
n = json.loads((root/'src/narration.json').read_text(encoding='utf8'))
names = ['开场谜题', '吸盘与压差', '倒挂受力', '离开轨道', '冷气推力', '翻滚力矩', '姿态控制', '储气与限制', '回看原理']
buttons = ''.join(f'<button type="button" data-time="{g["startSec"]}"><span>{int(g["startSec"])//60}:{int(g["startSec"])%60:02d}</span>{label}</button>' for g,label in zip(n['groups'],names))
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roadster 为什么倒挂不掉？｜rainbow鱼</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edf0ea;color:#20363b;font:16px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1280px;margin:auto;padding:32px 30px 60px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:24px}.brand{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:750}.brand img{width:42px;height:50px;object-fit:contain}.series{color:#687d7e;font-size:14px}h1{font-size:clamp(25px,3vw,42px);line-height:1.25;letter-spacing:-1px;margin:18px 0 10px}.subtitle{color:#5a7378;margin:0 0 24px}.player{background:#192529;border-radius:18px;overflow:hidden;box-shadow:0 16px 50px #213c4521}video{display:block;width:100%;aspect-ratio:16/9}.chapters{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}button,.download{background:#fff9;border:1px solid #b7c6c54f;border-radius:11px;padding:10px 14px;color:#29484e;cursor:pointer;font:inherit;text-decoration:none;transition:background .2s,transform .2s}button:hover,.download:hover{background:#fff;transform:translateY(-1px)}button span{color:#738b8d;font-size:13px;margin-right:8px}footer{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:24px}a{color:#207d89;text-underline-offset:3px}.sources{margin-top:28px;padding-top:20px;border-top:1px solid #233b4120;color:#526b70;max-width:1000px}.sources p{margin:8px 0}.sources a{margin-right:15px}#status{color:#72898c;font-size:13px;margin-left:auto}@media(max-width:650px){main{padding:20px 14px}.series{font-size:12px}header{gap:12px}.player{border-radius:10px}button{padding:8px 10px;font-size:14px}#status{margin-left:0}}
</style><main>
<header><div class="brand"><img src="../../source/v04/public/brand/logo.png" alt="rainbow鱼标志">rainbow鱼</div><div class="series">每天5分钟科普 · 车辆力学</div></header>
<h1>倒挂不掉，还能空中翻滚？</h1>
<p class="subtitle">沿着空气和力的方向，看懂 Roadster。5 分 36 秒 · 1080p · 个人音色解说</p>
<div class="player"><video id="film" controls playsinline preload="metadata" poster="poster.jpg" src="Roadster_倒挂与飞行翻滚_1080p.mp4"></video></div>
<nav class="chapters" aria-label="视频章节">CHAPTERS</nav>
<footer><a class="download" href="Roadster_倒挂与飞行翻滚_1080p.mp4" download>下载完整视频</a><a href="../../subtitles/v04/Roadster_中文字幕.srt" download>中文字幕</a><a href="完整解说稿.md">解说稿</a><span id="status">点击章节可定位到对应讲解</span></footer>
<div class="sources"><p>一辆示意车，三个生活类比：吸盘解释倒挂，气球解释喷气，推门解释翻滚。</p><p><a href="https://www.youtube.com/watch?v=qt5p-_tE8d0&amp;t=363s" target="_blank" rel="noopener">官方倒挂演示 · 06:03</a><a href="https://www.youtube.com/watch?v=qt5p-_tE8d0&amp;t=656s" target="_blank" rel="noopener">官方翻滚演示 · 10:56</a><a href="../../research/sources.md">完整资料来源</a></p><p>片中车辆、喷嘴位置和慢动作是原创教学示意；1500 kg、3 m² 等为假设算例。真实专利及来源列在片尾。</p></div>
</main><script>
const film=document.querySelector('#film');document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{film.currentTime=Number(b.dataset.time);film.play();document.querySelector('#status').textContent='正在播放：'+b.textContent;}));
film.addEventListener('error',()=>document.querySelector('#status').textContent='视频暂不可用，请确认完整 MP4 位于此页面旁边。');
</script></html>'''
(out/'preview.html').write_text(page.replace('CHAPTERS',buttons),encoding='utf8')
print('Viewing page written:', out/'preview.html')
