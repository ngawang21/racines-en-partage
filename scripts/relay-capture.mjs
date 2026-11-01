// Headless capture of the two pages that relax the CSP (docs/deployment.md,
// section 11): the checkout with the Mondial Relay picker, and /admin/ with
// Sveltia CMS. Serves dist/ with the headers of dist/_headers applied as
// Cloudflare would (astro preview ignores that file), drives Chromium, and
// fails unless every step works with zero CSP violation.
//
//   pnpm build
//   node scripts/relay-capture.mjs              # checkout and admin
//   node scripts/relay-capture.mjs checkout     # or only one of them
//   node scripts/relay-capture.mjs --postcode 75011 --headed
//
// Needs the network (widget.mondialrelay.com, OpenStreetMap, unpkg, GitHub
// status) and the Chromium of @playwright/test (`pnpm exec playwright install
// chromium` once). On the development machine, ~/.local/lib is added to
// LD_LIBRARY_PATH as playwright.config.ts does.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { headersFor, parseHeaders } from './lib/headers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dist: { type: 'string', default: 'dist' },
    port: { type: 'string', default: '4330' },
    postcode: { type: 'string', default: '95400' },
    headed: { type: 'boolean', default: false },
  },
});
const targets = positionals.length > 0 ? positionals : ['checkout', 'admin'];
for (const t of targets) {
  if (t !== 'checkout' && t !== 'admin') throw new Error(`Unknown target: ${t}`);
}

const DIST = resolve(ROOT, values.dist);
if (!existsSync(join(DIST, '_headers'))) {
  console.error(`${DIST}/_headers is missing: run pnpm build first.`);
  process.exit(2);
}
const rules = parseHeaders(readFileSync(join(DIST, '_headers'), 'utf8'));

// ------------------------------------------------------------ static server

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  const local = normalize(join(DIST, path));
  if (!local.startsWith(DIST)) {
    res.writeHead(400).end();
    return;
  }
  let file = null;
  let status = 200;
  if (path.endsWith('/') && isFile(join(local, 'index.html'))) file = join(local, 'index.html');
  else if (isFile(local)) file = local;
  else if (isDir(local)) {
    // html_handling: auto-trailing-slash
    res.writeHead(307, { Location: `${path}/${url.search}` }).end();
    return;
  } else {
    file = join(DIST, '404.html');
    status = 404;
  }
  const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' };
  for (const [name, list] of headersFor(rules, path)) headers[name] = list.join(', ');
  res.writeHead(status, headers).end(readFileSync(file));
});
const port = Number(values.port);
await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
const base = `http://127.0.0.1:${port}`;

// ------------------------------------------------------------------ browser

const localLib = join(homedir(), '.local/lib');
const env = { ...process.env };
if (existsSync(localLib)) {
  env.LD_LIBRARY_PATH = [localLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}
const browser = await chromium.launch({ headless: !values.headed, env });

/** One page with its CSP violations and third-party hosts recorded. */
async function openPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const violations = [];
  const hosts = new Map();
  await context.exposeBinding('__repReportCsp', (_source, v) => void violations.push(v));
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__repReportCsp({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : '',
      });
    });
  });
  const page = await context.newPage();
  const consoleCsp = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) consoleCsp.push(msg.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === base || url.protocol === 'data:' || url.protocol === 'blob:') return;
    const key = `${url.origin} (${request.resourceType()})`;
    hosts.set(key, (hosts.get(key) ?? 0) + 1);
  });
  return { context, page, violations, consoleCsp, hosts };
}

function report(name, ok, run, extra = {}) {
  const result = {
    target: name,
    ok,
    violations: run.violations.length + run.consoleCsp.length,
    ...extra,
    hosts: Object.fromEntries([...run.hosts].sort()),
    details: [...run.violations, ...run.consoleCsp],
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function captureCheckout() {
  const run = await openPage();
  const { page } = run;
  let selected = null;
  let error = null;
  try {
    await page.goto(`${base}/boutique/`);
    await page.locator('button[data-add-to-cart]:not([disabled])').first().click();
    await page.keyboard.press('Escape');
    await page.goto(`${base}/commande/`);
    await page.locator('.method-card', { hasText: 'Point Relais' }).click();
    await page.locator('[data-relay-postcode]').fill(values.postcode);
    await page.locator('[data-relay-go]').click();
    const items = page.locator('#rep-relay-widget .PR-List-Item');
    await items.first().waitFor({ state: 'visible', timeout: 30_000 });
    const count = await items.count();
    await items.nth(Math.min(1, count - 1)).click();
    const name = page.locator('[data-relay-name]');
    await name.waitFor({ state: 'visible', timeout: 10_000 });
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('rep.cart.v1') ?? '{}').delivery ?? null,
    );
    selected = {
      results: count,
      shown: (await name.textContent())?.trim(),
      id: stored?.relay?.id ?? null,
      city: stored?.relay?.city ?? null,
    };
    // Let late requests (tiles, markers) land before counting violations.
    await page.waitForTimeout(1500);
  } catch (err) {
    error = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
  const ok =
    !error &&
    selected?.id != null &&
    /^[A-Z]{2}-\d{6}$/.test(selected.id) &&
    run.violations.length + run.consoleCsp.length === 0;
  const result = report('checkout', ok, run, { postcode: values.postcode, selected, error });
  await run.context.close();
  return result;
}

async function captureAdmin() {
  const run = await openPage();
  const { page } = run;
  let error = null;
  let signIn = null;
  try {
    await page.goto(`${base}/admin/`);
    const button = page.getByRole('button', { name: /GitHub/i }).first();
    await button.waitFor({ state: 'visible', timeout: 30_000 });
    signIn = (await button.textContent())?.trim() ?? null;
    await page.waitForTimeout(1500);
  } catch (err) {
    error = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
  const ok = !error && signIn !== null && run.violations.length + run.consoleCsp.length === 0;
  const result = report('admin', ok, run, { signIn, error });
  await run.context.close();
  return result;
}

const results = [];
try {
  if (targets.includes('checkout')) results.push(await captureCheckout());
  if (targets.includes('admin')) results.push(await captureAdmin());
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `relay-capture: ${results.map((r) => r.target).join(' and ')} OK, zero CSP violation.`
    : `relay-capture: FAILED for ${failed.map((r) => r.target).join(', ')}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
