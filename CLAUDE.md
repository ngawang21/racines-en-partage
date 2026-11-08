# CLAUDE.md

Guide for agents working in this repository. Humans: see `README.md`.

## What this is

The bilingual online shop of Racines en Partage (botanical powders, herbal
teas, seeds and cacao, Arnouville). Static Astro 7 site, French at `/`,
English at `/en/`, cart in the browser, Stripe Checkout and Mondial Relay
through a Cloudflare Worker on `/api/*`, Sveltia CMS at `/admin/`. Private
repository `ngawang21/racines-en-partage`, work on `main`.

Source of truth: `docs/superpowers/specs/2026-11-01-racines-en-partage-shop-design.md`
(v1) and `docs/superpowers/specs/2026-11-08-iteration-3-features-design.md`
(reviews, newsletter, forms, order lookup, search, recipes, unit prices).
Build order, file ownership and the contracts between parallel workers:
`docs/superpowers/plans/2026-11-01-racines-en-partage-implementation-plan.md`
and `docs/superpowers/plans/2026-11-08-iteration-3-implementation-plan.md`.
The reference-site study behind the feature choices is
`docs/superpowers/specs/2026-11-08-reference-sites-study.md`. Launch order,
costs and accounts: `docs/launch-runbook.md` (details in `docs/deployment.md`).

## Commands

`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm check`
(astro check and prettier), `pnpm format`, `pnpm test` (unit),
`pnpm test:build` (after a build), `pnpm test:worker` (Worker API tests),
`pnpm e2e` (Playwright, builds and previews first), `pnpm dev:worker`
(`astro build` then `wrangler dev`, needs `.dev.vars`), `pnpm deploy`,
`pnpm og` (regenerate the Open Graph images after a product change),
`pnpm brand <master.png>` (logo, medallion and icons from the owner's master
logo, then `pnpm og`),
`pnpm card [medaillon|kraft|foret|review]` (business card PDF, PNGs and vCard,
committed; `kraft` is published; `review` renders all three to `out/review/card/`),
`pnpm launch-check`.
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
  `mergePage`, `parseOrThrow`, `dropDanglingRelated`, `publishedProducts`
  (drops `hidden` products and links to them), `compareProducts` (category
  order, then the CMS `order`, then name). Shared fields come from the
  French file only; the English file may hold translated fields only, each
  may be empty.
- `src/i18n/typography.ts` (pure): `frenchTypographyText`,
  `frenchTypographyHtml`, `frenchTypographyDeep`. The loaders apply them to
  French content and the e-mail templates to French e-mails, so the CMS
  files keep plain spaces.
- `src/content/{products,categories,pages}/{fr,en}/*.yml`,
  `src/content/legal/{fr,en}/{legal,terms,privacy}.md`,
  `src/content/settings/shop.yml` (singleton), `src/content/locales/{fr,en}.json`,
  `src/content/reviews/<product slug>--<order>.yml` (customer reviews, not
  localised, written by the Worker or the owner, shown when `published`).
- `src/content.config.ts`: glob collections. Products, categories and pages
  only assert "a YAML mapping" at the collection level (one collection holds
  a complete French file and a partial English one); the strict schemas run
  in the loaders.
- `src/i18n/locale.ts` (build time, imports `astro:content`): `loadLocale`,
  `loadSettings`, `loadProducts`, `loadProduct`, `loadCategories`,
  `loadPage`, `loadLegal`, `loadReviews`, `reviewsFor`, `legalTokens`,
  `formatSiren`. Always read content through these, never with
  `getCollection` directly. `merge.ts` also holds `formatsOf` (100 g and
  200 g siblings by French name), `formatFamilies`, `groupFormats` (one grid
  card per product, the lightest format leads, chips link the others),
  `relatedProducts` (four cards, never a format of the current product),
  `reviewStats`, `publishedReviews`. `src/components/storefront.ts` adds
  `originCountry` (country before the comma) and `pouchCrop` (per-photo crop
  so every pouch sits at the same place in a card; a new photo needs its
  `POUCH_BOXES` entry).
- `src/i18n/fallback.ts` (pure): `deepFallback`, `interpolate`,
  `interpolateHtml`, `escapeHtml`, `pickLabel`.
