/*
 * Capture evidence from the running AI Engineer web application.
 *
 * This deliberately uses only local routes and local UI controls. It never
 * submits a Qwen request or starts a solver; the resulting images document
 * the product's real interface states for the launch film.
 */
const { chromium } = require('C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public', 'beso-research', 'web-live');
fs.mkdirSync(out, { recursive: true });
const base = process.env.AI_ENGINEER_URL || 'http://127.0.0.1:8018';
const report = { capturedAt: new Date().toISOString(), base, localOnly: true, frames: [] };

async function capture(page, id, label, extra = {}) {
  const file = path.join(out, `${id}.png`);
  await page.screenshot({ path: file, type: 'png' });
  const title = await page.title().catch(() => '');
  const url = page.url();
  report.frames.push({ id, label, file: path.relative(root, file).replaceAll('\\', '/'), url, title, ...extra });
  console.log(`${id}: ${url}`);
}

async function waitUi(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1400);
  await page.locator('#ddStageBusyOverlay').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(650);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') console.warn('[page]', msg.text()); });

  // Home/brief: the prompt is typed into the real product composer.
  await page.goto(`${base}/ui/`, { waitUntil: 'networkidle', timeout: 60000 });
  await waitUi(page);
  await page.locator('#landingIntroSceneSkip').click().catch(() => {});
  await page.waitForTimeout(500);
  await capture(page, '01-home', 'AI Engineer home workspace');
  const prompt = '设计一个 20 MW 漂浮式风机基础，控制用钢量，检查强度、疲劳与平台稳定性。';
  await page.locator('#msgLanding').fill(prompt).catch(() => {});
  await page.locator('#landingToggleDeepThink').click().catch(() => {});
  await page.locator('#landingToggleAssistantTools').click().catch(() => {});
  await page.waitForTimeout(450);
  await capture(page, '02-prompt', 'Prompt and tool toggles', { prompt });

  // Design domain and preview. Clicking the local navigation buttons is safe:
  // no chat or solver request is sent.
  await page.locator('#landingEnterDesignDomainBtn').click().catch(() => {});
  await waitUi(page);
  await capture(page, '03-design-domain', 'Design domain workbench');
  const preview = page.locator('.ddIdeViewSegBtn').filter({ hasText: '预览' }).first();
  await preview.click().catch(() => {});
  await page.waitForTimeout(900);
  await capture(page, '04-design-preview', 'Design domain 3D preview');

  // Topology and analysis workspaces, where the product exposes the actual
  // navigation hierarchy used in the launch narrative.
  await page.locator('#designDomainToTopoBtn').click().catch(() => {});
  await waitUi(page);
  await capture(page, '05-topology', 'BESO topology workspace');
  await page.locator('#flowToAnalysisBtn').click().catch(() => {});
  await waitUi(page);
  await capture(page, '06-analysis', 'Time-domain analysis workspace');
  await page.locator('#flowToReviewBtn').click().catch(() => {});
  await waitUi(page);
  await capture(page, '07-review', 'AI Review workspace');

  fs.writeFileSync(path.join(out, 'capture-evidence.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(`saved ${report.frames.length} frames to ${out}`);
})().catch(err => { console.error(err); process.exitCode = 1; });
