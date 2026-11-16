#!/usr/bin/env node
// The origins map of the home "Deux terres" band, drawn from Natural Earth
// (public domain, 1:50m, through the world-atlas TopoJSON package):
//   src/assets/brand/origins-map.svg   coastlines, the six origin countries
//                                      and the routes to Arnouville
//   src/assets/brand/origins-map.json  the viewBox and, per place, its point
//                                      and the side its label sits on
// Both are committed; nothing of this runs in the browser. OriginsMap.astro
// sets the dots and the labels over the image in HTML (the names come from
// the home page's `storyLands`, in the page's language, and keep a readable
// size at any width). A unit test checks that every land of the home page
// has a place here and the reverse.
//
// Run with `pnpm map` after changing the frame, a place or the style.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoCentroid, geoContains, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-50m.json');

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'src', 'assets', 'brand');

// ------------------------------------------------------------------ frame

/** Europe, Africa down to the Gulf of Guinea, the Middle East and India, with
 * Atlantic room on the left for the names of the West African lands. */
const FRAME = { west: -38, east: 98, south: -5, north: 60 };
/** The viewBox width; the height follows from the frame. */
const W = 1000;
/** Natural Earth keeps Africa upright; centred on the frame's middle meridian. */
const CENTRE = (FRAME.west + FRAME.east) / 2;

// ----------------------------------------------------------------- places

/**
 * The six lands of origin (ISO 3166-1 numeric ids of Natural Earth), their
 * names as the home page lists them, and where the label sits next to the
 * dot (a compass side, placed by hand so no two labels meet at 390 px or at
 * 1440 px and no label lies on a route). `at` replaces the centroid when it
 * would fall outside the country or too close to a neighbour's dot.
 */
const ORIGINS = [
  { id: '686', key: 'senegal', fr: 'Sénégal', en: 'Senegal', label: 'sw' },
  { id: '562', key: 'niger', fr: 'Niger', en: 'Niger', label: 'e' },
  { id: '384', key: 'cote-d-ivoire', fr: 'Côte d’Ivoire', en: 'Côte d’Ivoire', label: 'sw' },
  { id: '120', key: 'cameroon', fr: 'Cameroun', en: 'Cameroon', label: 'e' },
  { id: '356', key: 'india', fr: 'Inde', en: 'India', label: 's' },
  { id: '276', key: 'germany', fr: 'Allemagne', en: 'Germany', label: 'e' },
];
/** The shop, 9 rue du Marché, Arnouville (Val-d'Oise). */
const HOME = {
  key: 'arnouville',
  fr: 'Arnouville',
  en: 'Arnouville',
  lon: 2.42,
  lat: 48.99,
  label: 'w',
};

// ------------------------------------------------------------------ style

// The site's line language on the forest band (tokens.css): thin gold
// coastlines, the origin countries in a quiet lighter green, cream routes.
const STYLE = {
  coast: '#c9a24a', // --gold
  coastOpacity: 0.5,
  coastWidth: 0.9,
  originFill: '#2f5f35', // between --forest-2 and --leaf
  originStroke: '#c9a24a',
  originStrokeOpacity: 0.55,
  route: '#fbf6ea', // --cream
  routeOpacity: 0.55,
  routeWidth: 1,
};

// ------------------------------------------------------------- projection

const frameOutline = {
  type: 'Polygon',
  coordinates: [
    [
      ...steps(FRAME.west, FRAME.east).map((lon) => [lon, FRAME.south]),
      ...steps(FRAME.south, FRAME.north).map((lat) => [FRAME.east, lat]),
      ...steps(FRAME.east, FRAME.west).map((lon) => [lon, FRAME.north]),
      ...steps(FRAME.north, FRAME.south).map((lat) => [FRAME.west, lat]),
    ],
  ],
};
// The frame drawn counter-clockwise is the whole sphere minus the box in
// d3's winding rule: reverse it so the outline encloses the box.
frameOutline.coordinates[0].reverse();

const projection = geoNaturalEarth1().rotate([-CENTRE, 0]).precision(0.1);
projection.fitWidth(W, frameOutline);
const [[, y0], [, y1]] = geoPath(projection).bounds(frameOutline);
const H = Math.round(y1 - y0);
projection.translate([projection.translate()[0], projection.translate()[1] - y0]);
projection.clipExtent([
  [0, 0],
  [W, H],
]);

