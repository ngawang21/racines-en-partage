# Racines en Partage: implementation plan

Spec: `docs/superpowers/specs/2026-11-01-racines-en-partage-shop-design.md`
(source of truth; this plan adds the build order, file ownership and the
contracts between parallel workers). Deadline: Monday 2026-11-02, 07:00.

## Goal

A production-grade bilingual storefront for Racines en Partage: products,
cart, Stripe Checkout, Mondial Relay pickup points, order e-mails, Sveltia CMS
for the owner, SEO, tests, CI, deployment and handover documentation, in a
self-contained private repository `ngawang21/racines-en-partage`.

## Architecture

```
Browser (static Astro pages + cart island)
   |  GET pages, /_astro/*, /catalog.json        POST /api/checkout, GET /api/orders/:id
   v                                              v
Cloudflare Worker "racines-en-partage" ----------- assets (dist/) + Hono API (worker/)
   |  fetch ASSETS /catalog.json (prices, shipping, stock)
   |  Stripe API (Checkout Sessions, retrieve)  <---- Stripe webhook POST /api/webhooks/stripe
   |  Resend API (owner + customer e-mails)
Sveltia CMS at /admin/ (static) -> GitHub API (commits to main) -> Workers Builds -> deploy
Mondial Relay widget (checkout only) -> widget.mondialrelay.com
```

## Tech stack (versions checked on the npm registry on 2026-11-01)

astro 7.4.4, @astrojs/sitemap 3.7.4, @astrojs/check 0.9.12, typescript 5.9,
zod 4.6, vitest 5.0, wrangler 4.156, hono 4.13, stripe 23.1, prettier 3 with
prettier-plugin-astro, sharp 0.35, @playwright/test (latest), fonts
@fontsource-variable/fraunces 5.3 and @fontsource-variable/figtree 5.3,
Sveltia CMS from unpkg (`@sveltia/cms`, 0.256.x), Node 22 (`.nvmrc`), pnpm 9
(`packageManager`). No React, no UI framework, no Astro adapter (the Worker is
a separate entry in `worker/` deployed with the static assets by one
`wrangler deploy`).

## Global constraints

- Conventions of the Lamsel repository apply unless the spec says otherwise:
  thin routes, components take `{ locale, content }`, plain CSS tokens, strict
  CSP with no inline script except JSON-LD, `compressHTML: 'jsx'`, the
  `assetsInlineLimit` guard, one JSON-LD graph per page, robots meta on every
  page, `trailingSlash: 'always'`.
- No em dash in any Markdown file. One-line conventional commits, no
  attribution. English code, comments and developer docs; French owner guide
  and French storefront copy first, English second.
- The repository is self-contained: no path outside it. Photo originals stay
  out; derivatives are committed under `src/assets/`.
- Amounts are integers in cents outside the CMS files. Dates ISO 8601.
- Every wave ends with `pnpm check && pnpm test && pnpm build && pnpm test:build`
  green, and a visual check of the touched routes at 390 and 1280 px.
- ECC GateGuard hook: the first Write or Edit of a file may be denied once;
  state the facts asked for and retry the same call. Batch large file sets in
  one script when convenient.

## Contracts between parallel workers (wave 2)

### DOM and data contracts

- Every element that adds a product to the cart is
  `<button type="button" data-add-to-cart data-sku="REP-MOR-100">`; an
  optional sibling quantity input is `<input data-qty-for="REP-MOR-100">`.
  The cart script (owner: 2B) delegates clicks on `[data-add-to-cart]`.
- Stock `out` renders the button `disabled` with `data-stock="out"`; the cart
  script never enables it.
- The header cart button is `<button type="button" data-cart-toggle
  aria-controls="cart-drawer">` with `<span data-cart-count>` inside (owner of
  the markup: foundation; styling: 2A; behaviour: 2B).
- `Base.astro` mounts `<CartDrawer locale={locale} />` right before
  `</body>` and `<CartScripts locale={locale} />` (owner: 2B; foundation ships
  empty placeholder components with the same names and props).
- Prices for display come from `src/cart/catalog.generated.json` (owner:
  foundation) imported by both 2A (server side, build time) and 2B (client
  bundle, locale-filtered subset injected as `<script type="application/json"
  id="rep-catalog">`, which is allowed by the CSP because it is not
  executable).
