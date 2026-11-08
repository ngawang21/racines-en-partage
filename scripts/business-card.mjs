// Renders the business card from docs/branding/card/card.html with the
// Playwright Chromium: a two-page print PDF (91 x 61 mm, 3 mm bleed around the
// 85 x 55 mm card), a 300 dpi PNG per face, a 1080 x 1920 image with both faces
// for WhatsApp and the two 960 px previews of the /carte/ page. Outputs are
// committed under docs/branding/card/ and copied to public/carte/; the vCard
// public/racines-en-partage.vcf is written from the settings on the same run.
//
//   pnpm card                 (variant "kraft", the published one)
//   pnpm card kraft           (or foret: the two other directions)
//   pnpm card review          (all three into out/review/card/ plus comparison.png,
//                              nothing published)
//
// CHROME=/path/to/chrome overrides the browser. The site build never depends on
// this script.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';

const VARIANTS = ['medaillon', 'kraft', 'foret'];
const arg = process.argv[2] ?? 'kraft';
const review = arg === 'review';
if (!review && !VARIANTS.includes(arg)) {
  console.error(`unknown variant "${arg}", expected ${[...VARIANTS, 'review'].join(' | ')}`);
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const at = (p) => fileURLToPath(new URL(p, root));
const fileUrl = (p) => pathToFileURL(at(p)).href;
const BASE = 'racines-en-partage-carte';
const OUTPUTS = [
  `${BASE}.pdf`,
  `${BASE}-recto.png`,
  `${BASE}-verso.png`,
  `${BASE}-numerique.png`,
  `${BASE}-recto-apercu.png`,
  `${BASE}-verso-apercu.png`,
];

// ---- contact values: the same sources as the site ----
const consts = await readFile(at('src/consts.ts'), 'utf8');
const siteMatch = consts.match(/url:\s*'([^']+)'/);
if (!siteMatch) throw new Error('missing SITE.url in src/consts.ts');
const site = siteMatch[1].replace(/\/?$/, '/');
const host = new URL(site).host;
const { brand } = parseYaml(await readFile(at('src/content/settings/shop.yml'), 'utf8'));
const digits = String(brand.phone).replace(/\D/g, '');
const french = digits.length === 10 && digits.startsWith('0');
const phoneE164 = french ? `+33${digits.slice(1)}` : `+${digits}`;
// "+33 7 75 68 91 08", the international form printed on the card
const phoneIntl = french
  ? `+33 ${digits[1]} ${digits.slice(2).match(/\d{2}/g).join(' ')}`
  : String(brand.phone);
const tagline = brand.tagline.fr;

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
// French typography: a no-break space keeps "à partager" together.
const nbsp = (s) => escapeHtml(s).replace(/ (à|un|une) /gi, ' $1 ');

