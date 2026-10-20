/**
 * Screenshots of the running product, for the marketing site.
 *
 *   node scripts/screenshot-demo.mjs
 *
 * Drives headless Chrome over the DevTools Protocol - no Puppeteer, no
 * downloads, no image libraries. Captures the public demo page and, when a
 * demo admin token is available, the real dashboard with the demo tenant
 * signed in.
 *
 * Output goes to frontend/public/images/ and is committed, so the marketing
 * site ships real screenshots of the product rather than drawings of it.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outDir = join(repoRoot, 'frontend', 'public', 'images');

const SITE = process.env.DEMO_SITE_URL || 'https://waflo.vercel.app';
const API = process.env.DEMO_API_URL || `${SITE}/api`;
const DEMO_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'demo@harbourpointroofing.demo';
const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'Demo1234!';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate.includes('/') || candidate.includes(':')) {
      if (!existsSync(candidate)) continue;
    }
    return candidate;
  }
  return null;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout on ${method}`));
        }
      }, 90000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    return result?.result?.value;
  }
}

async function connect(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener('open', resolve, { once: true });
          ws.addEventListener('error', reject, { once: true });
        });
        return new CDP(ws);
      }
    } catch {
      /* chrome is still starting */
    }
    await sleep(250);
  }
  throw new Error('Could not connect to Chrome');
}

async function login() {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  const body = await response.json().catch(() => null);
  // The API returns { token, user }; the frontend renames user -> staff.
  const token = body?.data?.token;
  const staff = body?.data?.user;
  if (!body?.success || !token || !staff) {
    throw new Error(`demo login failed: ${JSON.stringify(body)?.slice(0, 200)}`);
  }
  return { token, staff };
}

async function setup(cdp, { width, height }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
}

async function signIn(cdp, token, staff) {
  await cdp.send('Page.navigate', { url: `${SITE}/login` });
  await sleep(2000);
  await cdp.evaluate(`
    localStorage.setItem('auth_token', ${JSON.stringify(token)});
    localStorage.setItem('staff_user', ${JSON.stringify(JSON.stringify(staff))});
    true;
  `);
}

async function goTo(cdp, url, { delay = 2500 } = {}) {
  await cdp.send('Page.navigate', { url });
  await sleep(delay);
}

/** The bounding box of an element, in CSS pixels. */
async function boxOf(cdp, selector) {
  return cdp.evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
    })()
  `);
}

async function shoot(cdp, { clip, quality = 88, format = 'jpeg' }) {
  const result = await cdp.send('Page.captureScreenshot', {
    format,
    quality,
    ...(clip ? { clip: { ...clip, scale: 2 }, captureBeyondViewport: true } : {}),
  });
  return Buffer.from(result.data, 'base64');
}

/**
 * Screenshots an element exactly, by resizing the viewport to the element and
 * scrolling it to the top left. A CDP clip is interpreted against the
 * document, which cuts the top off when the element is taller than the
 * viewport, so resizing is more reliable.
 */
async function shootElement(cdp, selector, { quality = 90, maxHeight = null, width = null } = {}) {
  // The marketing header is sticky, so it overlays whatever is scrolled to the
  // top of the viewport. Hide it for the capture.
  await cdp.evaluate(`
    (() => {
      for (const el of document.querySelectorAll('header')) {
        el.setAttribute('data-shot-hidden', 'true');
        el.style.display = 'none';
      }
      return true;
    })()
  `);
  await sleep(400);

  // Measure, resize and re-measure. Changing the viewport height can add or
  // remove the scrollbar, which changes the content width and therefore the
  // element height. Two passes settles it in practice.
  let size = null;
  for (let pass = 0; pass < 3; pass++) {
    size = await cdp.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          width: Math.ceil(r.width),
          height: Math.ceil(r.height),
          x: r.left + window.scrollX,
          y: r.top + window.scrollY,
        };
      })()
    `);
    if (!size) throw new Error(`element not found: ${selector}`);

  console.log(
    `    ${selector}: ${size.width}x${size.height} css` +
      (maxHeight ? ` -> cropping to ${Math.min(maxHeight, size.height)}` : '')
  );

    const targetWidth = width ?? Math.min(size.width, 1400);
    const targetHeight = Math.min(size.height + 30, 3400);
    const current = await cdp.evaluate(
      'JSON.stringify({w: window.innerWidth, h: window.innerHeight})'
    );
    const { w, h } = JSON.parse(current);
    if (w === targetWidth && h === targetHeight) break;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: targetWidth,
      height: targetHeight,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(900);
  }

  await cdp.evaluate(`window.scrollTo(${size.x}, ${size.y}); true`);
  await sleep(900);

  // The conversation runs long. The landing page hero shows the top of it, so
  // the viewport is trimmed to that height and the element is scrolled to the
  // top of the screen. Capturing the viewport avoids the clip coordinate
  // ambiguity entirely.
  if (maxHeight) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: Math.max(360, size.width),
      height: Math.min(maxHeight, size.height),
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(900);
    await cdp.evaluate(`window.scrollTo(${size.x}, ${size.y}); true`);
    await sleep(700);
  }

  const result = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality });
  return Buffer.from(result.data, 'base64');
}

