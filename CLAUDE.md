# CLAUDE.md

Guide for agents working in this repository. Humans: see `README.md`.

## What this is

The bilingual online shop of Racines en Partage (botanical powders, herbal
teas, seeds and cacao, Arnouville). Static Astro 7 site, French at `/`,
English at `/en/`, cart in the browser, Stripe Checkout and Mondial Relay
through a Cloudflare Worker on `/api/*`, Sveltia CMS at `/admin/`. Private
repository `ngawang21/racines-en-partage`, work on `main`.

Source of truth: `docs/superpowers/specs/2026-11-01-racines-en-partage-shop-design.md`.
Build order, file ownership and the contracts between parallel workers:
`docs/superpowers/plans/2026-11-01-racines-en-partage-implementation-plan.md`.

## Commands

`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm check`
(astro check and prettier), `pnpm format`, `pnpm test` (unit),
`pnpm test:build` (after a build), `pnpm launch-check`. `pnpm test:worker`,
`pnpm e2e` and `pnpm dev:worker` are placeholders until waves 2B and 2C.
Node 22 (`.nvmrc`), pnpm 9 (`packageManager`). Use `pnpm exec`, not `npx`.

## Layout

- `src/consts.ts`: `SITE`, `LOCALES`, `DEFAULT_LOCALE`, `Locale`,
  `INTL_LOCALE`, `OG_LOCALE`, `HOST`.
- `src/content/schemas.ts` (pure zod, no Astro import): product, category,
  pages, legal frontmatter, settings, and `validateCatalog` (unique SKU and
  slug, known category, related slugs, image files).
- `src/content/locale-schema.ts`: UI strings schema, namespaces `nav`,
  `footer`, `shop`, `product`, `cart`, `checkout`, `thanks`, `errors`,
  `legal`, `a11y`. Fields are null tolerant; empty means "fall back to
  French".
- `src/content/merge.ts` (pure): `mergeProduct`, `mergeCategory`,
  `mergePage`, `parseOrThrow`. Shared fields come from the French file only;
  the English file may hold translated fields only, each may be empty.
- `src/content/{products,categories,pages}/{fr,en}/*.yml`,
  `src/content/legal/{fr,en}/{legal,terms,privacy}.md`,
  `src/content/settings/shop.yml` (singleton), `src/content/locales/{fr,en}.json`.
- `src/content.config.ts`: glob collections. Products, categories and pages
  only assert "a YAML mapping" at the collection level (one collection holds
  a complete French file and a partial English one); the strict schemas run
  in the loaders.
- `src/i18n/locale.ts` (build time, imports `astro:content`): `loadLocale`,
  `loadSettings`, `loadProducts`, `loadProduct`, `loadCategories`,
  `loadPage`, `loadLegal`, `legalTokens`. Always read content through these,
  never with `getCollection` directly.
- `src/i18n/fallback.ts` (pure): `deepFallback`, `interpolate`,
  `interpolateHtml`, `escapeHtml`, `pickLabel`.
- `src/i18n/routing.ts` (pure, also imported by `astro.config.mjs`):
  `ROUTES`, `RouteKey`, `NOINDEX_ROUTES`, `isIndexable`, `routePath`,
  `routeUrl`, `alternatesFor`, `matchRoute`, `getLocaleFromUrl`,
  `noindexPathFragments`. The spec's `404` row is the key `notFound`.
- `src/i18n/format.ts` (pure): `formatPrice`, `toCents`, `formatWeight`,
  `formatPhone`, `phoneE164`, `formatDate`, `localiseNutrition`.
- `src/images.ts`: `resolveAsset(path)` and `hasAsset(path)` over
  `import.meta.glob('/src/assets/**/*.{webp,png,jpg,svg}')`.
- `src/catalog/build.ts` (pure): `buildCatalog` (the Worker's
  `dist/catalog.json`), `buildClientCatalog` (the cart catalogue of one
  locale), `productLabel`, `serializeForScript`, types `WorkerCatalog`,
  `ClientCatalog`, `ClientProduct`.
- `src/cart/catalog.ts` (build time): `getClientCatalog(locale)`,
  `getWorkerCatalog(now)`. `src/pages/catalog.json.ts` is the static
  endpoint that writes `dist/catalog.json`.
- `src/seo/graph.ts` (pure): `buildGraph`, `productGraphInput`,
  `robotsContent`, `serializeGraph`. `Seo.astro` only wires props.
- `src/layouts/Base.astro`: fonts, Seo, skip link, announcement bar, shop
  closed notice, Header, main, Footer, then `CartDrawer` and `CartScripts`.
- `src/components/`: `Header`, `Footer`, `Seo`, `LanguagePill`, `Icon`,
  `Picture` (presets `card`, `hero`, `gallery`, `thumb`), `Ornament`
  (hairline with the hibiscus glyph), and the wave 2B placeholders
  `CartDrawer` and `CartScripts`.
- `src/pages/`: thin routes; stubs until wave 2A and 2B fill them.

## Contracts (from the plan)

