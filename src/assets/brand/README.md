# Brand assets

## Logo and medallion

Derived from the owner's master logo with `node scripts/brand-assets.mjs <master.png>`
(the master, a 1254 x 1235 PNG on white, stays with the owner and is not
committed). `logo-full.webp` is the complete logo with the background keyed
out; `medallion.webp` is the painted scene in a circle for the header, hero,
footer and 404 page; the favicons and app icons under `public/icons/` come
from the same run. After a new master, run `pnpm brand <master.png>` then
`pnpm og`.

## Photographs

The owner's product photography: 16 JPEG originals (15 portraits at
2000 x 3000, one landscape at 3000 x 2000) in
`thinking/rachines-en-partage/shared product photos/`, outside the
repository. Only the derived files are committed:

- `src/assets/products/*.webp`: one photograph per product, 1600 x 2400.
- `src/assets/brand/duo-*.webp`: two pouches together (the product page's
  second photo, the category banners), 1600 x 2400.
- `src/assets/brand/hero-trio.webp`: three pouches (home hero, about page),
  2400 x 1600.
- `src/assets/products/detail/*.webp`: the contents close-ups (below).

All of them come from one script:

```sh
node scripts/photos.mjs "/path/to/shared product photos"
pnpm og
```

The table at the top of `scripts/photos.mjs` maps each original to its
outputs. Every re-export keeps the original's whole frame (no crop, no
rotation beyond the EXIF tag), so the content files and `POUCH_BOXES` in
`src/components/storefront.ts` (the pouch's top and bottom as fractions of
the photo height) stay valid. WebP quality 82, sRGB, no metadata. The 200 g
baobab pouch has not been photographed: `baobab-200.webp` is the 100 g
photograph.

A new product photograph: add its original to the table, run the script,
then add its `POUCH_BOXES` entry (measure the pouch's top and bottom edges on
the photo) and run `pnpm og`.

### Contents close-ups

`src/assets/products/detail/<file>` holds, for each product photograph
`src/assets/products/<file>`, a 2:1 strip cut inside the pouch's
transparent window: only the flowers, nibs, tubers or powder, with no label,
no label border, no kraft edge, no leaf and, where the window allows, no
reflection. `detailAsset(productImage)` in `src/images.ts` returns its path;
the recipe cards and pages and the home ritual band use it.

The rectangles were chosen by eye on the originals and are written in the
script (left, top and height in original pixels; the width is twice the
height). The windows are shallow: between 170 and 240 px of clean contents
in a 3000 px tall original, so no strip reaches 600 x 300 at the source.
Each strip is exported at twice its source size (between 680 x 340 for the
baobab and 960 x 480 for the hibiscus), never more, with a light sharpening.
A new photograph shot closer to the window would give larger strips.

### No label close-up

There is deliberately no close-up of the printed label. The labels still
carry wording the site does not repeat: health and nutrition claims (EU
regulation 1924/2006), "sans gluten" on the roasted barley and nutrition
tables under review, all listed for the owner in
`docs/client/presentation.md`, and the earlier outlook.com e-mail address
rather than the shop's current one. Until the labels are reprinted, a label
shows only as part of the whole pouch, and the product page's larger view is
capped at 1200 px wide (`Picture.astro`, preset `zoom`) so the small print
stays out of reading range.
