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

- [ ] Scaffold: `package.json` (scripts `dev`, `build`, `preview`, `check`,
      `format`, `test`, `test:build`, `test:worker`, `e2e`, `launch-check`,
      `dev:worker`), `.nvmrc` 22, `.editorconfig`, `.prettierrc` (+ astro
      plugin), `.prettierignore`, `.gitignore` (node_modules, dist, .astro,
      .wrangler, out, .env*, .dev.vars, test-results, playwright-report,
      `src/cart/catalog.generated.json`), `tsconfig.json` strict,
      `astro.config.mjs` (site `https://racinesenpartage.fr`, static, i18n fr
      default + en, sitemap with filter for noindex routes and `/admin/`,
      `compressHTML: 'jsx'`, `assetsInlineLimit` guard, catalog integration).
- [ ] `src/consts.ts`: `SITE`, `LOCALES`, `DEFAULT_LOCALE`, `Locale` type.
- [ ] Content schemas (`src/content/schemas.ts`, zod, pure) for product,
      category, pages, settings; `src/content.config.ts` with glob loaders:
      products `src/content/products/{fr,en}/*.yml`, categories
      `src/content/categories/{fr,en}/*.yml`, pages
      `src/content/pages/{fr,en}/*.yml`, legal `src/content/legal/{fr,en}/*.md`,
      settings `src/content/settings/shop.yml`, locales
      `src/content/locales/*.json`.
- [ ] Seed content: 10 products FR and EN from spec appendix A (EN translated
      with care, culinary tone, no new health claims), 4 categories, home,
      about, faq, contact pages FR and EN, legal, terms and privacy Markdown
      FR and EN with placeholders, `shop.yml` from spec 4.4, `fr.json` and
      `en.json` UI strings for all namespaces (complete French, complete
      English).
- [ ] `src/i18n/fallback.ts` (deepFallback, interpolate), `src/i18n/locale.ts`
      (loadLocale, loadProducts(locale) merging FR shared fields and EN
      translations, loadCategories, loadPage, loadSettings), `src/i18n/routing.ts`
      (`ROUTES`, `routePath`, `routeUrl`, `alternatesFor`), `src/i18n/format.ts`
      (`formatPrice(cents, locale)`, `formatWeight`).
- [ ] `src/images.ts`: `resolveAsset(path)` over `import.meta.glob` of
      `/src/assets/**`; throws on a missing file at build.
- [ ] `integrations/catalog.ts`: Astro integration that, at `astro:config:setup`
      or `astro:build:start`, writes `src/cart/catalog.generated.json` (per
      locale display data) and, at `astro:build:done`, `dist/catalog.json`
      (spec 6.2) with absolute image URLs taken from the built product image
      (use a fixed 800 px WebP rendered by `getImage` in the integration or a
      dedicated endpoint `src/pages/catalog.json.ts`; the endpoint is the
      simpler choice: a static endpoint that imports the collections and
      `getImage`, so `dist/catalog.json` is just another page). Prefer the
      endpoint.
- [ ] `src/seo/graph.ts` (pure): `buildGraph({ kind: 'home'|'shop'|'category'|'product'|'faq'|'page', ... })`
      and `robotsContent`; `src/components/Seo.astro` wires it.
- [ ] `src/styles/tokens.css` and `global.css` per spec 5.1 to 5.3 (buttons,
      badges, hairline, kente divider, container, visually-hidden, focus).
      Fonts imported in `Base.astro`.
- [ ] `Base.astro` (head, Seo, Header, main, Footer, CartDrawer and
      CartScripts placeholders, announcement bar, shop-closed notice),
      `Header.astro` (medallion, wordmark, nav, language pill, cart button per
      contract, mobile `<details>` menu), `Footer.astro` (brand, contact,
      links, legal links, ESAT line, kente divider on top), `LanguagePill.astro`,
      `Icon.astro` (inline SVG set: cart, menu, close, leaf, truck, pin,
      lock, shield, check, chevron, minus, plus, flower), `Picture.astro`
      wrapper around `astro:assets` Picture with sizes presets.
- [ ] Pages: every route of spec section 3 as a thin file rendering `Base`
      with a stub `<h1>` and the right `routeKey`, `noindex` where specified;
      `404.astro`; `catalog.json.ts`; `robots.txt` in public.
- [ ] Scripts: `scripts/launch-check.mjs` (SIREN, pricesConfirmed, TODO in
      legal), `scripts/generate-og.mjs` placeholder left to 2A.
- [ ] Tests: unit for schemas, fallback, routing, format, graph, catalog
      endpoint shape (import the module and call GET with a mocked
      collection, or test the pure `buildCatalog(products, settings)` it
      calls); build tests over `dist/` (pages exist for every route in both
      locales, one JSON-LD each, robots meta, hreflang on indexable pages, no
      inline script, catalog.json valid and consistent with content).
- [ ] CI workflow, `README.md`, `CLAUDE.md` (what this is, commands, layout,
      conventions, gotchas), first commit `chore: scaffold astro storefront`
      then `feat: content model, seed catalogue, i18n, seo graph`.