function steps(a, b, n = 24) {
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

// ------------------------------------------------------- path, simplified

/**
 * A path context that drops points closer than `tolerance` to the last one
 * kept and writes relative moves rounded to 0.1 (a tenth of a unit is under
 * a tenth of a pixel at the largest size the map is shown).
 */
function pathString(geometry, tolerance = 1.4) {
  let d = '';
  let last = null; // last written point (rounded)
  let pending = null;
  const r = (v) => Math.round(v * 10) / 10;
  const num = (v) => String(r(v)).replace(/^(-?)0\./, '$1.');
  const pair = (a, b) => `${num(a)}${b < 0 ? '' : ' '}${num(b)}`;
  const write = (x, y) => {
    const [rx, ry] = [r(x), r(y)];
    d += `l${pair(rx - last[0], ry - last[1])}`;
    last = [rx, ry];
  };
  const flush = () => {
    if (pending) write(...pending);
    pending = null;
  };
  const context = {
    moveTo(x, y) {
      flush();
      last = [r(x), r(y)];
      d += `M${pair(last[0], last[1])}`;
    },
    lineTo(x, y) {
      if (Math.hypot(x - last[0], y - last[1]) < tolerance) {
        pending = [x, y];
        return;
      }
      pending = null;
      write(x, y);
    },
    closePath() {
      flush();
      d += 'z';
    },
    arc() {},
  };
  geoPath(projection, context)(geometry);
  flush();
  return d;
}

// ------------------------------------------------------------- geometries

const countries = feature(world, world.objects.countries).features;
const land = feature(world, world.objects.land);

/** Coastlines as lines (a clipped polygon would draw the frame's edges). */
const MIN_RING_AREA = 0.00002; // steradians: drops the smallest islets
const rings = [];
const landGeometries =
  land.type === 'FeatureCollection' ? land.features.map((f) => f.geometry) : [land.geometry];
const polygons = landGeometries.flatMap((g) =>
  g.type === 'Polygon' ? [g.coordinates] : g.coordinates,
);
for (const polygon of polygons) {
  for (const ring of polygon) {
    const area = geoArea({ type: 'Polygon', coordinates: [ring] });
    // geoArea of a ring wound the other way is 4π minus its area.
    const small = Math.min(area, 4 * Math.PI - area);
    if (small >= MIN_RING_AREA) rings.push(ring);
  }
}
const coast = pathString({ type: 'MultiLineString', coordinates: rings });

const origins = ORIGINS.map((o) => {
  const country = countries.find((c) => c.id === o.id);
  if (!country) throw new Error(`origins-map: no country ${o.id} (${o.en}) in Natural Earth`);
  const lonLat = o.at ?? geoCentroid(country);
  if (!geoContains(country, lonLat)) {
    throw new Error(`origins-map: the point of ${o.en} falls outside the country, set "at"`);
  }
  const [x, y] = projection(lonLat);
  if (x < 0 || x > W || y < 0 || y > H) throw new Error(`origins-map: ${o.en} is off the frame`);
  return { ...o, lonLat, x, y, shape: pathString(country, 1) };
});
const [hx, hy] = projection([HOME.lon, HOME.lat]);

/**
 * A fine arc from an origin to Arnouville: a quadratic curve bowed to the
 * left of the way (west for the African lands, so the routes fan out over
 * the Atlantic side like the sea roads they recall), at a sixth of its length.
 */
function route(x, y) {
  const dx = hx - x;
  const dy = hy - y;
  const len = Math.hypot(dx, dy);
  const bow = len * 0.16;
  // Left of the direction of travel in screen space (y down): (dy, -dx).
  const cx = x + dx / 2 + (dy / len) * bow;
  const cy = y + dy / 2 + (-dx / len) * bow;
  const f = (v) => Math.round(v * 10) / 10;
  return `M${f(x)} ${f(y)}Q${f(cx)} ${f(cy)} ${f(hx)} ${f(hy)}`;
}

// -------------------------------------------------------------------- SVG

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  `<g fill="${STYLE.originFill}" stroke="${STYLE.originStroke}" stroke-opacity="${STYLE.originStrokeOpacity}" stroke-width="${STYLE.coastWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke">`,
  ...origins.map((o) => `<path d="${o.shape}" vector-effect="non-scaling-stroke"/>`),
  '</g>',
  `<path d="${coast}" fill="none" stroke="${STYLE.coast}" stroke-opacity="${STYLE.coastOpacity}" stroke-width="${STYLE.coastWidth}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`,
  `<g fill="none" stroke="${STYLE.route}" stroke-opacity="${STYLE.routeOpacity}" stroke-width="${STYLE.routeWidth}" stroke-linecap="round">`,
  ...origins.map((o) => `<path d="${route(o.x, o.y)}" vector-effect="non-scaling-stroke"/>`),
  '</g>',
  '</svg>',
].join('');

const round = (v) => Math.round(v * 10) / 10;
const data = {
  source: 'Natural Earth 1:50m (public domain) via world-atlas 2; scripts/origins-map.mjs',
  width: W,
  height: H,
  origins: origins.map((o) => ({
    key: o.key,
    names: { fr: o.fr, en: o.en },
    x: round(o.x),
    y: round(o.y),
    label: o.label,
  })),
  home: {
    key: HOME.key,
    names: { fr: HOME.fr, en: HOME.en },
    x: round(hx),
    y: round(hy),
    label: HOME.label,
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'origins-map.svg'), `${svg}\n`);
writeFileSync(join(outDir, 'origins-map.json'), `${JSON.stringify(data, null, 2)}\n`);
console.log(
  `origins-map: ${W} x ${H}, svg ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB, ` +
    origins.map((o) => `${o.en} ${o.lonLat.map((v) => v.toFixed(2)).join(',')}`).join('; '),
);
