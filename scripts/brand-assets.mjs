#!/usr/bin/env node
// Brand derivatives from the owner's master logo (the 1254 x 1235 PNG on a
// white studio background that Marie supplied):
//   src/assets/brand/logo-full.webp   the whole logo, background keyed out
//   src/assets/brand/medallion.webp   the painted scene in a circle, flower whole
//   public/icons/icon-{16,32,48,96}.png   the small hibiscus mark on a cream disc
//   public/icons/icon-{192,512}.png, public/apple-touch-icon.png
//                                     the medallion in a gold ring on cream
// Usage: node scripts/brand-assets.mjs /path/to/logo-master.png
// Then run `pnpm og` so the Open Graph cards pick up the new medallion.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/brand-assets.mjs <logo-master.png>');
  process.exit(2);
}

const CREAM = '#fbf6ea';
const GOLD = '#c9a24a';
// Geometry in master coordinates (1254 x 1235).
const MASTER = { width: 1254, height: 1235 };
const MEDALLION = { cx: 630, cy: 509, r: 361 }; // includes the whole hibiscus, stops at the banner
const MARK = { left: 56, top: 426, width: 122, height: 132 }; // the small hibiscus left of the ring

/**
 * Key the white studio background to transparency: a flood fill from the
 * border over near-white pixels, with a soft alpha ramp so anti-aliased
 * edges stay smooth. White areas enclosed by paint (clouds, walls, banner)
 * are untouched because the fill cannot reach them.
 */
function keyWhite(rgb, width, height) {
  const n = width * height;
  const alphaOf = (i) => {
    const m = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    return m >= 250 ? 0 : m <= 200 ? 255 : Math.round((255 * (250 - m)) / 50);
  };
  const outside = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    const i = y * width + x;
    if (!outside[i] && alphaOf(i) < 255) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = outside[i] ? alphaOf(i) : 255;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } });
}

/**
 * Keep only the largest connected opaque shape: a crop around the small
 * hibiscus also catches the tip of a neighbouring leaf.
 */
function largestShapeOnly(rgba, width, height) {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  let best = { id: -1, size: 0 };
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] !== -1 || rgba[start * 4 + 3] === 0) continue;
    const id = next++;
    const stack = [start];
    label[start] = id;
    let size = 0;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (label[j] === -1 && rgba[j * 4 + 3] !== 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    if (size > best.size) best = { id, size };
  }
  for (let i = 0; i < n; i++) if (label[i] !== best.id) rgba[i * 4 + 3] = 0;
  return rgba;
}

/** Key a region of the master and return it as a transparent PNG buffer. */
async function keyedRegion(region, { single = false } = {}) {
  const { data, info } = await sharp(src)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const keyed = await keyWhite(data, info.width, info.height).raw().toBuffer();
  const rgba = single ? largestShapeOnly(keyed, info.width, info.height) : keyed;
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

const circleMask = (d) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`,
  );

/** A cream disc with a gold hairline, `d` px across, as an SVG buffer. */
const disc = (d, stroke) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - stroke / 2}" fill="${CREAM}" stroke="${GOLD}" stroke-width="${stroke}"/></svg>`,
  );

async function main() {
  const meta = await sharp(src).metadata();
  if (meta.width !== MASTER.width || meta.height !== MASTER.height) {
    throw new Error(
      `expected the ${MASTER.width} x ${MASTER.height} master, got ${meta.width} x ${meta.height}; adjust the geometry constants`,
    );
  }
  const brand = join(root, 'src', 'assets', 'brand');
  const icons = join(root, 'public', 'icons');
  mkdirSync(icons, { recursive: true });

  // Full logo: keyed, trimmed, capped at 1200 px wide (displayed at 320 px, 2x).
  const full = await keyedRegion({ left: 0, top: 0, width: meta.width, height: meta.height });
  await sharp(full)
    .trim({ threshold: 1 })
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(join(brand, 'logo-full.webp'));

  // Medallion: the scene in a circle, the white above the ring keyed out so the
  // page's cream shows through, 720 px (displayed at 96 px or less).
  const d = MEDALLION.r * 2;
  const scene = await keyedRegion({
    left: MEDALLION.cx - MEDALLION.r,
    top: MEDALLION.cy - MEDALLION.r,
    width: d,
    height: d,
  });
  const medallion = await sharp(scene)
    .composite([{ input: circleMask(d), blend: 'dest-in' }])
    .png()
    .toBuffer();
  await sharp(medallion)
    .resize(720, 720)
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(join(brand, 'medallion.webp'));

  // Small icons: the hibiscus mark on a cream disc.
  const mark = await sharp(await keyedRegion(MARK, { single: true }))
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
  for (const size of [16, 32, 48, 96]) {
    const inner = Math.round(size * 0.68);
    const glyph = await sharp(mark).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
    const g = await sharp(glyph).metadata();
    await sharp(disc(size, size >= 48 ? 2 : 1))
      .composite([
        {
          input: glyph,
          left: Math.round((size - g.width) / 2),
          top: Math.round((size - g.height) / 2),
        },
      ])
      .png()
      .toFile(join(icons, `icon-${size}.png`));
  }

  // Large icons: the medallion in a gold ring on a cream square (safe for maskable use).
  for (const [size, file] of [
    [192, join(icons, 'icon-192.png')],
    [512, join(icons, 'icon-512.png')],
    [180, join(root, 'public', 'apple-touch-icon.png')],
  ]) {
    const ring = Math.round(size * 0.84);
    const stroke = Math.max(2, Math.round(size / 64));
    const inner = ring - stroke * 4;
    const scene = await sharp(medallion).resize(inner, inner).png().toBuffer();
    const framed = await sharp(disc(ring, stroke))
      .composite([
        { input: scene, left: Math.round((ring - inner) / 2), top: Math.round((ring - inner) / 2) },
      ])
      .png()
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 3, background: CREAM } })
      .composite([
        { input: framed, left: Math.round((size - ring) / 2), top: Math.round((size - ring) / 2) },
      ])
      .png({ compressionLevel: 9 })
      .toFile(file);
  }
  writeFileSync(join(brand, 'README.md'), BRAND_README);
  console.log('brand assets written');
}

const BRAND_README = `# Brand assets

Derived from the owner's master logo with \`node scripts/brand-assets.mjs <master.png>\`
(the master, a 1254 x 1235 PNG on white, stays with the owner and is not
committed). \`logo-full.webp\` is the complete logo with the background keyed
out; \`medallion.webp\` is the painted scene in a circle for the header, hero,
footer and 404 page; the favicons and app icons under \`public/icons/\` come
from the same run. After a new master, run \`pnpm brand <master.png>\` then
\`pnpm og\`.

The photos in this folder are the owner's product photography, cropped for the
hero and the category and page banners.
`;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
