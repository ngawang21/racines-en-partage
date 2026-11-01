# Racines en Partage

Online shop of **Racines en Partage**, a small house in Arnouville (95) selling
West-African botanical powders, herbal teas, seeds and cacao in kraft pouches,
packed in France by ESAT Les Oliviers. "Deux terres. Un rituel. Un bien-être
à partager."

A static, bilingual storefront (French at `/`, English at `/en/`) with a cart
in the browser, Stripe Checkout for payment and Mondial Relay pickup points
for delivery. The owner edits products, prices, photos, texts and stock
herself through a git-backed CMS.

- Production: https://racinesenpartage.fr
- Design: `docs/superpowers/specs/2026-11-01-racines-en-partage-shop-design.md`
- Build plan and worker contracts:
  `docs/superpowers/plans/2026-11-01-racines-en-partage-implementation-plan.md`

## What the site contains

- Home, shop with four categories, ten product pages, our story, FAQ,
  contact.
- Cart, checkout and thank-you pages (noindex).
- Legal notice, terms of sale and privacy policy, written in Markdown with
  placeholders filled from the shop settings.
- `catalog.json`: prices, stock and shipping rates for the Worker API, built
  from the same content.
- A bilingual 404 page, a sitemap with language alternates, robots.txt.

## Stack

Astro 7 (static output), TypeScript, plain CSS with design tokens, content in
YAML and Markdown validated by zod, self-hosted fonts (Fraunces, Figtree),
vitest, GitHub Actions. Hosting: Cloudflare Workers static assets through
Workers Builds; a Worker serves `/api/*` (Stripe Checkout, order e-mails).
CMS: Sveltia at `/admin/`.

## Commands

| Command             | Effect                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm install`      | install dependencies (Node 22, pnpm 9)                            |
| `pnpm dev`          | development server on http://localhost:4321                       |
| `pnpm build`        | build the site into `dist/`                                       |
| `pnpm preview`      | serve `dist/` on http://127.0.0.1:4321                            |
| `pnpm check`        | `astro check` and prettier                                        |
| `pnpm format`       | reformat the code with prettier                                   |
| `pnpm test`         | unit tests (content, fallback, routes, prices, graph, catalog)    |
| `pnpm test:build`   | assertions over `dist/` (run `pnpm build` first)                  |
| `pnpm test:worker`  | Worker API tests (Stripe, webhook, e-mails, with fakes)           |
| `pnpm e2e`          | Playwright: cart, checkout, thank-you page, accessibility         |
| `pnpm dev:worker`   | build, then `wrangler dev` with the Worker (needs `.dev.vars`)    |
| `pnpm deploy`       | `wrangler deploy` (Workers Builds does this on push)              |
| `pnpm og`           | regenerate the Open Graph images after a product change           |
| `pnpm brand <png>`  | regenerate logo, medallion and icons from the owner's master logo |
| `pnpm launch-check` | fails while the SIREN, the prices or a legal TODO is pending      |

## Layout

```
src/consts.ts              site URL, locales, host
src/content/               products, categories, pages (fr/ and en/), legal Markdown,
                           settings/shop.yml, locales/*.json (UI strings)
src/content/schemas.ts     content model (zod, pure)
src/content/merge.ts       French fallback and shared fields
src/i18n/                  loaders, fallback, route table, price and weight formats
src/catalog/build.ts       shaping of catalog.json and of the cart catalogue
src/cart/catalog.ts        build-time access to both catalogues
src/seo/graph.ts           the schema.org graph and the robots value of a page
src/cart/                  cart store, totals, checkout client, Mondial Relay glue, page views
src/layouts/Base.astro     page skeleton, SEO, header, footer, cart drawer and scripts
src/components/            storefront sections and views, header, footer, icons, picture
src/pages/                 routes (fr at the root, en/), catalog.json, 404
src/styles/                tokens.css, global.css, cart.css
worker/                    Cloudflare Worker: Hono API, Stripe, webhook, order e-mails
wrangler.jsonc             Worker and static assets configuration
public/admin/              Sveltia CMS page and config.yml
public/_headers            security headers and the per-route CSP
scripts/                   launch-check, OG image generation, relay widget capture
tests/unit, tests/build    unit and build tests
tests/worker, tests/e2e    Worker tests, Playwright end-to-end and axe tests
docs/                      deployment, handover, owner guide (FR), client presentation (FR),
                           content model, legal notes, spec and plan
```

## Documentation

- `docs/deployment.md`: one-time setup (GitHub, Cloudflare, domain, Stripe,
  Mondial Relay, Resend, CMS login) and the go-live checklist.
- `docs/guide-proprietaire.md`: the owner's guide, in French.
- `docs/handover.md`: accounts, ownership transfer, support options, costs.
- `docs/client/presentation.md`: the project presented to the owner, in French.
- `docs/content.md`: the content model for developers.
- `docs/legal-notes.md`: rules for food supplements and what the site does.

## Licence

Private repository. The code, the Racines en Partage name, the logo, the
photographs and the texts are the property of their owners. All rights
reserved.
