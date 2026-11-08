# Iteration 3 implementation plan

Spec: `docs/superpowers/specs/2026-11-08-iteration-3-features-design.md`.
Reference study: `docs/superpowers/specs/2026-11-08-reference-sites-study.md`.
Rules: `CLAUDE.md` (conventions, contracts, gotchas). Every worker reads the
spec section it implements and this plan before touching a file.

## Foundation (done before the waves, by the lead)

- `src/content/schemas.ts`: `reviewSchema`, `Review`, `REVIEW_LIMITS`; product
  `keywords` (translated list, default empty); settings `brand.siret`
  (replaces `siren`), `forms.turnstileSiteKey`, `newsletter.{enabled,
  welcomeCode}`, `analytics.cloudflareToken`, `reviews.enabled`.
- `src/content.config.ts`: `reviews` collection (`src/content/reviews/*.yml`).
- `src/i18n/routing.ts`: routes `recipes`, `lookup`, `review`, `newsletter`
  (the last two noindex).
- `src/content/locale-schema.ts`: empty namespaces `reviews`, `recipes`,
  `search`, `forms`, `lookup`; both JSON files carry `{}` for each.
- `src/catalog/build.ts`: `ClientProduct` gains `category`, `categoryName`,
  `keywords`, `related` (SKUs), `featured`; `buildClientCatalog` takes a fifth
  argument `categoryNames`.
- `src/i18n/locale.ts`: `formatSiren`, tokens `{siren}` and `{siret}`.
- Stubs rendering nothing: `src/components/forms/ContactForm.astro`
  (`locale, t, settings`), `NewsletterSignup.astro` (`locale, t, settings,
  variant: 'footer' | 'band'`), `StockAlert.astro` (`locale, t, settings,
  sku, productName`). The storefront worker mounts them; the forms worker
  fills them. Keep the prop names.
- `src/content/settings/shop.yml`: Gmail address, SIRET, new sections.

## Wave A (parallel, one Opus implementer each)

File ownership is exclusive. A worker that needs a change in another
worker's file writes the need in its report instead of editing. Locale JSON
files and `locale-schema.ts` are shared: add keys only inside your own
namespaces, with small targeted edits, and re-read before editing.

### A1 Owner data and content

Owns: `src/content/products/**`, `src/content/categories/**`,
`src/content/pages/**`, `src/content/legal/**`, `src/assets/products/**`
(new `baobab-200.webp`), `public/og/**` (`pnpm og`), `scripts/launch-check.mjs`,
`docs/client/presentation.md`, `docs/legal-notes.md`, `docs/handover.md`,
`README.md`, `tests/unit/content.test.ts`.

- Prices, origins and descriptions from the owner's sheet (spec 1.1), under the
  health-claim policy; baobab 200 g product (FR and EN, SKU `REP-BAO-200`,
  12 EUR, `order` after baobab 100 g, photo copied from baobab 100 g until the
  owner sends one, `related` both ways); `keywords` on every product in both
  languages (bissap, foléré, zobo, karkadé; tchongon, chufa, amande de terre,
  noix tigrée, horchata; tsampa; ispaghul, cosses; pain de singe; cacao nibs).
- Legal texts: "SIREN {siren}, SIRET {siret}" in the legal notice (FR and EN),
  SIREN elsewhere unchanged; Gmail address wherever the Outlook one appears in
  content and in the owned docs.
- Home reassurance (spec 2.12), About "100 % végétal" sentence, FAQ: new
  entries "Comment retrouver ma commande ?" (link to `/ma-commande/`), "Puis-je
  laisser un avis ?" (invitation a week after the order), newsletter, and the
  professional entry with the new e-mail.
- `launch-check`: SIRET 14 digits with a valid Luhn checksum, the rest as
  before (prices, legal TODOs).