- Add to cart: `<button type="button" data-add-to-cart data-sku="REP-MOR-100">`,
  optional `<input data-qty-for="REP-MOR-100">`; stock `out` renders the
  button `disabled` with `data-stock="out"`.
- Header cart button: `<button type="button" data-cart-toggle aria-controls="cart-drawer">`
  with `<span data-cart-count>` inside (markup: foundation, style: 2A,
  behaviour: 2B). `CartDrawer` must keep `id="cart-drawer"`.
- `Base.astro` mounts `<CartDrawer locale={locale} />` then
  `<CartScripts locale={locale} />` before `</body>`. `<body>` carries
  `data-locale` and `data-shop-open`.
- Client catalogue: no generated file. `CartScripts.astro` (2B) embeds it:
  `<script type="application/json" id="rep-catalog" set:html={serializeForScript(await getClientCatalog(locale))} />`;
  the client parses `#rep-catalog` and imports only types from
  `src/catalog/build.ts`. Server-side components (2A) call `loadProducts`
  or `getClientCatalog` directly. Amounts are integer cents; images are
  root-relative 160 px WebP thumbnails.
- `dist/catalog.json` follows spec 6.2: cents, absolute 800 px WebP image
  URLs, labels `{ fr, en }`.
- CSS: foundation owns `src/styles/tokens.css` and `global.css` (`.btn`,
  `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.badge`,
  `.badge-stock-in|low|out`, `.container`, `.section`, `.band-paper`,
  `.band-forest`, `.hairline`, `.kente`, `.frame`, `.price`, `.eyebrow`,
  `.lead`, `.prose`, `.visually-hidden`, `.skip-link`). 2A appends
  utilities; 2B keeps its styles in `src/styles/cart.css`.
- Locale strings: add keys only inside your namespace, extend
  `locale-schema.ts` with the same null-tolerant `text`, fill both
  `fr.json` and `en.json`.

## Conventions

- One-line conventional commits, no assistant attribution.
- No em dash characters in Markdown or content (a unit test checks).
- English code, comments and developer docs; French storefront copy first.
- Amounts are integer cents everywhere outside the CMS files; `toCents`
  converts. Prices print with `formatPrice` ("8,90 €" with U+202F in French,
  "€8.90" in English).
- No health claim beyond the label wording. Product `benefits` bullets are
  the label's words, translated literally in English.
- Repository is self-contained; private, all rights reserved, no licence file.

## Gotchas

- Astro 7.4.2 and later refuse to start on Node older than 22.23.4. The
  development machine runs 22.22.1, so the lockfile pins astro 7.4.1
  (engines `>=22.22.0`) under the range `^7.4.1`. Once Node is upgraded,
  `pnpm update astro` is safe; CI and Workers Builds use the latest Node 22.
- vitest cannot resolve `astro:content` or `astro:assets`: keep schemas,
  merging, routing, formatting, graph and catalogue shaping in pure modules
  and test those.
- Collections of products, categories and pages use a loose schema, so a
  content mistake surfaces when a loader runs (every page calls one), with
  the file named in the error. The unit tests parse the same files strictly.
- Glob ids are `fr/<slug>` and `en/<slug>`: a file outside `fr/` or `en/`
  throws in the loaders.
- `astro.config.mjs` imports `src/i18n/routing.ts`. Keep that module free of
  `astro:` imports.
- The sitemap integration's own i18n pairing needs identical paths after the
  locale prefix, which this site does not have (`/boutique/` and
  `/en/shop/`). Alternates come from `serialize` with `matchRoute`; the
  filter drops every `NOINDEX_ROUTES` path.
- `font-variation-settings` takes numbers only; optical sizing is
  `font-optical-sizing: auto` next to `font-variation-settings: 'SOFT' 50`.
  Only the Fraunces `full` files carry both the `opsz` and `SOFT` axes.
- `compressHTML` is `'jsx'`: use `{' '}` where inline elements need a space.
  Built HTML is mostly one line; count matches, not lines, when grepping.
- The `assetsInlineLimit` guard keeps component scripts external so the CSP
  `script-src 'self'` holds. Only `application/ld+json` and
  `application/json` scripts may be inline (build test).
- Legal Markdown is rendered first, then `{company}`, `{siren}`,
  `{address}`, `{email}`, `{phone}`, `{host}` and `{vat}` are replaced in
  the HTML with escaped values. The Markdown renderer turns straight
  apostrophes into typographic ones.
- An empty SIREN renders "en cours d'immatriculation"; `pnpm launch-check`
  fails until it is set, until `launch.pricesConfirmed` is true and while a
  `TODO` remains in a legal text (publication director, mediator).
- Prettier formats YAML too and rewrites long flow mappings in `shop.yml`.
- Barley contains gluten: the roasted barley file does not repeat the
  label's "sans gluten" and lists no gluten under `free_from`. The cacao
  nibs table repeats the moringa values and stays hidden
  (`nutritionVerified: false`).
- Nutrition values are shared, typed as printed in French; English pages
  pass them through `localiseNutrition`.
- `pnpm test:build` needs a fresh `pnpm build`.