- `src/i18n/routing.ts` (pure, also imported by `astro.config.mjs`):
  `ROUTES`, `RouteKey`, `NOINDEX_ROUTES`, `isIndexable`, `routePath`,
  `routeUrl`, `alternatesFor`, `matchRoute`, `getLocaleFromUrl`,
  `noindexPathFragments`. The spec's `404` row is the key `notFound`.
- `src/i18n/format.ts` (pure): `formatPrice`, `toCents`, `formatWeight`,
  `formatUnitPrice` (price per kilo, a legal requirement for pre-packaged
  food), `formatRating`, `formatPhone`, `phoneE164`, `formatDate`,
  `localiseNutrition`.
- `src/search/match.ts` (pure): `buildIndex`, `search` over the embedded
  client catalogue (name, category name, `keywords`); `src/scripts/search.ts`
  drives `SearchDialog.astro` from the header.
- `src/forms/`: `kit.ts` (validation, busy state, error mapping), `forms.ts`
  (contact, newsletter, stock alert, newsletter landing), `turnstile.ts`
  (loads Turnstile on first focus when `settings.forms.turnstileSiteKey` is
  set), `review-token.ts` (decodes the review token payload for display only).
- `src/cart/`: besides the cart, `order-view.ts` (shared order renderer of
  the thanks and lookup pages), `page-lookup.ts`, `page-review.ts`,
  `cross-sell.ts` (`pickCrossSell`: complements first, never another format
  of a product in the cart), `cross-sell-view.ts`, `shipping-hint.ts`
  (`shippingHint`, `shippingHintText`, `wholePrice`: the delivery line of the
  cart and drawer from the settings). The checkout preselects Point Relais
  (the map loads on search or when the block comes into view).
- `worker/`: `tokens.ts` (HMAC tokens), `forms.ts` (contact, newsletter),
  `reviews.ts` (`submitReview`, `inviteReviews` cron), `yaml.ts`,
  `github.ts` (Contents API), `turnstile.ts`; `orders.ts` has
  `findOrderByNumber`. `worker/README.md` lists every route.
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
- Business card: `docs/branding/card/card.html` (three variants, `data-variant`)
  rendered by `scripts/business-card.mjs` to `docs/branding/card/` and
  `public/carte/`, plus `public/racines-en-partage.vcf`; `CardView.astro` is the
  `/carte/` page (route `card`, noindex). See `docs/branding/README.md`.

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
  The site serves its own Fraunces subsets (`src/assets/fonts/`, roman with
  `opsz`, italic pinned at 48, SOFT 50 and WONK 1 baked in, weights 400 to
  600, about 93 KB together) built by `scripts/subset-fonts.sh` (fonttools
  and brotli) from the @fontsource `full` files; the business card script
  keeps using the full files. Figtree stays the @fontsource variable file.
- `compressHTML` is `'jsx'`: use `{' '}` where inline elements need a space.
  Built HTML is mostly one line; count matches, not lines, when grepping.
- The `assetsInlineLimit` guard keeps component scripts external so the CSP
  `script-src 'self'` holds. Only `application/ld+json` and
  `application/json` scripts may be inline (build test).
- Legal Markdown is rendered first, then `{company}`, `{siren}`, `{siret}`,
  `{address}`, `{email}`, `{phone}`, `{host}` and `{vat}` are replaced in
  the HTML with escaped values. The Markdown renderer turns straight
  apostrophes into typographic ones.
- The settings hold `brand.siret` (14 digits); `{siren}` is its first nine
  digits. An empty SIRET renders "en cours d'immatriculation";
  `pnpm launch-check` fails while it is empty or fails the Luhn check, until
  `launch.pricesConfirmed` is true (the two cacao prices are still
  placeholders) and while a `TODO` remains in a legal text (publication
  director, mediator).
- `.prettierignore` excludes the owner-edited content folders
  (`src/content/{products,categories,pages,legal,reviews,settings}`): Sveltia
  writes its own YAML style and a CMS save must never fail `pnpm check`. The
  unit tests still parse every file; format them by hand when you edit them.
