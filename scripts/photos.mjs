#!/usr/bin/env node
// Product, duo and trio photographs derived from the owner's originals (16
// JPEGs, 2000 x 3000 portrait and one 3000 x 2000 landscape, kept outside the
// repository in thinking/rachines-en-partage/shared product photos/).
//
// Usage: node scripts/photos.mjs "<folder of originals>"
//
// Every output keeps the original's whole frame (no crop, no rotation beyond
// EXIF), so the content files and POUCH_BOXES in src/components/storefront.ts
// stay valid: portraits become 1600 x 2400, the landscape trio 2400 x 1600,
// WebP quality 82, sRGB, no metadata. Each product photograph also gets a
// contents close-up: a 2:1 strip cut inside the pouch's transparent window
// (only the flowers, nibs, tubers or powder: no label, no kraft, no leaf),
// written to src/assets/products/detail/<same file name>. The windows are
// shallow (170 to 250 px of clean contents in the originals), so a strip is
// exported at twice its source size, at most 1200 px wide.
//
// Then run `pnpm og` so the Open Graph cards use the new photographs.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Original file name -> outputs. `detail` is the strip in original pixel
 * coordinates: its left and top edges and its height (the width is twice
 * the height). The 200 g baobab pouch has not been photographed: both
 * baobab files come from the 100 g photograph.
 */
const PHOTOS = [
  {
    original: 'Racine en partage-01.jpg',
    outputs: ['src/assets/products/hibiscus-100.webp'],
    detail: { left: 850, top: 1733, height: 240 },
  },
  {
    original: 'Racine en partage-02.jpg',
    outputs: ['src/assets/products/souchet-poudre-100.webp'],
    detail: { left: 900, top: 1738, height: 185 },
  },
  {
    original: 'Racine en partage-03.jpg',
    outputs: ['src/assets/products/orge-grillee-100.webp'],
    detail: { left: 900, top: 1715, height: 235 },
  },
  {
    original: 'Racine en partage-04.jpg',
    outputs: ['src/assets/products/baobab-100.webp', 'src/assets/products/baobab-200.webp'],
    detail: { left: 1010, top: 1614, height: 170 },
  },
  {
    original: 'Racine en partage-05.jpg',
    outputs: ['src/assets/products/psyllium-200.webp'],
    detail: { left: 760, top: 1752, height: 236 },
  },
  {
    original: 'Racine en partage-06.jpg',
    outputs: ['src/assets/products/cacao-poudre-100.webp'],
    detail: { left: 900, top: 1702, height: 218 },
  },
  {
    original: 'Racine en partage-07.jpg',
    outputs: ['src/assets/products/cacao-grues-100.webp'],
    detail: { left: 780, top: 1715, height: 230 },
  },
  {
    original: 'Racine en partage-08.jpg',
    outputs: ['src/assets/products/moringa-100.webp'],
    detail: { left: 780, top: 1718, height: 212 },
  },
  {
    original: 'Racine en partage-09.jpg',
    outputs: ['src/assets/products/moringa-200.webp'],
    detail: { left: 850, top: 1715, height: 205 },
  },
  {
    original: 'Racine en partage.jpg',
    outputs: ['src/assets/products/souchet-tubercules-200.webp'],
    detail: { left: 960, top: 1820, height: 180 },
  },
  { original: 'Racine en partage-10.jpg', outputs: ['src/assets/brand/duo-moringa.webp'] },
  { original: 'Racine en partage-11.jpg', outputs: ['src/assets/brand/duo-cacao.webp'] },
  { original: 'Racine en partage-12.jpg', outputs: ['src/assets/brand/duo-souchet.webp'] },
  { original: 'Racine en partage-13.jpg', outputs: ['src/assets/brand/duo-baobab-orge.webp'] },
  {
    original: 'Racine en partage-14.jpg',
    outputs: ['src/assets/brand/duo-hibiscus-psyllium.webp'],
  },
  { original: 'Racine en partage-15.jpg', outputs: ['src/assets/brand/hero-trio.webp'] },
];

/** Long side of every re-export: 1600 x 2400 portrait, 2400 x 1600 landscape. */
const LONG_SIDE = 2400;
const DETAIL_MAX_WIDTH = 1200;
const WEBP = { quality: 82, effort: 6, smartSubsample: true };

const root = fileURLToPath(new URL('..', import.meta.url));
const folder = process.argv[2];
if (!folder || !existsSync(folder)) {
  console.error('usage: node scripts/photos.mjs <folder of the original photographs>');
  process.exit(2);
}

/** The original, oriented by its EXIF tag, in sRGB. */
const open = (file) => sharp(file).rotate().toColourspace('srgb');

async function write(pipeline, relative) {
  const out = join(root, relative);
  mkdirSync(dirname(out), { recursive: true });
  // sharp writes no metadata unless asked (no EXIF, no ICC: sRGB is assumed).
  const info = await pipeline.webp(WEBP).toFile(out);
  console.log(`${relative}  ${info.width} x ${info.height}  ${Math.round(info.size / 1024)} KB`);
}

let failed = false;
for (const photo of PHOTOS) {
  const file = join(folder, photo.original);
  if (!existsSync(file)) {
    console.error(`missing original: ${file}`);
    failed = true;
    continue;
  }
  const meta = await sharp(file).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  const scale = LONG_SIDE / Math.max(width, height);
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) };

  for (const output of photo.outputs) {
    await write(open(file).resize({ ...size, kernel: 'lanczos3' }), output);
  }

  if (photo.detail) {
    const { left, top, height: h } = photo.detail;
    const w = 2 * h;
    if (left + w > width || top + h > height) {
      throw new Error(`${photo.original}: detail rectangle outside the photograph`);
    }
    const outWidth = Math.min(DETAIL_MAX_WIDTH, 2 * w);
    for (const output of photo.outputs) {
      const name = output.split('/').pop();
      await write(
        open(file)
          .extract({ left, top, width: w, height: h })
          .resize({ width: outWidth, height: outWidth / 2, kernel: 'lanczos3' })
          .sharpen({ sigma: 0.6 }),
        `src/assets/products/detail/${name}`,
      );
    }
  }
}
if (failed) process.exit(1);
