#!/usr/bin/env node
// Open Graph cards, 1200 x 630 JPEG, written to public/og/ and committed:
//   public/og/default.jpg         the hero trio and the tagline
//   public/og/<product-slug>.jpg  the product photo, its name, weight and origin
// Run with `pnpm og` after adding a product or changing a name or photo.
// Seo.astro falls back to default.jpg for a product without a card.
//
// Text is set with sharp's Pango renderer from static instances of Fraunces
// (SemiBold and Medium Italic, opsz 72, SOFT 50) and Figtree (Medium and
// SemiBold) in scripts/og-fonts/, cut from the @fontsource-variable files with
// fontTools' instancer (latin subset, OFL; licences next to the fonts).
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'public', 'og');
const fonts = join(root, 'scripts', 'og-fonts');

const W = 1200;
const H = 630;
const C = {
  cream: '#fbf6ea',
  paper: '#f3ead6',
  kraft: '#d8b98e',
  forest: '#163a1c',
  ink2: '#4a5c45',
  leaf: '#3e7a2a',
  hibiscusDeep: '#b8262e',
  hibiscus: '#e03a3a',
  gold: '#c9a24a',
  terracotta: '#c8582c',
};

const FONT = {
  display: { name: 'OGFraunces', file: join(fonts, 'Fraunces-SemiBold.ttf') },
  italic: { name: 'OGFrauncesItalic', file: join(fonts, 'Fraunces-MediumItalic.ttf') },
  body: { name: 'OGFigtree', file: join(fonts, 'Figtree-Medium.ttf') },
  bodyBold: { name: 'OGFigtreeBold', file: join(fonts, 'Figtree-SemiBold.ttf') },
};

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A transparent PNG of wrapped text, `size` in px, `width` the wrap box. */
async function text(content, { font, size, color, width, spacing = 0, lineHeight = 1.1 }) {
  const markup = `<span foreground="${color}" letter_spacing="${Math.round(spacing * 1024)}">${escape(content)}</span>`;
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${font.name} ${size}`,
      fontfile: font.file,
      width,
      dpi: 72,
      rgba: true,
      wrap: 'word',
      spacing: Math.round(size * (lineHeight - 1)),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** Kente divider: chevrons in terracotta and leaf on gold, `h` px tall. */
function kente(width, h) {
  const tile = h * 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
      <defs><pattern id="k" width="${tile}" height="${h}" patternUnits="userSpaceOnUse">
        <rect width="${tile}" height="${h}" fill="${C.gold}"/>
        <polygon points="0,0 ${h},${h} 0,${h}" fill="${C.terracotta}"/>
        <polygon points="${tile},0 ${h},${h} ${tile},${h}" fill="${C.terracotta}"/>
        <polygon points="${h / 2},0 ${h},${h / 2} ${h * 1.5},0" fill="${C.leaf}"/>
      </pattern></defs>
      <rect width="${width}" height="${h}" fill="url(#k)"/>
    </svg>`,
  );
}

/** A photo cropped to w x h with rounded corners and a 2 px kraft border. */
async function framedPhoto(file, w, h, position = 'centre') {
  const r = 22;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`,
  );
  const photo = await sharp(file)
    .resize(w, h, { fit: 'cover', position })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const border = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r - 1}" ry="${r - 1}" fill="none" stroke="${C.kraft}" stroke-width="2"/></svg>`,
  );
  return sharp({ create: { width: w, height: h, channels: 4, background: '#0000' } })
    .composite([{ input: photo }, { input: border }])
    .png()
    .toBuffer();
}

/** The medallion in a cream ring with a gold hairline, `d` px across. */
async function medallion(d) {
  const inner = d - 10;
  const disc = await sharp(join(root, 'src/assets/brand/medallion.webp'))
    .resize(inner, inner)
    .png()
    .toBuffer();
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1}" fill="${C.cream}" stroke="${C.gold}" stroke-width="1.5"/></svg>`,
  );
  return sharp(ring)
    .composite([{ input: disc, left: 5, top: 5 }])
    .png()
    .toBuffer();
}