- Feature switches the owner controls (`settings.newsletter.enabled`,
  `settings.newsletter.welcomeCode`, `settings.reviews.enabled`) reach the
  Worker through `features` in `dist/catalog.json`; the Worker also disables
  a route when its secret is missing (`FORMS_SECRET`, `RESEND_AUDIENCE_ID`,
  `GITHUB_TOKEN`). Turnstile is required in production: without
  `TURNSTILE_SECRET_KEY` the contact and newsletter routes answer
  `FEATURE_DISABLED` (local development sets `FORMS_ALLOW_WITHOUT_CAPTCHA`
  in `.dev.vars`); the CMS site key and the secret are both set or both
  empty, otherwise every form fails with `CAPTCHA_FAILED`. The optional
  `FORMS_KV` binding (commented out in `wrangler.jsonc` until the namespace
  exists) caps form-triggered e-mails at `FORMS_DAILY_LIMIT` a day so the
  order e-mails keep their Resend quota.
- Reviews reach the repository as commits made by the Worker through the
  GitHub Contents API (`GITHUB_TOKEN`, contents read and write on this
  repository only) with `published: false`; nothing shows until the owner
  toggles it in Sveltia. The invitation cron runs daily (`wrangler.jsonc`
  `triggers`), 7 days after the order, idempotent through session metadata.
- `playwright.config.ts` caps local workers at 16: the development machine has
  128 cores and unbounded workers made the mobile checkout tests time out.
- Barley contains gluten: the roasted barley file does not repeat the
  label's "sans gluten" and lists no gluten under `free_from`. The cacao
  nibs table repeats the moringa values and stays hidden
  (`nutritionVerified: false`).
- Nutrition values are shared, typed as printed in French; English pages
  pass them through `localiseNutrition`. The tiger nut tubercules label
  prints ranges, which is not a valid declaration, so its table stays hidden.
- Product `benefits` carry no health or nutrition claim beyond what a
  displayed nutrition table supports (EU regulation 1924/2006): "source de
  protéines" on moringa is backed by its table; "favorise le transit",
  "antioxydant", "bonne énergie" and similar label phrases were removed and
  are listed in `docs/client/presentation.md` for the owner.
- French content is typeset at load time (`src/i18n/typography.ts`): a test
  or grep that looks for "Livraison :" in built HTML must expect U+00A0
  before the colon and U+202F before `;` `!` `?` `%` and units.
- A product with `hidden: true` has no page, no catalogue entry and no
  sitemap URL; the CMS "Réorganiser" writes `order` into the French file.
- `pnpm test:build` needs a fresh `pnpm build`.
- `pnpm e2e` builds, then serves `dist/` on port 4323 with
  `astro preview --ignore-lock` (astro preview otherwise refuses a second
  server per project). `E2E_SKIP_BUILD=1 pnpm e2e` reuses an existing build.
  `@playwright/test` is pinned to 1.62.1, whose Chromium (revision 1234) is
  the one installed on the development machine; CI runs
  `pnpm exec playwright install --with-deps chromium`. This machine needs
  `LD_LIBRARY_PATH=$HOME/.local/lib` for Chromium (libasound):
  `playwright.config.ts` adds it to the browser and server environment when
  the folder exists. `/api/*` is route-mocked per test.
- Cart client: `src/cart/ui.ts` (every page, about 7 KB gzipped) reads
  `#rep-catalog` and `#rep-strings`; `page-cart`, `page-checkout`,
  `page-thanks` and `relay-widget` are dynamic chunks. Strings with
  `{token}` placeholders are embedded with `serializeStrings`, which writes
  the brace as `{` so no raw token reaches the HTML (build test).
- The Mondial Relay widget runs under the checkout CSP without
  `'unsafe-eval'` or `'unsafe-inline'`: `relay-widget.ts` replaces
  `jQuery.globalEval` (the widget injects one inline script, reproduced
  natively) and strips the widget's inline `onclick` attributes, replaying
  the known `MR_jQuery(...).trigger(...)` shapes via `parseInlineHandler`.
  jQuery 2.2.4 and Leaflet 1.9.4 are vendored in `public/vendor/` (hashes
  in its README); `preemptWidgetLeaflet` plants inert `<head>` elements with
  the unpkg Leaflet URLs so the widget's init does not fetch them.
  `REMOTE_HOSTS` in `relay-widget.ts` must match the checkout CSP blocks
  (`tests/build/headers.test.ts`). A widget update that changes those shapes
  shows up as list items that no longer select a point: run
  `node scripts/relay-capture.mjs` after `pnpm build` (`docs/deployment.md`,
  section 11.2) and extend the parser.
- Sveltia is pinned (`public/admin/index.html`, version plus `integrity`)
  and the admin `script-src` allows that version's folder only: upgrade both
  together (`docs/content.md`, "Upgrading Sveltia").