// ---- vCard (3.0, CRLF), from the settings ----
async function writeVcard() {
  const esc = (s) => String(s).replace(/([\\,;])/g, '\\$1');
  const a = brand.address;
  const country = a.country === 'FR' ? 'France' : a.country;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${esc(brand.name)}`,
    `ORG:${esc(brand.name)}`,
    `TEL;TYPE=CELL,VOICE:${phoneE164}`,
    `EMAIL;TYPE=INTERNET:${brand.email}`,
    `URL:${site}`,
    `ADR;TYPE=WORK:;;${esc(a.street)};${esc(a.city)};;${esc(a.postcode)};${esc(country)}`,
    'END:VCARD',
  ];
  await writeFile(at('public/racines-en-partage.vcf'), lines.join('\r\n') + '\r\n');
}

// ---- QR code: forest modules on a cream tile, 4-module quiet zone ----
const QR_CODE_MM = 18.5; // the code itself, quiet zone excluded
const qrModules = QRCode.create(site, { errorCorrectionLevel: 'M' }).modules.size;
const qrTileMm = ((qrModules + 8) * QR_CODE_MM) / qrModules;
const qrSvg = await QRCode.toString(site, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#163a1cff', light: '#fbf6eaff' },
});

// ---- browser ----
const chrome = process.env.CHROME || chromium.executablePath();
const libDir = join(homedir(), '.local/lib');
const env = { ...process.env };
if (existsSync(libDir)) {
  env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  env,
});

const work = await mkdtemp(join(tmpdir(), 'rep-card-'));

// The small hibiscus of the kraft recto: the left flower of the full logo.
const flowerPath = join(work, 'flower.png');
{
  const crop = sharp(at('src/assets/brand/logo-full.webp')).extract({
    left: 15,
    top: 377,
    width: 122,
    height: 127,
  });
  const { data, info } = await crop.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Keep the round flower only: the tip of the neighbouring leaf sits in the
  // bottom-right corner, outside a 64 px circle around the flower's centre.
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % info.width;
    const y = Math.floor(i / 4 / info.width);
    if (Math.hypot(x - 61, y - 66) > 64 || data[i + 1] > data[i] + 8) data[i + 3] = 0;
  }
  await sharp(data, { raw: info }).png().toFile(flowerPath);
}

const template = await readFile(at('docs/branding/card/card.html'), 'utf8');
const [first, ...rest] = brand.name.split(' ');
const values = {
  brand: escapeHtml(brand.name),
  brandStacked: `<span>${escapeHtml(first)}</span><span>${escapeHtml(rest.join(' '))}</span>`,
  tagline: nbsp(tagline),
  // "Deux terres. Un rituel." over "Un bien-être à partager."
  taglineBroken: nbsp(tagline).replace(/\. (?=\S+[^.]*\.$)/, '.<br />'),
  phone: phoneIntl,
  email: escapeHtml(brand.email),
  host,
  qr: qrSvg,
  qrTile: `${qrTileMm.toFixed(3)}mm`,
  qrQuiet: `${((4 * QR_CODE_MM) / qrModules).toFixed(3)}mm`,
  medallion: fileUrl('src/assets/brand/medallion.webp'),
  flower: pathToFileURL(flowerPath).href,
  fontDisplay: fileUrl(
    'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2',
  ),
  fontDisplayItalic: fileUrl(
    'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2',
  ),
  fontBody: fileUrl(
    'node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2',
  ),
};
const fill = (variant, face) =>
  Object.entries({ ...values, variant, face }).reduce(
    (html, [key, value]) => html.split(`{{${key}}}`).join(value),
    template,
  );

// 91 mm at 300 dpi is 1074.8 px, 61 mm is 720.5 px. Chromium lays the page out
// in CSS pixels (1 mm is 3.7795 px), so a device scale factor of 300 / 96 gives
// 300 dpi; the capture is then cropped to the exact sheet size.
const SHEET = { w: 1075, h: 720 };
const SCALE = 300 / 96;
const BLEED = Math.round(3 * (300 / 25.4)); // 35 px
const TRIM = { w: SHEET.w - 2 * BLEED, h: SHEET.h - 2 * BLEED }; // 1005 x 650
const context = await browser.newContext({
  viewport: { width: Math.ceil(SHEET.w / SCALE) + 1, height: Math.ceil(SHEET.h / SCALE) + 1 },
  deviceScaleFactor: SCALE,
});
const page = await context.newPage();

async function load(variant, face) {
  const html = join(work, `${variant}-${face}.html`);
  await writeFile(html, fill(variant, face));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  // Load every face explicitly: a missing file must fail, not fall back to Georgia.
  const missing = await page.evaluate(async () => {
    const fonts = ['600 12px Fraunces', 'italic 400 12px Fraunces', '500 12px Figtree'];
    const loaded = await Promise.all(fonts.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return fonts.filter((_, i) => loaded[i].length === 0);
  });
  if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')}`);
}

async function face(variant, name, outDir) {
  await load(variant, name);
  const raw = await page.screenshot({ type: 'png' });
  const out = join(outDir, `${BASE}-${name}.png`);
  await sharp(raw)
    .extract({ left: 0, top: 0, width: SHEET.w, height: SHEET.h })
    .flatten({ background: '#ffffff' })
    .withMetadata({ density: 300 })
    .png()
    .toFile(out);
  return out;
}

