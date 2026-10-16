"""Exercise the delivered single HTML in an offline file:// browser."""
import pathlib,json,datetime,hashlib
from playwright.sync_api import sync_playwright
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=HERE/'qa';OUT.mkdir(exist_ok=True)
DELIVERY=ROOT/'delivery/构件图册.html'
def main():
 checks={};errors=[];requests=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='C:/Users/zju/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  context=browser.new_context(viewport={'width':1680,'height':1050},device_scale_factor=1,offline=True)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.goto(DELIVERY.as_uri(),wait_until='load',timeout=120000)
  page.wait_for_function('window.__atlas?.ready || window.__atlas?.error',timeout=120000);page.wait_for_timeout(1400)
  initial=page.evaluate('window.__atlas');checks['all987MeshesLoaded']=initial['loaded']==987 and not initial['missing'];checks['all987NamesInList']=page.locator('.part-row').count()==987
  checks['allNamesSearchable']=page.evaluate('''()=>{const d=JSON.parse(document.getElementById('atlasData').textContent);return d.parts.every(p=>d.parts.filter(q=>`${q.id} ${q.nameChinese} ${q.labelChinese} ${q.locationChinese} ${q.categoryChinese}`.toLowerCase().includes(p.nameChinese.toLowerCase())).some(q=>q.id===p.id))}''')
  ids=page.evaluate('window.__atlasActions.allIds()');checks['987UniqueIds']=len(set(ids))==987
  page.screenshot(path=str(OUT/'desktop-overview.png'))
  page.click('[data-mode="explode"]');page.wait_for_timeout(1300);checks['explodeMode']=page.evaluate('window.__atlas.mode')=='explode';page.screenshot(path=str(OUT/'desktop-exploded.png'))
  before=page.evaluate('window.__atlasActions.camera().position');page.click('#rotate');page.wait_for_function('(before)=>window.__atlasActions.camera().position.reduce((s,v,i)=>s+Math.abs(v-before[i]),0)>.001',arg=before,timeout=15000);after=page.evaluate('window.__atlasActions.camera().position');checks['autoOrbitChangesCamera']=sum(abs(x-y) for x,y in zip(before,after))>.001;page.click('#rotate')
  page.fill('#search','铜板');page.wait_for_timeout(1200);checks['chineseSearchFindsPlate']=page.locator('.part-row').count()==1
  page.locator('.part-row').first.click();page.wait_for_timeout(1300);checks['selectedCorrectId']=page.evaluate('window.__atlas.selected')=='TMD_DAMPER_PLATE';checks['selectedNameCorrect']='铜板' in page.locator('#detailName').inner_text();page.screenshot(path=str(OUT/'desktop-selected-copper.png'))
  page.click('#isolate');page.wait_for_timeout(1000);checks['singlePartIsolation']=page.evaluate('window.__atlas.visible')==1
  page.click('#reset');page.wait_for_timeout(1200);checks['resetRestoresAll']=page.evaluate('window.__atlas.visible')==987 and page.evaluate('window.__atlas.selected') is None
  page.select_option('#category','outriggers');page.select_option('#zone','4');page.wait_for_timeout(1000)
  expected=page.evaluate("JSON.parse(document.getElementById('atlasData').textContent).parts.filter(p=>p.category==='outriggers'&&p.zone===4).length")
  checks['categoryAndZoneIntersection']=page.locator('.part-row').count()==expected and expected>0
  page.click('[data-mode="gallery"]');page.wait_for_timeout(1200);checks['galleryUsesPageLimit']=page.evaluate('window.__atlas.visible')==min(12,expected);page.screenshot(path=str(OUT/'desktop-gallery-outriggers.png'))
  first=page.locator('.tile-label').first.get_attribute('data-id');page.click('#next');page.wait_for_timeout(1100);checks['galleryPaginationChangesMeshes']=page.locator('.tile-label').first.get_attribute('data-id')!=first;page.locator('.tile-label').first.click();checks['gallerySelectionMatches']=page.evaluate('window.__atlas.selected')==page.locator('.tile-label').first.get_attribute('data-id')
  page.fill('#search','不存在的构件xyz');checks['emptyState']=page.locator('.list-empty').count()==1 and page.evaluate('window.__atlas.visible')==0
  page.click('#reset');page.click('[data-mode="gallery"]');page.wait_for_timeout(1200);page.screenshot(path=str(OUT/'desktop-gallery-all.png'))
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(1300);checks['mobileNoHorizontalOverflow']=page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  checks['mobileGalleryEight']=page.evaluate('window.__atlas.visible')==8;page.screenshot(path=str(OUT/'mobile-gallery.png'))
  checks['mobileLabelsClearOfControls']=page.evaluate("()=>{const controls=document.querySelector('.view-bottom').getBoundingClientRect();return [...document.querySelectorAll('.tile-label')].every(e=>e.getBoundingClientRect().bottom<controls.top)}")
  page.click('#menu');page.fill('#search','千吨质量箱');page.wait_for_timeout(400);checks['mobileSearchWorks']=page.locator('.part-row').count()==1;page.locator('.part-row').first.click()
  page.click('[data-mode="whole"]');page.wait_for_timeout(1200);page.click('#focus');page.wait_for_timeout(1200);page.screenshot(path=str(OUT/'mobile-selected.png'))
  checks['mobileSelectionCorrect']=page.evaluate('window.__atlas.selected')=='TMD_MASS'
  checks['noBrowserErrors']=not errors;checks['noRemoteRequests']=not any(u.startswith(('http:','https:')) for u in requests)
  stats=page.evaluate('window.__atlasActions.geometryStats()');browser.close()
 report=dict(createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),html=str(DELIVERY),sha256=hashlib.sha256(DELIVERY.read_bytes()).hexdigest(),offline=True,checks=checks,allPassed=all(checks.values()),browserErrors=errors,requests=requests,geometryStats=stats,screenshots=[str(x) for x in sorted(OUT.glob('*.png'))])
 (OUT/'interaction-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k not in ['requests','screenshots']},ensure_ascii=False,indent=2));assert report['allPassed']
if __name__=='__main__':main()