### Wave 2: parallel implementers (start when wave 1 is green)

2A Storefront and design (spec 5):
- [ ] Home sections, shop grid with chips and sort, category pages, product
      page (gallery, accordions, related, footnote), about, faq, contact,
      legal pages with interpolation, 404, OG image per product (script with
      sharp: 1200 by 630, cream background, product photo, name, medallion)
      and a default OG image, favicons wired (`public/icons`,
      `apple-touch-icon.png`, `favicon.svg` simple hibiscus glyph,
      `site.webmanifest`), `public/_headers` global block, `robots.txt`.
- [ ] Visual QA at 390 and 1280 px with screenshots in `out/review/` (git
      ignored); iterate until it reads premium: spacing rhythm, type scale,
      image frames, hover states, motion within reduced-motion rules.
- [ ] Build tests extended: product pages carry `Product` with `Offer`, FAQ
      carries `FAQPage`, OG image exists per product.

2B Cart and checkout (spec 5.4 cart, checkout, thanks; 6.1; 6.4):
- [ ] `src/cart/store.ts` (pure, tested), `src/cart/totals.ts` (pure,
      tested), `src/cart/ui.ts` (DOM glue: delegation, drawer, count,
      aria-live, steppers), `CartDrawer.astro`, `CartScripts.astro`, cart
      page, checkout page with the three methods and the Mondial Relay
      widget (`RelayPicker.astro`, loader that injects jQuery, Leaflet and
      the plugin only when selected, `BDTEST` fallback brand, network hosts
      captured with headless Chromium and written to the checkout CSP block
      and to `docs/deployment.md` section "CSP"), terms checkbox, call to
      `POST /api/checkout`, inline errors incl. out-of-stock highlighting,
      thanks page with `GET /api/orders/:id`, cart cleared on `paid`.
- [ ] Playwright config and e2e per spec 8 (route mock for `/api/*`), run
      against `astro preview`; `pnpm e2e` in CI.

2C Worker (spec 6.2, 6.3):
- [ ] `worker/index.ts` (fetch handler: `/api/*` to Hono, else `ASSETS`),
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
- [ ] Tests with fakes for every path of the contract, idempotency keys,
      free shipping at threshold, closed shop, relay metadata, webhook
      signature failure, missing RESEND key path.
- [ ] Security pass: no secret in responses or logs, `no-store`, JSON only,
      body size limit, CORS same-origin only.

2D CMS and documentation (spec 4, 9, 10):
- [ ] `public/admin/index.html` (noindex) and `public/admin/config.yml`:
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
- [ ] `docs/guide-proprietaire.md` (FR, screenshots optional): se connecter,
      modifier un produit, prix, photo, rupture, nouveau produit, supprimer,
      catégories, textes des pages, frais de port et seuil, pause boutique,
      annonces, commandes dans Stripe, préparer un colis Mondial Relay,
      rembourser, codes promo, e-mails, que faire si.
- [ ] `docs/deployment.md` (EN, developer): GitHub, Cloudflare Workers Builds,
      secrets, domain at OVHcloud with DNS at Cloudflare, Resend DNS, Stripe
      account and webhook, Mondial Relay Offre Start and brand code, Sveltia
      Authenticator and GitHub OAuth app, go-live checklist, troubleshooting.
- [ ] `docs/handover.md` (EN): accounts matrix, transfer steps, assignment
      letter template, support options, costs, independence plan.
- [ ] `docs/client/presentation.md` (FR): ce que Marie reçoit, comment ça
      marche, coûts, ce qu'elle doit fournir (SIREN, prix, statut TVA,
      origines manquantes, Instagram, compte Stripe, compte Mondial Relay,
      validation CGV et médiateur, textes "Notre histoire"), prochaines étapes.
- [ ] `docs/legal-notes.md` (EN): food supplement rules summary (DGCCRF
      declaration, claims, labelling), points flagged on labels (grués table,
      barley gluten wording, missing origins), what the site does about them.
- [ ] `docs/content.md` (EN): content model and file layout for developers.

### Wave 3: integration, QA, release

- [ ] Merge check: `pnpm check`, `pnpm test`, `pnpm test:worker`, `pnpm build`,
      `pnpm test:build`, `pnpm e2e`.
- [ ] Full visual review of every route FR and EN at 390 and 1280 px; design
      iteration round with the storefront implementer.
- [ ] Accessibility scan (axe through Playwright) on home, shop, product,
      cart, checkout; fix every serious or critical issue.
- [ ] Security review of `worker/` and `_headers` (ecc security reviewer).
- [ ] Code review (ecc code reviewer) on the whole diff; fix blocking items.
- [ ] `pnpm launch-check` documented as failing until the owner inputs land.
- [ ] Final docs pass, `CLAUDE.md` gotchas, README.
- [ ] Commits per wave; push after the GitHub repository exists.
- [ ] Memory notes for the developer (project file) updated.

## Progress log

- 2026-11-01 18:10 spec and plan written; assets derived into
  `src/assets/` and `public/icons`; git initialised on `main`.
