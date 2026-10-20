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
  if (!body?.success || !body?.data?.token) {
    throw new Error(`demo login failed: ${JSON.stringify(body)?.slice(0, 200)}`);
  }
  return body.data;
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

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome or Edge found');
  console.log(`[screenshot] using ${chrome}`);

  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = join(repoRoot, '.chrome-screenshot-profile');
  await rm(profile, { recursive: true, force: true });
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
    await setup(cdp, { width: 1280, height: 1000 });
    console.log('[screenshot] capturing the demo conversation');
    await goTo(cdp, `${SITE}/demo`, { delay: 4000 });

    const conversationBox = await boxOf(cdp, '[data-shot="conversation"]');
    if (!conversationBox) throw new Error('the conversation panel was not found on /demo');
    await sleep(600);
    const conversationBox2 = (await boxOf(cdp, '[data-shot="conversation"]')) || conversationBox;
    await write('demo-conversation.jpg', await shoot(cdp, { clip: conversationBox2 }));

    const statsBox = await boxOf(cdp, '[data-shot="stats"]');
    if (statsBox) {
      await sleep(600);
      const statsBox2 = (await boxOf(cdp, '[data-shot="stats"]')) || statsBox;
      await write('demo-stats.jpg', await shoot(cdp, { clip: statsBox2 }));
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
      await setup(cdp, { width: 1440, height: 1000 });
      await signIn(cdp, auth.token, auth.staff);

      console.log('[screenshot] capturing the dashboard');
      await goTo(cdp, `${SITE}/dashboard`, { delay: 6000 });
      await write('demo-dashboard.jpg', await shoot(cdp, { quality: 84 }));

      console.log('[screenshot] capturing the inbox');
      await goTo(cdp, `${SITE}/inbox`, { delay: 5000 });
      await write('demo-inbox.jpg', await shoot(cdp, { quality: 84 }));
    }
  } finally {
    child.kill();
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[screenshot] failed: ${error?.stack || error}`);
  process.exit(1);
});