/**
 * Removes the Chrome profile directory. Windows keeps a lock on the profile
 * files for a moment after the browser exits, so this retries and then gives
 * up - a leftover profile is harmless, it is gitignored.
 */
async function removeProfile(profile) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      return;
    } catch {
      await sleep(700);
    }
  }
  console.log('  (could not remove the Chrome profile, it is gitignored)');
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome or Edge found');
  console.log(`[screenshot] using ${chrome}`);

  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = join(repoRoot, '.chrome-screenshot-profile');
  await removeProfile(profile);
  await mkdir(outDir, { recursive: true });

  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const write = async (name, buffer) => {
    await writeFile(join(outDir, name), buffer);
    console.log(`  -> frontend/public/images/${name} (${Math.round(buffer.length / 1024)} KB)`);
  };

  try {
    const cdp = await connect(port);

    // ---- the public demo page ----------------------------------------
    await setup(cdp, { width: 1400, height: 1000 });
    console.log('[screenshot] capturing the demo conversation');
    await goTo(cdp, `${SITE}/demo`, { delay: 5000 });

    // The conversation is captured at the demo page's natural width and cropped
    // to the part that tells the story: the enquiry, the priced reply, and the
    // quote going out. The quote card below it is rendered as live HTML on the
    // landing page instead.
    await write(
      'demo-conversation.jpg',
      await shootElement(cdp, '[data-shot="conversation"]', {
        maxHeight: 660,
        quality: 76,
        width: 1400,
      })
    );

    try {
      await write('demo-stats.jpg', await shootElement(cdp, '[data-shot="stats"]'));
    } catch (error) {
      console.log(`  (no stats panel: ${error.message})`);
    }

    // ---- the real dashboard, signed in --------------------------------
    let auth = null;
    try {
      auth = await login();
      console.log('[screenshot] signed in to the demo tenant');
    } catch (error) {
      console.log(`  (skipped the dashboard capture: ${error.message})`);
    }

    if (auth) {
      await setup(cdp, { width: 1680, height: 1050 });
      await signIn(cdp, auth.token, auth.staff);

      console.log('[screenshot] capturing the dashboard');
      await goTo(cdp, `${SITE}/dashboard`, { delay: 7000 });
      await write('demo-dashboard.jpg', await shoot(cdp, { quality: 86 }));

      console.log('[screenshot] capturing the inbox');
      await goTo(cdp, `${SITE}/inbox`, { delay: 6000 });
      await write('demo-inbox.jpg', await shoot(cdp, { quality: 86 }));
    }
  } finally {
    child.kill();
    await removeProfile(profile);
  }
}

main().catch((error) => {
  console.error(`[screenshot] failed: ${error?.stack || error}`);
  process.exit(1);
});
