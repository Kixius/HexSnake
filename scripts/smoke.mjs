// Headless smoke test: drives the running dev server with the system Chrome,
// captures any console/page errors, and confirms the canvas renders + a wall
// death transitions cleanly. Not part of the game bundle.
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORTS = [5174, 5173, 5175];

function dispatch(code) {
  // The game listens on window 'keydown' and reads e.code.
  return `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', bubbles: true }));`;
}

async function colorCount(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    const colors = new Set();
    const step = Math.max(1, Math.floor(w / 50));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        colors.add(`${d[0]},${d[1]},${d[2]}`);
      }
    }
    return colors.size;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryUrl(page) {
  for (const p of PORTS) {
    try {
      const resp = await page.goto(`http://localhost:${p}/`, { waitUntil: 'networkidle0', timeout: 8000 });
      if (resp && resp.status() === 200) return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 720, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));

  const port = await tryUrl(page);
  if (!port) throw new Error('dev server not found on expected ports');
  console.log(`connected: localhost:${port}`);

  await page.waitForSelector('canvas');
  const menuColors = await colorCount(page);
  console.log(`menu distinct colors sampled: ${menuColors}`);

  // Start the run.
  await page.evaluate(dispatch('Enter'));
  await sleep(300);

  // Steer SE a few times to confirm movement + no crash.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(dispatch('KeyD'));
    await sleep(160);
  }
  const playColors = await colorCount(page);
  console.log(`play distinct colors sampled: ${playColors}`);
  await page.screenshot({ path: 'scripts/smoke-play.png' });

  // Hold SE until the snake hits the boundary -> should die cleanly.
  for (let i = 0; i < 60; i++) {
    await page.evaluate(dispatch('KeyD'));
    await sleep(120);
  }
  await sleep(400);
  const deadColors = await colorCount(page);
  console.log(`after wall-grind distinct colors sampled: ${deadColors}`);
  await page.screenshot({ path: 'scripts/smoke.png' });

  // Return to menu.
  await page.evaluate(dispatch('Enter'));
  await sleep(300);

  console.log(`\nerrors captured: ${errors.length}`);
  for (const e of errors) console.log('  ' + e);
  const ok = errors.length === 0 && menuColors > 1 && playColors > 1;
  console.log(ok ? '\nSMOKE: PASS' : '\nSMOKE: CHECK OUTPUT');
} finally {
  await browser.close();
}