/** Gold hairline with the hibiscus glyph in the middle. */
function hairline(width) {
  const mid = width / 2;
  const petals = [0, 72, 144, 216, 288]
    .map(
      (deg) =>
        `<ellipse cx="12" cy="6.4" rx="3.1" ry="4.4" transform="rotate(${deg} 12 12)" fill="${C.hibiscus}"/>`,
    )
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24">
      <line x1="0" y1="12" x2="${mid - 22}" y2="12" stroke="${C.gold}" stroke-width="1.5"/>
      <line x1="${mid + 22}" y1="12" x2="${width}" y2="12" stroke="${C.gold}" stroke-width="1.5"/>
      <g transform="translate(${mid - 12} 0)">${petals}<circle cx="12" cy="12" r="1.8" fill="${C.gold}"/></g>
    </svg>`,
  );
}

async function card({ photo, photoBox, position, blocks }) {
  const layers = [
    {
      input: await framedPhoto(photo, photoBox.w, photoBox.h, position),
      left: photoBox.x,
      top: photoBox.y,
    },
    { input: kente(W, 10), left: 0, top: H - 10 },
    ...blocks,
  ];
  return sharp({ create: { width: W, height: H, channels: 3, background: C.cream } })
    .composite(layers)
    .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

/** Left column: medallion and wordmark, then the blocks stacked from `top`. */
async function brandHeader(x, y) {
  const m = await medallion(76);
  const word = await text('RACINES EN PARTAGE', {
    font: FONT.bodyBold,
    size: 19,
    color: C.forest,
    spacing: 3,
  });
  return [
    { input: m, left: x, top: y },
    { input: word.input, left: x + 92, top: y + Math.round((76 - word.height) / 2) },
  ];
}

function nbsp(s) {
  return s.replace(/ (g|kg)\b/g, ' $1');
}

async function productCard(p) {
  const x = 72;
  const textWidth = 560;
  const header = await brandHeader(x, 64);
  const kicker = await text(p.categoryName.toUpperCase(), {
    font: FONT.bodyBold,
    size: 17,
    color: C.ink2,
    spacing: 2,
  });
  const name = await text(p.name, {
    font: FONT.display,
    size: p.name.length > 22 ? 62 : 70,
    color: C.forest,
    width: textWidth,
    lineHeight: 1.05,
  });
  const meta = await text(nbsp(`${p.weightGrams} g  ·  ${p.origin}`), {
    font: FONT.body,
    size: 28,
    color: C.ink2,
  });
  const tagline = await text('Deux terres. Un rituel. Un bien-être à partager.', {
    font: FONT.italic,
    size: 25,
    color: C.hibiscusDeep,
    width: textWidth,
  });
  let top = 212;
  const blocks = [...header];
  blocks.push({ input: kicker.input, left: x, top });
  top += kicker.height + 18;
  blocks.push({ input: name.input, left: x - 2, top });
  top += name.height + 22;
  blocks.push({ input: meta.input, left: x, top });
  blocks.push({ input: hairline(textWidth), left: x, top: 490 });
  blocks.push({ input: tagline.input, left: x, top: 532 });
  return card({
    photo: p.photo,
    photoBox: { x: 720, y: 40, w: 420, h: 525 },
    position: 'centre',
    blocks,
  });
}

async function defaultCard() {
  const x = 72;
  const textWidth = 520;
  const header = await brandHeader(x, 64);
  const eyebrow = await text('TISANES BOTANIQUES & POUDRES ALIMENTAIRES', {
    font: FONT.bodyBold,
    size: 15,
    color: C.ink2,
    spacing: 2,
    width: textWidth,
  });
  const title = await text('Deux terres.\nUn rituel.', {
    font: FONT.display,
    size: 66,
    color: C.forest,
    width: textWidth,
    lineHeight: 1.05,
  });
  const accent = await text('Un bien-être à partager.', {
    font: FONT.italic,
    size: 42,
    color: C.hibiscusDeep,
    width: textWidth,
  });
  const meta = await text('Moringa, baobab, bissap, souchet, cacao', {
    font: FONT.body,
    size: 24,
    color: C.ink2,
    width: textWidth,
  });
  let top = 196;
  const blocks = [...header, { input: eyebrow.input, left: x, top }];
  top += eyebrow.height + 22;
  blocks.push({ input: title.input, left: x - 2, top });
  top += title.height + 18;
  blocks.push({ input: accent.input, left: x - 2, top });
  blocks.push({ input: hairline(textWidth), left: x, top: 498 });
  blocks.push({ input: meta.input, left: x, top: 536 });
  return card({
    photo: join(root, 'src/assets/brand/hero-trio.webp'),
    photoBox: { x: 632, y: 40, w: 508, h: 525 },
    position: 'centre',
    blocks,
  });
}

// ------------------------------------------------------------------- main

const productDir = join(root, 'src/content/products/fr');
const categoryDir = join(root, 'src/content/categories/fr');
const categories = new Map(
  readdirSync(categoryDir)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => [f.replace(/\.yml$/, ''), parse(readFileSync(join(categoryDir, f), 'utf8'))]),
);

mkdirSync(out, { recursive: true });
await sharp(await defaultCard()).toFile(join(out, 'default.jpg'));
console.log('og: default.jpg');

for (const file of readdirSync(productDir)
  .filter((f) => f.endsWith('.yml'))
  .sort()) {
  const slug = file.replace(/\.yml$/, '');
  const data = parse(readFileSync(join(productDir, file), 'utf8'));
  const jpg = await productCard({
    name: data.name,
    weightGrams: data.weightGrams,
    origin: data.origin,
    categoryName: categories.get(data.category)?.name ?? '',
    photo: join(root, data.images[0]),
  });
  await sharp(jpg).toFile(join(out, `${slug}.jpg`));
  console.log(`og: ${slug}.jpg`);
}