- `catalog.json` in `dist/` and the Worker API are fixed by spec section 6.
- CSS: foundation owns `src/styles/tokens.css` and `src/styles/global.css`
  (reset, typography, buttons `.btn`, `.btn-primary`, `.btn-secondary`,
  `.btn-ghost`, badges `.badge`, `.badge-stock-*`, containers, hairline and
  kente utilities). 2A owns component styles inside its `.astro` files and
  may append utilities to `global.css`. 2B keeps its styles in
  `src/styles/cart.css` imported by `CartDrawer.astro` and the cart pages.
- Routes: foundation ships `src/i18n/routing.ts` with every route key of spec
  section 3 and the page files for all routes rendering a stub heading. 2A
  fills storefront, about, faq, contact, legal pages and 404; 2B fills cart,
  checkout and thanks pages.
- Locale strings: foundation defines the `fr.json` and `en.json` schema with
  namespaces `nav`, `footer`, `shop`, `product`, `cart`, `checkout`,
  `thanks`, `errors`, `legal`, `a11y`. 2A and 2B add keys inside their
  namespaces only and extend the zod schema accordingly (nullish, fallback
  to FR).

### File ownership

| Area | Owner | Paths |
| --- | --- | --- |
| Foundation | wave 1 | `package.json`, configs, `src/consts.ts`, `src/content/**` (schemas, seed data, locales), `src/i18n/**`, `src/seo/**`, `src/images.ts`, `src/layouts/Base.astro`, `src/components/{Header,Footer,Seo,LanguagePill,Icon,Picture}.astro`, `src/styles/{tokens,global}.css`, `integrations/catalog.ts`, `scripts/*`, `tests/unit/*`, `tests/build/*`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md` |
| Storefront | 2A | `src/pages/**` except cart, checkout, thanks; `src/components/**` for storefront sections; `public/_headers`, `public/robots.txt`, OG image generation |
| Cart and checkout | 2B | `src/cart/**`, `src/components/{CartDrawer,CartScripts,RelayPicker,QuantityStepper}.astro`, `src/pages/{panier,commande,merci}.astro` and EN twins, `src/styles/cart.css`, `tests/e2e/**`, `playwright.config.ts`, CSP lines for checkout routes in `public/_headers` (coordinate: append a route block, do not edit the global one) |
| Worker | 2C | `worker/**`, `wrangler.jsonc`, `.dev.vars.example`, `tests/worker/**`, `vitest.worker.config.ts` |
| CMS and docs | 2D | `public/admin/**`, `docs/guide-proprietaire.md`, `docs/content.md`, `docs/deployment.md`, `docs/handover.md`, `docs/client/presentation.md`, `docs/legal-notes.md` |

## Phases

### Wave 1: foundation (sequential, one implementer)

- [x] Scaffold: `package.json` (scripts `dev`, `build`, `preview`, `check`,
      `format`, `test`, `test:build`, `test:worker`, `e2e`, `launch-check`,
      `dev:worker`), `.nvmrc` 22, `.editorconfig`, `.prettierrc` (+ astro
      plugin), `.prettierignore`, `.gitignore` (node_modules, dist, .astro,
      .wrangler, out, .env*, .dev.vars, test-results, playwright-report,
      `src/cart/catalog.generated.json`), `tsconfig.json` strict,
      `astro.config.mjs` (site `https://racinesenpartage.fr`, static, i18n fr
      default + en, sitemap with filter for noindex routes and `/admin/`,
      `compressHTML: 'jsx'`, `assetsInlineLimit` guard, catalog integration).
- [x] `src/consts.ts`: `SITE`, `LOCALES`, `DEFAULT_LOCALE`, `Locale` type.
- [x] Content schemas (`src/content/schemas.ts`, zod, pure) for product,
      category, pages, settings; `src/content.config.ts` with glob loaders:
      products `src/content/products/{fr,en}/*.yml`, categories
      `src/content/categories/{fr,en}/*.yml`, pages
      `src/content/pages/{fr,en}/*.yml`, legal `src/content/legal/{fr,en}/*.md`,
      settings `src/content/settings/shop.yml`, locales
      `src/content/locales/*.json`.
- [x] Seed content: 10 products FR and EN from spec appendix A (EN translated
      with care, culinary tone, no new health claims), 4 categories, home,
      about, faq, contact pages FR and EN, legal, terms and privacy Markdown
      FR and EN with placeholders, `shop.yml` from spec 4.4, `fr.json` and
      `en.json` UI strings for all namespaces (complete French, complete
      English).
- [x] `src/i18n/fallback.ts` (deepFallback, interpolate), `src/i18n/locale.ts`
      (loadLocale, loadProducts(locale) merging FR shared fields and EN
      translations, loadCategories, loadPage, loadSettings), `src/i18n/routing.ts`
      (`ROUTES`, `routePath`, `routeUrl`, `alternatesFor`), `src/i18n/format.ts`
      (`formatPrice(cents, locale)`, `formatWeight`).
- [x] `src/images.ts`: `resolveAsset(path)` over `import.meta.glob` of
      `/src/assets/**`; throws on a missing file at build.
- [x] `integrations/catalog.ts`: Astro integration that, at `astro:config:setup`
      or `astro:build:start`, writes `src/cart/catalog.generated.json` (per
      locale display data) and, at `astro:build:done`, `dist/catalog.json`
      (spec 6.2) with absolute image URLs taken from the built product image
      (use a fixed 800 px WebP rendered by `getImage` in the integration or a
      dedicated endpoint `src/pages/catalog.json.ts`; the endpoint is the
      simpler choice: a static endpoint that imports the collections and
      `getImage`, so `dist/catalog.json` is just another page). Prefer the
      endpoint.
- [x] `src/seo/graph.ts` (pure): `buildGraph({ kind: 'home'|'shop'|'category'|'product'|'faq'|'page', ... })`
      and `robotsContent`; `src/components/Seo.astro` wires it.
- [x] `src/styles/tokens.css` and `global.css` per spec 5.1 to 5.3 (buttons,
      badges, hairline, kente divider, container, visually-hidden, focus).
      Fonts imported in `Base.astro`.
- [x] `Base.astro` (head, Seo, Header, main, Footer, CartDrawer and
      CartScripts placeholders, announcement bar, shop-closed notice),
      `Header.astro` (medallion, wordmark, nav, language pill, cart button per
      contract, mobile `<details>` menu), `Footer.astro` (brand, contact,
      links, legal links, ESAT line, kente divider on top), `LanguagePill.astro`,
      `Icon.astro` (inline SVG set: cart, menu, close, leaf, truck, pin,
      lock, shield, check, chevron, minus, plus, flower), `Picture.astro`
      wrapper around `astro:assets` Picture with sizes presets.
- [x] Pages: every route of spec section 3 as a thin file rendering `Base`
      with a stub `<h1>` and the right `routeKey`, `noindex` where specified;
      `404.astro`; `catalog.json.ts`; `robots.txt` in public.
- [x] Scripts: `scripts/launch-check.mjs` (SIREN, pricesConfirmed, TODO in
      legal), `scripts/generate-og.mjs` placeholder left to 2A.
- [x] Tests: unit for schemas, fallback, routing, format, graph, catalog
      endpoint shape (import the module and call GET with a mocked
      collection, or test the pure `buildCatalog(products, settings)` it
      calls); build tests over `dist/` (pages exist for every route in both
      locales, one JSON-LD each, robots meta, hreflang on indexable pages, no
      inline script, catalog.json valid and consistent with content).
- [x] CI workflow, `README.md`, `CLAUDE.md` (what this is, commands, layout,
      conventions, gotchas), first commit `chore: scaffold astro storefront`
      then `feat: content model, seed catalogue, i18n, seo graph`.

### Wave 2: parallel implementers (start when wave 1 is green)

2A Storefront and design (spec 5):
- [x] Home sections, shop grid with chips and sort, category pages, product
      page (gallery, accordions, related, footnote), about, faq, contact,
      legal pages with interpolation, 404, OG image per product (script with
      sharp: 1200 by 630, cream background, product photo, name, medallion)
      and a default OG image, favicons wired (`public/icons`,
      `apple-touch-icon.png`, `favicon.svg` simple hibiscus glyph,
      `site.webmanifest`), `public/_headers` global block, `robots.txt`.
- [x] Visual QA at 390 and 1280 px with screenshots in `out/review/` (git
      ignored); iterate until it reads premium: spacing rhythm, type scale,
      image frames, hover states, motion within reduced-motion rules.
- [x] Build tests extended: product pages carry `Product` with `Offer`, FAQ
      carries `FAQPage`, OG image exists per product.

2B Cart and checkout (spec 5.4 cart, checkout, thanks; 6.1; 6.4):
- [x] `src/cart/store.ts` (pure, tested), `src/cart/totals.ts` (pure,
      tested), `src/cart/ui.ts` (DOM glue: delegation, drawer, count,
      aria-live, steppers), `CartDrawer.astro`, `CartScripts.astro`, cart
      page, checkout page with the three methods and the Mondial Relay
      widget (`RelayPicker.astro`, loader that injects jQuery, Leaflet and
      the plugin only when selected, `BDTEST` fallback brand, network hosts
      captured with headless Chromium and written to the checkout CSP block
      and to `docs/deployment.md` section "CSP"), terms checkbox, call to
      `POST /api/checkout`, inline errors incl. out-of-stock highlighting,
      thanks page with `GET /api/orders/:id`, cart cleared on `paid`.
- [x] Playwright config and e2e per spec 8 (route mock for `/api/*`), run
      against `astro preview`; `pnpm e2e` in CI.

2C Worker (spec 6.2, 6.3):
- [x] `worker/index.ts` (fetch handler: `/api/*` to Hono, else `ASSETS`),
      `worker/app.ts` (`createApp(deps)`), `worker/checkout.ts`,
      `worker/orders.ts`, `worker/webhook.ts`, `worker/email/*.ts`
      (templates FR and EN, owner and customer, plain text alternative),
      `worker/catalog.ts` (ASSETS fetch + 60 s cache + zod validation),
      `worker/errors.ts` (ApiError, uniform body), `worker/stripe.ts`
      (client factory with fetch http client and SubtleCrypto provider),
      `wrangler.jsonc` (name, main, compatibility date and `nodejs_compat`,
      assets dir `./dist`, `html_handling: auto-trailing-slash`,
      `not_found_handling: 404-page`, `run_worker_first: ["/api/*"]`, vars
      `SITE_URL`, `ORDER_EMAIL_FROM`), `.dev.vars.example`, `pnpm dev:worker`.
- [x] Tests with fakes for every path of the contract, idempotency keys,
      free shipping at threshold, closed shop, relay metadata, webhook
      signature failure, missing RESEND key path.
- [x] Security pass: no secret in responses or logs, `no-store`, JSON only,
      body size limit, CORS same-origin only.

2D CMS and documentation (spec 4, 9, 10):
- [x] `public/admin/index.html` (noindex) and `public/admin/config.yml`:
      GitHub backend `ngawang21/racines-en-partage` branch `main`, `base_url`
      placeholder for the Authenticator worker, `site_url`, `display_url`,
      `logo`, `media_folder: /src/assets/products`, `public_folder:
      /src/assets/products`, `media_libraries.default.config` with WebP
      transformation (quality 85, 2048 px), `max_file_size` 2 MB,
      `slugify_filename`, i18n `multiple_folders` `[fr, en]` default `fr`,
      collections products (fields mirroring `schemas.ts` with French
      labels, hints, `i18n: duplicate` on shared fields, `number` with
      `value_type: float` and `step: 0.1`, `image` `multiple: true`,
      `select` stock and category via `relation`, `list` fields, `object`
      recipe and nutrition, `summary`, `sortable_fields`, `view_filters` by
      stock and category, `thumbnail: images`), categories, pages (file
      collection, i18n), legal (file collection, markdown), settings
      singleton (not i18n except label objects). The config is validated
      against the schema URL in a unit test (fetch skipped offline: validate
      structure with a local check that every content field exists in
      `schemas.ts` and vice versa).
- [x] `docs/guide-proprietaire.md` (FR, screenshots optional): se connecter,
      modifier un produit, prix, photo, rupture, nouveau produit, supprimer,
      catégories, textes des pages, frais de port et seuil, pause boutique,
      annonces, commandes dans Stripe, préparer un colis Mondial Relay,
      rembourser, codes promo, e-mails, que faire si.
- [x] `docs/deployment.md` (EN, developer): GitHub, Cloudflare Workers Builds,
      secrets, domain at OVHcloud with DNS at Cloudflare, Resend DNS, Stripe
      account and webhook, Mondial Relay Offre Start and brand code, Sveltia
      Authenticator and GitHub OAuth app, go-live checklist, troubleshooting.
- [x] `docs/handover.md` (EN): accounts matrix, transfer steps, assignment
      letter template, support options, costs, independence plan.
- [x] `docs/client/presentation.md` (FR): ce que Marie reçoit, comment ça
      marche, coûts, ce qu'elle doit fournir (SIREN, prix, statut TVA,
      origines manquantes, Instagram, compte Stripe, compte Mondial Relay,
      validation CGV et médiateur, textes "Notre histoire"), prochaines étapes.
- [x] `docs/legal-notes.md` (EN): food supplement rules summary (DGCCRF
      declaration, claims, labelling), points flagged on labels (grués table,
      barley gluten wording, missing origins), what the site does about them.
- [x] `docs/content.md` (EN): content model and file layout for developers.

### Wave 3: integration, QA, release

- [x] Merge check: `pnpm check`, `pnpm test`, `pnpm test:worker`, `pnpm build`,
      `pnpm test:build`, `pnpm e2e`.
- [x] Full visual review of every route FR and EN at 390 and 1280 px; design
      iteration round with the storefront implementer.
- [x] Accessibility scan (axe through Playwright) on home, shop, product,
      cart, checkout; fix every serious or critical issue.
- [x] Security review of `worker/` and `_headers` (ecc security reviewer).
- [x] Code review (ecc code reviewer) on the whole diff; fix blocking items.
- [x] `pnpm launch-check` documented as failing until the owner inputs land.
- [x] Final docs pass, `CLAUDE.md` gotchas, README.
- [x] Commits per wave; push after the GitHub repository exists (push pending: repository to be created on github.com).
- [x] Memory notes for the developer (project file) updated.

## Progress log

- 2026-11-01 18:10 spec and plan written; assets derived into
  `src/assets/` and `public/icons`; git initialised on `main`.
- 2026-11-01 wave 1 (foundation): scaffold, content model and seed
  catalogue FR and EN, i18n loaders and routing, SEO graph, catalogue
  endpoint, tokens and layout, thin routes, launch check, CI, README and
  CLAUDE.md; unit and build tests green.
- 2026-11-01 wave 2 (2A storefront, 2B cart and checkout, 2C Worker, 2D CMS
  and docs): every storefront page, OG images, cart drawer and pages,
  checkout with the Mondial Relay widget under a strict CSP, thanks page,
  Worker API with Stripe and Resend, Sveltia CMS, owner guide, deployment,
  handover, presentation and legal notes. Tests: unit 152, worker 96, build
  30, e2e 10.
- 2026-11-01 wave 3 (polish): larger 4:3 home hero, walk of every route FR
  and EN at 390 and 1280 px (`out/review/3/`), typographic apostrophes in the
  content, locale-aware colons, weights that never wrap, round free-shipping
  threshold at checkout, axe scan in `tests/e2e/a11y.spec.ts` (language pill
  label in name, leaf and kraft text contrast, unique legal nav label; zero
  violations left on the scanned pages), CSP section of `docs/deployment.md`.
  Tests: unit 154, worker 96, build 30, e2e 30.
- 2026-11-01 20:00 wave 3 hardening after the code and security reviews:
  vendored jQuery 2.2.4 and Leaflet 1.9.4 (checkout CSP no longer trusts
  unpkg or googleapis), Sveltia pinned with integrity, relay text allow-list
  and shorter Stripe submit text, Workers rate limiting bindings, 48 h order
  lookup window and tighter e-mail masking, webhook idempotency through
  session metadata and permanent mail errors handled, line items through
  `listLineItems`, discount row on the thanks page, postcode field error,
  `tests/build/headers.test.ts`, HSTS `includeSubDomains`. Gates: unit 154,
  worker 138, build 36, e2e 32, `wrangler deploy --dry-run` green. Admin
  `script-src` kept on the whole unpkg host so Sveltia's helper imports keep
  working after sign-in.
- 2026-11-01 23:00 second iteration after the push to GitHub: brand assets
  rebuilt from the owner's master logo (`pnpm brand`, medallion keeps the
  whole hibiscus, hibiscus mark favicons, OG cards regenerated); order flow
  audit with 11 fixes (`PRICE_CHANGED` guard, every Worker error code mapped
  to a message, thanks page retries, per-recipient idempotency keys,
  `async_payment_failed` logged, preview return URL); CMS rework (hidden and
  ordered products, French hints on every field, relation filters, WebP at
  1600 px, 19 owner recipes, config validated against the 0.256.1 JSON
  schema); front-end polish (framed photo crops, mobile menu with scrim and
  Escape, print styles, font fallback metrics, hero entrance, scroll reveal,
  card hover, 44 px targets); French typography at load time; unauthorised
  health claims removed from the product pages and the policy written down;
  CGV aligned with L221-24 with a withdrawal form; English wording pass;
  admin CSP allows `'wasm-unsafe-eval'` for Sveltia's image codecs. Gates:
  unit 188, worker 167, build 36, e2e 44.
- 2026-11-08 iteration 3 (owner notes of 2026-11-08, spec
  `2026-11-08-iteration-3-features-design.md`, plan
  `2026-11-08-iteration-3-implementation-plan.md`, reference study made with
  REA on kasana.bio, Nature Snacks, Herboristerie du Valmont and Thés &
  Traditions): Gmail address and SIRET, the owner's prices, origins and
  descriptions, baobab 200 g, keywords; moderated verified reviews (daily
  cron, token link, GitHub commit, owner publishes in Sveltia, aggregate
  rating and JSON-LD), newsletter with double opt-in (Resend Audiences),
  contact form and stock alert with Turnstile, order lookup by number and
  e-mail, header search, recipes page, price per kilo, formats, cart
  cross-sell, how-it-works band, Cloudflare Web Analytics switch, CMS
  collection "Avis clients" and new settings, owner guide recipes, privacy
  policy and legal notes updated, Hello Bank answer in the client letter.
  Security review (Turnstile required in production, KV daily e-mail
  budget, POST confirmation, GitHub 422 handling, typed tokens, wider cron
  window) and front-end review (reviews switch honoured, star contrast,
  live regions, Safari accordion target, token stripped from the address,
  search quantity bug) applied. Gates: unit 242, worker 351, build 47
  (1 skipped: no out-of-stock product), e2e 106 (2 skipped, same reason).
- 2026-11-08 evening, owner feedback round (spec section 8): premium
  standard written (`docs/design/premium-standard.md`) and the site audited
  against it (`docs/design/premium-audit-2026-11-08.md`): hybrid width
  (container 1280, wide grids 1440, full-bleed hero and bands), phone
  navigation (full-height menu panel, header hides on scroll down, sticky buy
  bar from arrival, back link breadcrumb), self-hosted Fraunces subsets
  (fonts 291 to 114 KB), press and hover states, 44 px targets, 56 ch FAQ
  measure; business card in three variants (`pnpm card`, `/carte/` page,
  print PDF, shareable image, vCard), address printed with the country and the
  international phone on English pages, "Recettes" out of the header, the
  passwordless customer space `/mon-compte/` (e-mail link, signed cookie,
  orders from Stripe, re-order, review from the space) with its privacy and
  FAQ texts. Gates: unit 252, worker 387, build 49 (1 skipped), e2e 124
  (2 skipped).
- 2026-11-08 night, launch preparation: the owner chose the Kraft business
  card (`pnpm card` now publishes it); the home hero moved to the wide
  container so its copy aligns with the header wordmark and the featured grid
  (it sat 80 px further in on wide screens, leaving a cream strip left of the
  text while the photo bled right), title scale up to 4.75 rem; new
  `docs/launch-runbook.md` (ordered phases A to L, who does what, stack and
  cost table, accounts table, secrets map) and `docs/client/couts-et-comptes.md`
  (French cost and accounts sheet for the owner); handover principle updated
  (accounts opened by the developer on the business address, GitHub transfer
  before deployment, vault handover). Gates: unit 252, worker 387, build 49
  (1 skipped), e2e 124 (2 skipped).
- 2026-11-08 night, design pass 5 (premium review): an independent review
  rated the site 6.5/10 (`out/review/11/rating-1.md`, local). Applied: scroll
  reveal removed (one hero entrance only); every tracked all-caps label is
  sentence case and kickers are italic, one per page; the hero names the
  products in one colour with the slogan as kicker, photo contained with equal
  insets, photo first on phones; one content edge for every section
  (`.container` equals `.container-wide`); "Nos univers" tiles and the hero
  corner medallion removed; story band shows the painted two-lands scene,
  engagement band is type only; recipe cards are type-led; origins list
  derived from the products (six countries, tested); copy slop replaced by
  facts; one grid card per product with format chips and a per-photo pouch
  crop; compact shop and category heads; 7/5 product gallery, phone gallery
  1:1 with dots, sticky buy bar only after the add button leaves the screen;
  related products without sibling formats; accordion targets scroll and
  focus; search panel fits its content; 404 one language per visit; FAQ
  760 px with sticky contact column; cart summary first on phones plus a
  phone bar; cross-sell without sibling formats; real delivery line; Point
  Relais preselected; account page shows only the form to anonymous
  visitors; muted ink darkened to 7:1. Photography (textures, recipes made,
  Marie, the ESAT, the 200 g baobab), the legal names and the domain e-mail
  remain owner inputs. Gates: unit 288, worker 387, build 49 (1 skipped),
  e2e 138 (2 skipped).
- 2026-11-08 night, design pass 5 round 2: a second independent review rated
  the new build 7.5/10 (`out/review/12/rating-2.md`, local). Applied: photo-led
  hero (5/7 grid, frame up to 660 px, 3:2 on phones so the button sits in the
  first screen), eight-word H1 with the product names in the lead, no kicker;
  checkout tunnel (`chrome="checkout"` on Base: header with brand and language
  only, footer without newsletter and shop links), pay button names the amount,
  card brands in the secure line; shop grid three columns up to 1599 px; the
  "no reviews yet" line removed; centred blocks left-aligned to the one edge
  (story painting, engagements, about page, card page, product footnote);
  card hover reduced to the photo ease and the title underline; cart count
  bump 1.15 in 240 ms without the red flash; SIRET in the footer; Fraunces
  italic rebuilt with WONK 0 (`scripts/subset-fonts.sh`). Gates: unit 288,
  worker 387, build 49 (1 skipped), e2e 138 (2 skipped).
- 2026-11-08 night, design pass 5 round 3 (towards 10/10): perceived speed
  (every internal link prefetched on hover or touch, first grid row and
  gallery thumbnails eager, 404 medallion eager; a full crawl found no
  console error, no broken link, no image without dimensions); the home
  recipe cards gave way to a "Un rituel, trois moments" type band linking
  each moment to a product's printed recipe (content in `home.yml`, three
  products with a recipe, tested); content slots ready for the owner
  (optional signed `ownerNote` in the story band, optional recipe `image`
  on the recipes page, CMS fields and `src/assets/recipes/`), the owner's
  list of remaining inputs extended (photos, signed note, three service
  promises, publication director). A read-only click-path and production
  audit (`out/review/13/audit-bugs.md`, 72/100 before fixes) led to: review
  invitations fail closed (marker before send), owner e-mail failures
  return 500 for Stripe retries with separate markers, missing webhook
  secret logged, launch-check covers the Turnstile key, the relay brand and
  the KV binding; expired sign-in link no longer beats a valid session,
  drawer closes when the menu opens and on Back, stale checkout error
  cleared, capped adds announced, thanks page keeps `session_id` on
  language switch and empties the paid cart on arrival, cart re-read on a
  restored page, a `bfcache` Playwright project. Gates: unit 293, worker
  395, build 49 (1 skipped), e2e 156 (2 skipped).