// The trimmed face (bleed removed), optionally resized, with rounded corners.
async function trimmed(src, width = TRIM.w) {
  const height = Math.round((TRIM.h * width) / TRIM.w);
  const radius = Math.round(width * 0.042);
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(src)
    .extract({ left: BLEED, top: BLEED, width: TRIM.w, height: TRIM.h })
    .resize(width, height, { kernel: 'lanczos3' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function render(variant, outDir) {
  await mkdir(outDir, { recursive: true });
  const recto = await face(variant, 'recto', outDir);
  const verso = await face(variant, 'verso', outDir);

  // PDF: both faces, one per page, at the sheet size declared by @page.
  await load(variant, 'pdf');
  await page.pdf({
    path: join(outDir, `${BASE}.pdf`),
    preferCSSPageSize: true,
    printBackground: true,
  });

  // Digital version: the two trimmed faces stacked on paper with a soft shadow,
  // 1080 x 1920, ready for WhatsApp.
  const cardW = 960;
  const cardH = Math.round((TRIM.h * cardW) / TRIM.w);
  const gap = 80;
  const top = Math.round((1920 - (2 * cardH + gap)) / 2);
  const left = 60;
  const r = Math.round(cardW * 0.042);
  const shadow = await sharp(
    Buffer.from(
      `<svg width="1080" height="1920"><g fill="#163a1c" fill-opacity="0.2">
        <rect x="${left}" y="${top + 14}" width="${cardW}" height="${cardH}" rx="${r}"/>
        <rect x="${left}" y="${top + cardH + gap + 14}" width="${cardW}" height="${cardH}" rx="${r}"/>
      </g></svg>`,
    ),
  )
    .blur(18)
    .png()
    .toBuffer();
  await sharp({ create: { width: 1080, height: 1920, channels: 4, background: '#f3ead6' } })
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: await trimmed(recto, cardW), left, top },
      { input: await trimmed(verso, cardW), left, top: top + cardH + gap },
    ])
    .flatten({ background: '#f3ead6' })
    .png()
    .toFile(join(outDir, `${BASE}-numerique.png`));

  // Previews for the /carte/ page: the same trimmed faces, 960 px wide, alone.
  await writeFile(join(outDir, `${BASE}-recto-apercu.png`), await trimmed(recto, 960));
  await writeFile(join(outDir, `${BASE}-verso-apercu.png`), await trimmed(verso, 960));
  return { recto, verso };
}

// Owner review: the three variants side by side on one sheet, about 2400 px wide.
async function comparison(rows, out) {
  const LABELS = {
    medaillon: 'Médaillon',
    kraft: 'Kraft',
    foret: 'Forêt',
  };
  const items = [];
  for (const [variant, { recto, verso }] of rows) {
    const r = join(work, `${variant}-recto-trim.png`);
    const v = join(work, `${variant}-verso-trim.png`);
    await writeFile(r, await trimmed(recto));
    await writeFile(v, await trimmed(verso));
    items.push(
      `<section><h2>${LABELS[variant]} <span>pnpm card ${variant}</span></h2>
      <div class="pair"><figure><img src="${pathToFileURL(r).href}" /><figcaption>Recto</figcaption></figure>
      <figure><img src="${pathToFileURL(v).href}" /><figcaption>Verso</figcaption></figure></div></section>`,
    );
  }
  const html = join(work, 'comparison.html');
  await writeFile(
    html,
    `<!doctype html><meta charset="utf-8"><style>
      @font-face { font-family: Figtree; font-weight: 300 900; src: url('${values.fontBody}'); }
      * { margin: 0; box-sizing: border-box; }
      body { width: 2400px; padding: 90px 160px 100px; background: #e7e7e5; font-family: Figtree; color: #2b2b2b; }
      h1 { font-size: 44px; font-weight: 700; margin-bottom: 8px; }
      .sub { font-size: 24px; color: #6a6a6a; margin-bottom: 70px; }
      section + section { margin-top: 80px; }
      h2 { font-size: 34px; font-weight: 700; margin-bottom: 26px; }
      h2 span { font-size: 22px; font-weight: 500; color: #7a7a7a; margin-left: 16px; }
      .pair { display: flex; gap: 70px; }
      figure { width: 1005px; }
      img { display: block; width: 1005px; height: 650px; box-shadow: 0 18px 40px rgba(0,0,0,.16), 0 3px 8px rgba(0,0,0,.08); border-radius: 42px; }
      figcaption { margin-top: 16px; font-size: 22px; font-weight: 500; color: #6a6a6a; }
    </style>
    <h1>Racines en Partage · carte de visite</h1>
    <p class="sub">85 × 55 mm, aperçu sans fond perdu, à l’échelle 300 dpi</p>
    ${items.join('')}`,
  );
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 800 } });
  await sheet.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await sheet.evaluate(() => document.fonts.ready);
  await sheet.screenshot({ path: out, fullPage: true });
  await sheet.close();
}

try {
  if (review) {
    const reviewDir = at('out/review/card');
    const rows = [];
    for (const variant of VARIANTS) {
      rows.push([variant, await render(variant, join(reviewDir, variant))]);
    }
    await comparison(rows, join(reviewDir, 'comparison.png'));
    console.log('three variants and comparison.png written to out/review/card/');
  } else {
    const outDir = at('docs/branding/card');
    const pubDir = at('public/carte');
    await render(arg, outDir);
    await mkdir(pubDir, { recursive: true });
    for (const name of OUTPUTS) await copyFile(join(outDir, name), join(pubDir, name));
    await writeVcard();
    console.log(
      `business card "${arg}" written to docs/branding/card/ and public/carte/, vCard to public/`,
    );
  }
  console.log(
    `QR code: ${qrModules} modules, ${QR_CODE_MM} mm wide, ${qrTileMm.toFixed(1)} mm with the quiet zone`,
  );
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}