- Client letter: Hello Bank answer (spec 1.1), new price table, cacao prices
  still to confirm, the claims left out and why, the new features in her words
  (avis, newsletter, suivi de commande, formulaire de contact), what she must
  create (Turnstile widget, Resend audience, GitHub token is the developer's).
- Tests: content tests updated (prices are no longer the old placeholders,
  keywords present, baobab 200 g, SIRET).

### A2 Worker

Owns: `worker/**`, `tests/worker/**`, `wrangler.jsonc`, `docs/deployment.md`,
`.dev.vars.example` if present.

- Shared signing module `worker/tokens.ts`: `signToken(payload, secret)`,
  `verifyToken(token, secret, now)` (base64url JSON payload, HMAC-SHA256
  through WebCrypto, expiry `e` in Unix seconds), unit tested.
- `POST /api/contact`, `POST /api/newsletter`, `GET /api/newsletter/confirm`,
  `POST /api/reviews`, `POST /api/orders/lookup` exactly as spec sections 2.1,
  2.2, 2.3, 2.6, 5. Turnstile verification helper (`siteverify`, skipped when
  `TURNSTILE_SECRET_KEY` is empty). Resend contacts client
  (`POST https://api.resend.com/audiences/{id}/contacts`). GitHub Contents API
  client (`PUT /repos/{repo}/contents/{path}`, base64 body, message
  `content: avis client sur <slug>`, 422 or 409 when the file exists means
  "already reviewed"). Review YAML rendered with a small safe serializer
  (quote every string).
- Cron: `"triggers": { "crons": ["0 9 * * *"] }` in `wrangler.jsonc` and a
  `scheduled` handler in `worker/index.ts` that calls `inviteReviews(deps)`
  (spec 2.1). `StripeLike.checkout.sessions.list` added to the interface and
  the fake.
- E-mail templates: review invitation (FR and EN, one button to `/avis/?t=`),
  newsletter confirmation (with optional welcome code), contact and stock-alert
  owner e-mails, lookup link added to the customer order e-mail ("Retrouver ma
  commande"). French typography applies as for the existing templates.
- Rate limiter binding `FORMS_LIMITER` (namespace 1003, 10 per minute).
- Error codes: `CAPTCHA_FAILED` (400), `INVALID_TOKEN` (400),
  `ALREADY_REVIEWED` (409), `ORDER_NOT_FOUND` (404), `MAIL_FAILED` (502),
  `FEATURE_DISABLED` (404). Keep `tests/worker/error-contract.test.ts` green:
  every code is documented.
- `docs/deployment.md`: new secrets and variables table rows, Turnstile widget
  creation, Resend audience creation, fine-grained GitHub token creation
  (contents read and write on this repository only, one year expiry, calendar
  reminder), cron trigger note, Gmail address everywhere the Outlook one was.
- Tests for every endpoint, the cron, the token module, the serializer, with
  fakes (no network). `pnpm test:worker` green.

### A3a Storefront features

Owns: `src/components/**` except `CartDrawer.astro`, `CartScripts.astro`,
`Footer.astro`, `ContactBlock.astro`, `components/forms/**`;
`src/components/views/**` except `ContactView.astro`; `src/pages/recettes.astro`,
`src/pages/en/recipes.astro`; `src/i18n/format.ts`, `src/i18n/locale.ts`
(add `loadReviews`), `src/content/merge.ts`, `src/seo/graph.ts`,
`src/scripts/**`, `src/styles/global.css`, `tests/unit/**` except
`content.test.ts` and `cms-config.test.ts`; locale namespaces `nav`, `shop`,
`product`, `reviews`, `recipes`, `search`, `a11y`.

- `formatUnitPrice(cents, weightGrams, locale)` in `format.ts` (spec 2.4),
  shown on the product page, the cards and exported for the cart owner (pure,
  importable from client code).
- Formats row (spec 2.5): pure `formatsOf(product, all)` in `merge.ts`.
- Reviews (spec 2.1 display): `loadReviews()` and `reviewsFor(slug)` in
  `locale.ts` (published only, hidden products dropped, newest first);
  pure `reviewStats(reviews)` in `merge.ts`; components `ReviewSummary.astro`
  (stars, count), `Reviews.astro` (section), `ReviewsBand.astro` (home); the
  Product JSON-LD gains `aggregateRating` and up to five `review` nodes
  (`graph.ts`, `productGraphInput` gets `reviews`). Stars are inline SVG with
  an accessible text ("4,5 sur 5, 12 avis").
- Search (spec 2.7): header button, `<dialog>` component `SearchDialog.astro`
  mounted in `Header.astro`, `src/scripts/search.ts` (reads `#rep-catalog`,
  pure matching in `src/search/match.ts`, unit tested), results with the
  cart contract add button.
- Recipes page (spec 2.8): `RecipesView.astro`, routes, `Recipe` JSON-LD
  (graph `kind: 'recipes'` with `recipes` input), link in the header and the
  home recipes section; mounts `<NewsletterSignup variant="band" />`.
- Home: "Comment ça marche" band (`HowItWorks.astro`) and the reviews band.
- Product page: unit price, formats, review summary and section, sticky buy
  bar (`src/scripts/sticky-buy.ts`, phones only, IntersectionObserver,
  reduced motion respected), `<StockAlert>` when stock is `out`,
  "100 % végétal" assurance line.
- Cards: unit price and review summary.
- Keep every page green without JavaScript, axe clean, 44 px targets, hover
  only on hover devices, `{' '}` spacing rule, French typography through the
  loaders.

### A3b Forms and cart

Owns: `src/cart/**`, `src/components/CartDrawer.astro`, `CartScripts.astro`,
`Footer.astro`, `ContactBlock.astro`, `components/forms/**`,
`src/components/views/ContactView.astro`, `src/layouts/Base.astro`
(analytics beacon only), `src/pages/ma-commande.astro`, `src/pages/avis.astro`,
`src/pages/newsletter.astro` and their `en/` twins (`my-order`, `review`,
`newsletter`), `src/styles/cart.css`, `public/_headers`, `tests/build/**`,
`tests/e2e/**`, `src/forms/**` (new client modules); locale namespaces
`forms`, `lookup`, `cart`, `checkout`, `thanks`, `errors`, `footer`.

- Fill the three stubs (keep the props). Forms post JSON to the Worker with
  `fetch`, show inline success and error states from the locale strings, map
  every API error code (`src/cart/strings.ts` pattern), honeypot field
  `website` visually hidden with `tabindex="-1"` and `autocomplete="off"`.
- Turnstile: `src/forms/turnstile.ts` loads
  `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` on
  the first focus of a protected form when `settings.forms.turnstileSiteKey`
  is set, renders one widget per form, passes the token as `turnstile`.
- Footer: newsletter block (spec 2.2), "Suivre ma commande" and "Recettes"
  links. Analytics beacon in `Base.astro` when the token is set.
- Order lookup page (spec 2.6): form, then the order rendered with the thanks
  page renderer (`src/cart/page-thanks.ts` refactored so both pages share the
  rendering; the thanks page behaviour must not change).
- Review page (spec 2.1 step 2): decodes the token payload, one form per SKU
  (products named from `#rep-catalog`), star input as five radio buttons,
  posts to `/api/reviews`, invalid or expired token message.
- Newsletter landing page: `?status=ok|invalid` messages.
- Cart cross-sell (spec 2.9) in the drawer and the cart page; pure
  `pickCrossSell(lines, catalog, max)` unit tested in `tests/unit/`
  (file `cart-cross-sell.test.ts`, yours).
- Unit price in the cart lines (import `formatUnitPrice` from `format.ts`;
  until A3a lands, implement it there yourself only if missing, same name and
  signature, and say so in the report).
- `public/_headers`: global `script-src` adds
  `https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
  `frame-src https://challenges.cloudflare.com`, `connect-src` adds
  `https://cloudflareinsights.com`; checkout blocks unchanged except the same
  additions; `tests/build/headers.test.ts` updated; the CSP of the new pages is
  the global one.
- e2e: search dialog, contact form (API mocked), lookup page (API mocked),
  review page (token built in the test with a known secret is not possible
  without the Worker, so mock `/api/reviews` and test the form flow), axe on
  the new pages.

### A4 CMS and owner documentation

Owns: `public/admin/config.yml`, `tests/unit/cms-config.test.ts`,
`docs/guide-proprietaire.md`, `docs/content.md`.

- Settings: `siret` field (14 digits, pattern, hint), `forms.turnstileSiteKey`,
  `newsletter.enabled`, `newsletter.welcomeCode`, `analytics.cloudflareToken`,
  `reviews.enabled`, each with a French hint and an example. Product field
  `keywords` (translated list, hint with examples). Collection "Avis clients"
  (`src/content/reviews/*.yml`, `published` toggle, every field with a hint,
  summary "{{fields.author}}, {{fields.rating}}/5, {{fields.product}}",
  `product` as a relation to the French products, sortable by date, `create:
  true` so the owner may add a review she received elsewhere with
  `verified: false`).
- Make the three failing CMS config tests pass and add tests for the review
  collection against the Sveltia JSON schema as the existing tests do.
- Owner guide: recipes for moderating a review and answering it, reading the
  newsletter contacts and sending a campaign in Resend Broadcasts, creating a
  promotion code in Stripe, answering a contact or stock-alert e-mail, the
  order lookup page for customers, Hello Bank payouts in Stripe, reading
  Cloudflare Web Analytics; Gmail address everywhere.
- `docs/content.md`: reviews collection, keywords, new settings.

## Wave B (lead, after A)

- `pnpm check`, `pnpm test`, `pnpm test:worker`, `pnpm build`,
  `pnpm test:build`, `pnpm e2e`; fix integration seams.
- Visual walk of home, shop, product (in and out of stock), recipes, contact,
  lookup, review, newsletter pages FR and EN at 390 and 1280 px.
- Code review (Opus) of the Worker additions and the client forms (security:
  token handling, GitHub token scope, injection into YAML, rate limits, CSP).
- `CLAUDE.md` layout and gotchas, progress log, memory, commit and push.
