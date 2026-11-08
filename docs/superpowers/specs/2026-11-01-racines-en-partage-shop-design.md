# Racines en Partage: online shop design

Date: 2026-11-01. Status: approved for implementation (decisions taken by the
developer on the owner's brief; items marked "owner to confirm" are collected
in `docs/handover.md` and `docs/client/presentation.md`).

## 1. Brief

Marie runs **Racines en Partage**, a micro-business in Arnouville (95) selling
West-African botanical powders, infusions, seeds and cacao in kraft doypacks,
packaged in France by the ESAT Les Oliviers (Gennevilliers, 92). Tagline on
every label: "Deux terres. Un rituel. Un bien-être à partager." Sub-brand line:
"Tisanes botaniques & poudres alimentaires".

Her request, verbatim: "Sur ce site, j'aimerais que les personnes voient mes
produits, puissent payer et mettre le choix de livraison avec Mondial relais."

Contact: racinesenpartage@gmail.com (Outlook until 2026-11-08), 07 75 68 91 08, 9 Rue du Marché,
95400 Arnouville.

The developer's goals on top of the brief: a premium, inviting storefront that
she can run alone (products, prices, photos, texts, stock), zero fixed cost
beyond the domain name, French and English, strong SEO, and a clean handover
of ownership with a support path.

## 2. Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Name | Site "Racines en Partage", repository `racines-en-partage`, domain `racinesenpartage.fr` (available on 2026-11-01, as are `racines-en-partage.fr` and `.com`) | Matches the brand and her e-mail handle |
| Site framework | Astro 7, static output, TypeScript, plain CSS with tokens | Proven on Lamsel, fastest pages, no server to maintain |
| Hosting | Cloudflare Workers static assets, deployed by Workers Builds on push to `main`; one Worker serves `dist/` and runs the API on `/api/*` (`run_worker_first: ["/api/*"]`) | Free tier covers the traffic of a small shop; same model as Lamsel so the owner guide is familiar |
| Payment | Stripe Checkout (hosted page) in payment mode, cards plus wallets and local methods managed in the Stripe dashboard | No subscription, 1.5 % + 0.25 EUR per EU card (owner to confirm on stripe.com/fr/pricing), strong authentication, receipts, refunds and promo codes without code |
| Orders back office | Stripe dashboard and the Stripe mobile app are the order list; every paid order also arrives by e-mail with the relay point | No database, nothing to host or back up |
| Delivery | Three methods: Mondial Relay pickup point (official Parcel Shop Picker widget v4), home delivery (Colissimo), free pickup in Arnouville. Flat rates and a free-shipping threshold are editable in the CMS | Mondial Relay was the explicit request; the "Offre Start" pro account has no commitment or subscription and gives the brand code the widget needs |
| Content editing | Sveltia CMS (git-backed, served at `/admin/`, French UI, image conversion to WebP on upload), GitHub backend, Sveltia Authenticator worker for login | Open source, no monthly fee, i18n built in, no server rendering in the site |
| E-mail | Resend REST API from the Worker (free tier 3,000 per month), sender `commandes@racinesenpartage.fr`, reply-to Marie's Outlook; Stripe's own receipt stays enabled as a fallback | Reliable transactional mail with zero cost at her volume |
| Languages | French at `/`, English at `/en/`; same product slugs in both | FR is the market, EN for expatriates and the diaspora |
| Currency and tax | EUR, prices displayed TTC; `vat.mode` setting: `franchise` (default, "TVA non applicable, art. 293 B du CGI") or `included` (5.5 % shown on documents) | Her status is not known; the flag changes the legal mentions only |
| Analytics | None by default; Cloudflare Web Analytics (cookieless) can be switched on in the dashboard | No cookie banner needed |
| Licence | Private repository, all rights reserved during the build; full assignment to Marie at handover (see `docs/handover.md`) | The site is sold to her |

Rejected alternatives: Shopify (29 EUR per month), WooCommerce (PHP hosting and
security maintenance), Medusa or Saleor (a database and a server for ten
products), Snipcart (monthly minimum), Keystatic (needs React and server
rendering inside the site, English-only UI), Decap (unmaintained UI, no image
optimisation), Sendcloud or Boxtal widgets (tie the checkout to an aggregator;
can still be used by Marie to buy labels).

## 3. Information architecture

Routes (FR, then EN). Trailing slash always.

| Key | FR | EN | Index |
| --- | --- | --- | --- |
| home | `/` | `/en/` | yes |
| shop | `/boutique/` | `/en/shop/` | yes |
| category | `/boutique/<cat>/` | `/en/shop/<cat>/` | yes |
| product | `/produits/<slug>/` | `/en/products/<slug>/` | yes |
| about | `/notre-histoire/` | `/en/our-story/` | yes |
| faq | `/faq/` | `/en/faq/` | yes |
| contact | `/contact/` | `/en/contact/` | yes |
| cart | `/panier/` | `/en/cart/` | noindex |
| checkout | `/commande/` | `/en/checkout/` | noindex |
| thanks | `/merci/` | `/en/thank-you/` | noindex |
| legal | `/mentions-legales/` | `/en/legal-notice/` | yes |
| terms | `/cgv/` | `/en/terms-of-sale/` | yes |
| privacy | `/confidentialite/` | `/en/privacy/` | yes |
| 404 | `/404.html` | same page, bilingual | noindex |
| admin | `/admin/` | static Sveltia page | noindex, out of sitemap |

Categories at launch (slug, FR name, EN name): `poudres` "Poudres &
superaliments" / "Plant powders"; `infusions` "Tisanes & infusions" /
"Herbal teas & infusions"; `graines` "Graines & tubercules" / "Seeds &
tubers"; `cacao` "Cacao" / "Cacao".

## 4. Content model

All editable content lives in `src/content/` as YAML (products, categories,
pages, settings) or Markdown (legal texts). Sveltia reads and writes the same
files. i18n structure is `multiple_folders`: `src/content/products/fr/<slug>.yml`
and `src/content/products/en/<slug>.yml`. Shared fields are `i18n: duplicate`
in the CMS (read-only in EN, copied from FR); the build reads shared fields from
the FR file only, so the two can never disagree in the output.

### 4.1 Product (`products` collection)

```ts
interface Product {
  // shared (from the FR file)
  sku: string;                // unique, e.g. "REP-MOR-100"
  slug: string;               // file name, same in both locales
  category: CategorySlug;
  price: number;              // EUR, TTC, 2 decimals
  weightGrams: number;
  origin: string;             // free text as printed on the label, e.g. "Niger"
  originCountryCode?: string; // ISO 3166-1 alpha-2 for the flag/schema, e.g. "NE"
  images: string[];           // "/src/assets/products/<file>.webp", first is the main image
  stock: 'in_stock' | 'low' | 'out';
  featured: boolean;
  nutritionVerified: boolean; // false hides the table on the site
  nutrition?: {               // per 100 g, strings as printed ("1290 kJ / 308 kcal", "< 2,5 g")
    energy: string; fat: string; saturates: string; carbs: string; sugars: string;
    fibre: string; protein: string; salt: string;
  };
  free_from: string[];        // e.g. ["additifs", "conservateurs", "colorants", "gluten"]
  related: string[];          // product slugs
  // translated
  name: string;               // "Poudre de moringa"
  tagline: string;            // one line under the name
  description: string;        // 2 to 4 sentences, markdown allowed
  ingredients: string;        // as printed
  usage: string[];            // bullet list "Conseils d'utilisation"
  howMade?: string;           // "Comment est obtenue la poudre ?"
  recipe?: { title: string; ingredients?: string[]; steps: string[] };
  benefits: string[];         // "Les bienfaits" or "Les +" bullets from the label
  storage: string;
  seoTitle?: string; seoDescription?: string;
}
```

Validation (zod, `src/content/schemas.ts`): `price > 0`, `weightGrams > 0`,
`images.length >= 1` and every path exists under `src/assets/products/`,
`category` exists, `related` slugs exist, `sku` unique. The EN entry may omit
any translated field: the build falls back to the FR value (same `deepFallback`
approach as Lamsel, pure module, unit tested).

### 4.2 Category (`categories` collection)

`slug`, `order`, `image` (shared); `name`, `intro`, `seoTitle`,
`seoDescription` (translated).

### 4.3 Pages (file collection, i18n)

- `home`: hero (`eyebrow`, `title`, `lead`, `cta`; `titleAccent` removed 2026-11-08, design pass 5), `reassurance`
  (4 items with icon key and text), `storyTitle`, `storyBody`, `recipesTitle`,
  `commitmentTitle`, `commitmentBody`.
- `about`: `title`, `lead`, `sections[]` (`title`, `body`, optional `image`).
- `faq`: `items[]` (`question`, `answer`), rendered with `FAQPage` schema.
- `contact`: `title`, `lead`, `hours`.
- `legal`, `terms`, `privacy`: Markdown with placeholders `{company}`, `{siren}`,
  `{address}`, `{email}`, `{phone}`, `{host}` interpolated at build.

### 4.4 Settings (`src/content/settings/shop.yml`, singleton, not translated except labels)

```yaml
brand:
  name: Racines en Partage
  tagline: { fr: "Deux terres. Un rituel. Un bien-être à partager.", en: "Two lands. One ritual. Well-being to share." }
  email: racinesenpartage@outlook.com
  phone: "0775689108"
  address: { street: 9 Rue du Marché, postcode: "95400", city: Arnouville, country: FR }
  instagram: ""            # URL or empty
  siren: ""                # owner placeholder, launch-check fails while empty
  packagedBy: "ESAT Les Oliviers (Gennevilliers, 92)"
shop:
  open: true               # false shows a "boutique en pause" notice and disables checkout
  currency: eur
  vat: { mode: franchise, rate: 5.5 }
  freeShippingFrom: 49     # EUR, null disables
  maxQuantityPerLine: 10
  announcement: { fr: "", en: "" }
shipping:
  - id: relay
    enabled: true
    price: 4.90
    countries: [FR, BE, LU]
    label: { fr: "Point Relais Mondial Relay", en: "Mondial Relay pickup point" }
    estimate: { fr: "3 à 5 jours ouvrés", en: "3 to 5 working days" }
  - id: home
    enabled: true
    price: 6.90
    countries: [FR]
    label: { fr: "Livraison à domicile (Colissimo)", en: "Home delivery (Colissimo)" }
    estimate: { fr: "2 à 4 jours ouvrés", en: "2 to 4 working days" }
  - id: pickup
    enabled: true
    price: 0
    countries: [FR]
    label: { fr: "Retrait gratuit à Arnouville", en: "Free pickup in Arnouville" }
    estimate: { fr: "sur rendez-vous, 9 Rue du Marché", en: "by appointment, 9 Rue du Marché" }
launch:
  pricesConfirmed: false   # launch-check fails while false
```

UI strings that the owner never edits (navigation, buttons, cart wording,
error messages) live in `src/content/locales/fr.json` and `en.json` with a zod
schema and French fallback, exactly as in Lamsel.

### 4.5 Images

Owner uploads go to `src/assets/products/` (CMS `media_folder:
/src/assets/products`, `public_folder: /src/assets/products`, WebP conversion,
max 2048 px, 2 MB cap). The build resolves these paths with
`import.meta.glob('/src/assets/products/*')` and renders them through Astro's
`<Picture>` (AVIF and WebP, responsive widths). A unit test fails on a missing
file. Brand assets (logo medallion, wordmark, hero) live in `src/assets/brand/`
and `public/`.

## 5. Storefront design

Direction: "comptoir botanique". Warm, generous, calm. Kraft and cream from the
packaging, deep green from the logo lettering, hibiscus red as the single warm
accent, gold hairlines from the label ornaments. The photos (sand backdrop,
palm leaves) set the mood; the UI stays quiet around them.

### 5.1 Tokens (`src/styles/tokens.css`)

```css
:root {
  --cream: #fbf6ea;        /* page background */
  --paper: #f3ead6;        /* cards, alternating bands */
  --kraft: #d8b98e;        /* frames, soft fills */
  --kraft-deep: #b98e5e;   /* hover on kraft, captions */
  --forest: #163a1c;       /* ink, primary buttons, footer */
  --forest-2: #244f2a;     /* primary hover */
  --leaf: #3e7a2a;         /* success, stock in, small accents */
  --hibiscus: #e03a3a;     /* badges, price accent, focus ring */
  --hibiscus-deep: #b8262e;
  --gold: #c9a24a;         /* hairlines, ornaments */
  --terracotta: #c8582c;   /* kente divider */
  --ink-2: #4a5c45;        /* secondary text */
  --line: rgba(22, 58, 28, 0.14);
  --font-display: 'Fraunces Variable', Georgia, serif;
  --font-body: 'Figtree Variable', system-ui, sans-serif;
  /* fluid type: --fs-0 1rem up to --fs-6 clamp(2.5rem, 5vw, 4rem) */
  /* spacing 4 8 12 16 24 32 48 64 96, radius 10 14 20, shadows soft and float */
}
```

Contrast: every text/background pair at least 4.5:1 (forest on cream 11:1,
cream on forest, forest on paper, ink-2 on cream 6.5:1; hibiscus only on cream
or paper and never under 18 px). Focus ring 3 px hibiscus with 2 px cream
offset. `prefers-reduced-motion` disables every transition longer than 150 ms.

### 5.2 Typography

Fraunces Variable (optical size axis on, weight 500 to 700, `SOFT` 50) for
headings, prices and the wordmark. Figtree Variable 400/500/600 for body and
UI. Fluid scale with `clamp`. Prices use tabular numerals and the French
format "8,90 €" (narrow no-break space before €) via `Intl.NumberFormat`.

### 5.3 Motifs

- Kente divider: a 6 px strip of repeating chevrons in terracotta, gold and
  leaf (CSS gradients, no image), used under the hero and above the footer.
- Gold hairline with a centred hibiscus glyph (inline SVG) between home
  sections.
- Medallion: the circular emblem cropped from the logo (transparent PNG and a
  WebP), 40 px in the header next to the Fraunces wordmark; the full logo on
  the about page and in the footer.
- Product frames: 4:5 image area with a 1 px kraft border and `--paper` fill,
  so the sand backdrop of the photos blends in.

### 5.4 Pages

Home: hero (left: eyebrow "Tisanes botaniques & poudres alimentaires", title
"Deux terres. Un rituel." with "Un bien-être à partager." in Fraunces italic
accent, lead, two CTAs "Découvrir la boutique" and "Notre histoire"; right:
the landscape trio photo in a soft frame), kente divider, reassurance strip
(Conditionné en France par l'ESAT Les Oliviers; Sans additifs ni
conservateurs; Livraison en Point Relais; Paiement sécurisé), "Nos
incontournables" (4 featured products), "Deux terres" story band on `--forest`
(Niger, Sénégal, Côte d'Ivoire, Inde on one side, Arnouville on the other,
with the duo photo), categories (4 tiles), "Petites recettes" (3 recipe cards
from product labels linking to products), commitment band (ESAT, origins,
plain ingredients), footer.

Shop: title, category chips (all plus 4), sort select (featured, price asc,
price desc, name), responsive grid 2/3/4 columns of `ProductCard` (image,
name, weight and origin line, price, stock badge, "Ajouter" button that adds
one unit and opens the drawer). Filtering and sorting are client side on the
rendered DOM (no fetch) and reflected in the URL hash.

Category: same grid, intro text, category image.

Product: breadcrumb, gallery (main picture plus thumbnails, keyboard
operable), name, tagline, weight and origin pill with the flag emoji,
price, stock status ("En stock", "Plus que quelques sachets", "Bientôt de
retour"), quantity stepper (1 to `maxQuantityPerLine`), "Ajouter au panier",
delivery line ("Livraison en Point Relais 4,90 €, offerte dès 49 €"),
description, accordions (Ingrédients, Conseils d'utilisation, Petite recette,
Valeurs nutritionnelles when verified, Conservation, Comment est obtenue la
poudre when present), "Ne contient pas" badges, "Dans le même esprit"
(related products), and the legal footnote for food supplements ("À consommer
dans le cadre d'une alimentation variée et équilibrée et d'un mode de vie
sain. Tenir hors de portée des jeunes enfants."). No health claim beyond the
label wording.

Cart page: line items with pictures, steppers, remove, subtotal, free-shipping
progress ("Plus que 12,10 € pour la livraison offerte"), continue shopping,
"Commander".

Checkout (ours, before Stripe), single page, three blocks: 1) Récapitulatif
(read-only lines, subtotal); 2) Livraison: three radio cards from the enabled
shipping methods with price and estimate; choosing "Point Relais" reveals a
postcode field (prefilled from the last search) and the Mondial Relay widget;
the chosen point is shown as a card (name, address, opening hours toggle) and
stored in the cart state; choosing "Domicile" shows the allowed countries;
"Retrait" shows the address and "sur rendez-vous"; 3) Total and a required
checkbox "J'ai lu et j'accepte les CGV" then the button "Payer en toute
sécurité" with the Stripe lock line "Paiement sécurisé par Stripe. Vous
saisirez votre adresse et vos coordonnées à l'étape suivante." Errors from the
API are shown inline (out of stock lines are highlighted with a "Retirer"
action).

Thanks: reads `session_id` from the URL, calls `GET /api/orders/:id`, shows
the order number, lines, totals, the delivery method and relay point, what
happens next (preparation, Mondial Relay SMS, contact), and clears the cart
when the status is `paid`. Without a session or on error: a neutral thank-you
with the contact details.

About: Marie's story (owner to validate), the two lands, the ESAT
partnership, the plain-ingredient promise, photos.

FAQ: delivery times, Mondial Relay, pickup, returns (sealed food products
cannot be returned once opened, art. L221-28 code de la consommation; damaged
parcels are replaced), payment methods, storage, origins, wholesale contact.

Contact: address, phone (tel link), e-mail (mailto), Instagram when set, a
link to Google Maps (no embed), opening hours text.

Legal, terms, privacy: Markdown from the CMS with interpolation; CGV cover
prices TTC, order process, payment by Stripe, delivery methods and delays,
risk transfer, withdrawal and its food exceptions, conformity guarantee,
mediation (owner to pick a mediator, placeholder flagged), applicable law.
Privacy lists processors: Stripe, Cloudflare, Resend, Mondial Relay, GitHub
(admin only), and states that the cart lives in the browser's localStorage.

404: bilingual, links home and shop.

### 5.5 Header, footer, cart drawer

Header: medallion plus wordmark, nav (Boutique, Notre histoire, FAQ, Contact),
language pill (FR/EN pointing at the same page), cart button with a count
badge. On mobile: a compact bar with a menu button and the cart; the menu is a
full-width dropdown (no JS framework, `<details>` based).

Cart drawer: slides from the right (`<dialog>`), focus trapped, Escape closes,
items with steppers, subtotal, free-shipping progress, "Voir le panier" and
"Commander". Adding a product opens it and announces the change in an
`aria-live` region.

Announcement bar when `shop.announcement` is set; "boutique en pause" notice
when `shop.open` is false (products visible, add-to-cart disabled).

## 6. Client state and interfaces

### 6.1 Cart store (`src/cart/store.ts`, pure, no DOM)

```ts
type CartLine = { sku: string; quantity: number };
type Delivery =
  | { method: 'relay'; relay: RelayPoint }
  | { method: 'home' }
  | { method: 'pickup' };
type RelayPoint = { id: string; name: string; address1: string; address2?: string;
                    postcode: string; city: string; country: string; hoursHtml?: string };
interface CartState { version: 1; lines: CartLine[]; delivery?: Delivery; updatedAt: string }
// API: getCart, addLine(sku, qty), setQuantity(sku, qty), removeLine(sku), setDelivery(d),
// clear(); subscribe(listener). Persistence: localStorage key "rep.cart.v1".
// Totals need the catalog: computeTotals(cart, catalog) -> { subtotal, shipping, total, freeShippingGap }
```

The storefront pages embed the public catalog (sku, slug, name, price, weight,
stock, image URL, per locale) as a JSON module generated at build
(`src/cart/catalog.generated.ts` is not committed; it is produced by a Vite
plugin or `astro:build:start` hook from the content collections). Prices are
re-validated server side at checkout; the client values are for display only.

### 6.2 Catalog for the Worker (`dist/catalog.json`)

Written by an Astro integration at build end. Shape:

```json
{
  "generatedAt": "2026-11-01T18:00:00Z",
  "currency": "eur",
  "vatMode": "franchise",
  "shopOpen": true,
  "maxQuantityPerLine": 10,
  "freeShippingFrom": 4900,
  "shipping": [
    { "id": "relay", "enabled": true, "amount": 490, "countries": ["FR", "BE", "LU"],
      "label": { "fr": "Point Relais Mondial Relay", "en": "Mondial Relay pickup point" },
      "estimate": { "fr": "3 à 5 jours ouvrés", "en": "3 to 5 working days" } }
  ],
  "products": [
    { "sku": "REP-MOR-100", "slug": "poudre-de-moringa-100g", "unitAmount": 890, "weightGrams": 100,
      "stock": "in_stock", "name": { "fr": "Poudre de moringa 100 g", "en": "Moringa powder 100 g" },
      "image": "https://racinesenpartage.fr/_astro/moringa-100.abc123_800.webp" }
  ]
}
```

Amounts are integers in cents everywhere outside the CMS. The Worker fetches
`/catalog.json` through its `ASSETS` binding on each request (cached in memory
for 60 s), so a CMS change goes live with the next deploy and no secret or
database holds prices.

### 6.3 Worker API (`worker/`)

Hono app, created by `createApp(deps)` where `deps = { stripe, mailer, loadCatalog, env, now, limiters? }`
so tests inject fakes. Every error body is `{ "error": { "code", "message", "details?" } }`.

| Method and path | Request | Response | Errors |
| --- | --- | --- | --- |
| `POST /api/checkout` | `{ locale: 'fr'\|'en', items: [{ sku, quantity: 1..max, unitAmount? }], delivery: Delivery, acceptedTerms: true }` | `200 { url }` (Stripe Checkout URL) | `400 VALIDATION_ERROR`, `403 FORBIDDEN_ORIGIN`, `409 UNKNOWN_SKU`, `409 OUT_OF_STOCK` (`details.skus`), `409 PRICE_CHANGED` (`details.skus`), `409 SHIPPING_UNAVAILABLE`, `413 PAYLOAD_TOO_LARGE` (over 32 KB), `415 UNSUPPORTED_MEDIA_TYPE`, `429 RATE_LIMITED` (`Retry-After: 60`), `502 PAYMENT_PROVIDER_ERROR`, `503 SHOP_CLOSED`, `503 CATALOG_UNAVAILABLE` |
| `GET /api/orders/:sessionId` | | `200 { status: 'paid'\|'pending'\|'unpaid', number, lines: [{ name, quantity, unitAmount }], amounts: { subtotal, shipping, discount, total, currency }, delivery: Delivery, email (masked, "m***@***.com") }` | `400 VALIDATION_ERROR`, `404 NOT_FOUND` (also for a session without this shop's metadata or created more than 48 hours ago), `429 RATE_LIMITED`, `502 PAYMENT_PROVIDER_ERROR` |
| `POST /api/webhooks/stripe` | Stripe event, `Stripe-Signature` header | `200 { received: true }` | `400 INVALID_SIGNATURE`, `413 PAYLOAD_TOO_LARGE` (over 512 KB), `500 EMAIL_FAILED` (Stripe retries), `502 PAYMENT_PROVIDER_ERROR` |
| `GET /api/health` | | `200 { ok: true, version, catalogGeneratedAt }` | `503 CATALOG_UNAVAILABLE` |

Any route: `404 NOT_FOUND` for an unknown `/api` path, `405 METHOD_NOT_ALLOWED`
(with `Allow`) for a wrong method, `500 INTERNAL_ERROR` for an unexpected
error (logged, never detailed). Amounts are integer cents; `discount` is the
promotion code discount (0 without one). The storefront maps every code to a
translated message (`ERROR_KEY` in `src/cart/api.ts`; a Worker test checks
that no code is missing); codes a customer cannot act on share the generic
one.

`unitAmount` is the price in cents the page showed for the line. When it is
sent and differs from `/catalog.json` (a tab opened before a price change, or
a deploy window), the order is refused with `409 PRICE_CHANGED` instead of
charging a price the customer did not see; unknown and out-of-stock lines are
reported first.

Rate limiting: Workers rate limiting bindings `CHECKOUT_LIMITER` (10 requests
per 60 s) and `ORDERS_LIMITER` (30 per 60 s), keyed on `CF-Connecting-IP`;
skipped when the binding is absent.

Relay validation: `name`, `address1`, `address2`, `city` accept letters
(accents included), digits, space and `' - . , / & ( )` only, at most 80, 120,
120 and 60 characters; `postcode` is 3 to 10 letters or digits; the `id`
prefix equals `country`. The cart folds any other character of the widget's
payload to a space (and cuts to these lengths) before it stores the point, so
a real Mondial Relay point is never refused.

Checkout session construction: `mode: 'payment'`, `locale`, `line_items` from
the catalog (`metadata.sku` on the line item, `price_data` with `unit_amount`,
`product_data.name`, `images`, `metadata.sku`), `shipping_options: [one shipping_rate_data]` for the chosen
method (amount 0 when the subtotal reaches `freeShippingFrom`, display name
localised and cut at Stripe's 100 characters, delivery estimate), `shipping_address_collection` only for `home`
(allowed countries from settings), `billing_address_collection: 'required'`
and `phone_number_collection.enabled: true` always (Mondial Relay notifies by
SMS), `customer_creation: 'if_required'`, `allow_promotion_codes: true`,
`custom_text.submit.message` stating the method and, for a relay point, its
name and city only (no address, no free text), or the pickup address,
`metadata`: `locale`, `delivery_method`, `relay_id`, `relay_name`,
`relay_address`, `relay_postcode`, `relay_city`, `relay_country`, `skus`
(comma list), `success_url` to the locale's thanks page with
`?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` to the locale's cart page
(both on `SITE_URL`, or on the `*.workers.dev` host when the checkout started
there, so a preview test returns to the preview), `expires_at` 2 hours. Stock
`out` lines are refused; `low` passes. Free shipping is decided on the
subtotal before any promotion code (Stripe applies the code on the Checkout
page, after the shipping option is fixed).

Webhook: `constructEventAsync` with the SubtleCrypto provider; on
`checkout.session.completed` and `checkout.session.async_payment_succeeded`
with `payment_status === 'paid'`: retrieve the session expanded with
`shipping_cost.shipping_rate`; skip it with 200 when `metadata.delivery_method`
is missing (not this shop's) or `metadata.emails_sent` is `'true'` (already
notified); list its lines with `listLineItems` (limit 100, the `line_items`
expand stops at 10), then send the owner e-mail (always French: order number,
date, lines, totals, customer name, e-mail, phone, billing or shipping
address, delivery method, relay point ID printed large with a line asking to
confirm the point in her Mondial Relay space before printing the label, relay
point block, link to the Stripe payment) and the customer e-mail in
`metadata.locale` (thanks, lines, totals, delivery method, relay point, what
happens next, contact). Resend `Idempotency-Key: <event.id>:owner` and
`<event.id>:customer` (by role: the owner testing with her own address must
not get one key for two different e-mails).
Once both are out, `metadata.emails_sent = 'true'` is set on the session
(Stripe merges metadata). A Resend 4xx other than 409 and 429 is permanent
(logged, counted as sent for that recipient); 429, 409, 5xx and network
errors answer `500 EMAIL_FAILED` so Stripe retries. When `RESEND_API_KEY` is
unset the Worker logs the order summary and returns 200 (Stripe's receipt and
dashboard still cover the owner). `checkout.session.async_payment_failed`
for a session of this shop is logged (`order.payment_failed`) and answered
200: no e-mail went out while the payment was pending.

Bindings and variables: `ASSETS`, `CHECKOUT_LIMITER`, `ORDERS_LIMITER`; vars `SITE_URL`, `ORDER_EMAIL_FROM`; secrets
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` (optional),
`ORDER_EMAIL_TO`. The public widget brand code is a site variable
`PUBLIC_MONDIAL_RELAY_BRAND` (`BDTEST` in development, the "Offre Start"
client code in production) read at build time.

### 6.4 Mondial Relay widget

Loaded on demand (only when the relay method is selected) from
`https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js`
with jQuery 2.2.4 and Leaflet 1.9.4 (vendored under `public/vendor/`, same
origin; only the plugin is remote); `Brand` from the
variable, `Country` from the postcode form, `AllowedCountries` from the relay
method's countries, `ColLivMod: '24R'`, `NbResults: 7`, `Responsive: true`,
`ShowResultsOnMap: true`, `OnParcelShopSelected` maps the payload (`ID`,
`Nom`, `Adresse1`, `Adresse2`, `CP`, `Ville`, `Pays`, `HoursHtmlTable`) to a
`RelayPoint` with `id` normalised to `<CC>-<6 digits>`. The CSP for the
checkout route allows these hosts (script, style, connect, img incl.
OpenStreetMap tiles), determined by capturing the widget's network requests in
headless Chromium during implementation; every other route keeps the strict
Lamsel CSP. A fallback text under the widget tells the customer to contact
the shop if the map does not load.

## 7. SEO, performance, accessibility

- One `application/ld+json` `@graph` per page: `OnlineStore` (name, address,
  telephone, email, logo), `WebSite`, `WebPage`, `BreadcrumbList` on shop,
  category and product pages, `Product` with `Offer` (price, currency,
  availability from stock, `itemCondition`, `shippingDetails` from the relay
  method) on product pages, `CollectionPage` on shop and category pages,
  `FAQPage` on the FAQ. Pure builder in `src/seo/graph.ts`, unit tested.
- Per-page title and description from content, canonical, hreflang `fr`, `en`
  and `x-default` (FR), Open Graph and Twitter cards (product main image),
  sitemap with hreflang alternates, robots.txt, `robots` meta on every page.
- Images: AVIF/WebP, explicit dimensions, lazy below the fold, hero eager with
  `fetchpriority="high"`. Fonts self-hosted with `font-display: swap` and
  preloaded. JavaScript budget on storefront pages under 30 KB gzipped (cart
  island), widget deps only on checkout. Target Lighthouse 95+ on the four
  categories for home, shop and product on mobile.
- Accessibility: landmarks, skip link, visible focus, drawer and gallery
  keyboard operable, labels on every control, colour never the only signal
  for stock, `aria-live` for cart updates, reduced motion respected.
- Security headers in `public/_headers`: nosniff, frame-ancestors self,
  referrer policy, permissions policy, strict CSP (`script-src 'self'`,
  connect-src self) with a per-route relaxation for `/commande/*` and
  `/en/checkout/*` (Mondial Relay hosts) and for `/admin/*` (unpkg, GitHub
  APIs). Worker responses carry `Cache-Control: no-store`.

## 8. Testing

- Unit (vitest): content schemas and fallback, catalog generation, totals and
  free-shipping maths, price formatting, routing and alternates, schema.org
  graph, Worker handlers with fake Stripe, fake mailer and fixture catalog
  (every error code, relay metadata, free shipping at threshold, closed shop,
  webhook signature failure, e-mail idempotency), e-mail templates snapshot.
- Build tests over `dist/`: every page has exactly one JSON-LD script with a
  valid graph, a robots meta, hreflang set when indexable, no inline script,
  CSP present; `catalog.json` matches the content; every product image
  referenced exists; no owner placeholder leaks into indexable pages (SIREN is
  interpolated into legal pages, which is why `launch-check` guards it).
- End to end (Playwright, Chromium): add two products from the shop, change a
  quantity in the drawer, open the cart page, go to checkout, pick "Retrait",
  accept the terms, click pay with `/api/checkout` mocked, assert the request
  body matches the contract and the redirect happens; FR and EN; a mobile
  viewport run.
- Visual review: screenshots of every route at 390 px and 1280 px, reviewed
  by the developer before each commit of a wave.
- `pnpm launch-check` fails while `brand.siren` is empty or
  `launch.pricesConfirmed` is false or a `TODO` remains in legal texts.

## 9. Repository, CI, deployment

`ngawang21/racines-en-partage`, private, `main` only, one-line conventional
commits, no attribution, no em dash in Markdown, English code and docs, French
owner guide. `.github/workflows/ci.yml`: install, `pnpm check`, `pnpm test`,
`pnpm build`, `pnpm test:build`, `pnpm e2e`. Deployment by Cloudflare Workers
Builds (build `pnpm build`, deploy `npx wrangler deploy`), secrets in the
Worker settings, custom domain `racinesenpartage.fr` plus `www` redirect,
e-mail routing for `contact@` and the Resend DNS records, Stripe webhook
endpoint `https://racinesenpartage.fr/api/webhooks/stripe`, Sveltia
Authenticator worker and GitHub OAuth app. All of it is written step by step
in `docs/deployment.md` (developer) and `docs/guide-proprietaire.md` (owner,
French).

## 10. Ownership, support, independence

Accounts are opened in Marie's name from day one wherever possible (Stripe,
Mondial Relay, domain registrant, Cloudflare, Resend), with the developer
invited as a member; only the GitHub repository is transferred at handover
(to a `racinesenpartage` account created for her). The developer keeps collaborator access during
the support period. The code is assigned to her in full at final payment
(short assignment letter template in `docs/handover.md`). Running costs:
domain about 8 EUR per year; Stripe per transaction; Mondial Relay per label;
everything else free at her scale. Support options and the "what to do when"
table (change a price, add a product, run out of stock, refund, holiday
pause, the site is down, change the e-mail) are in the owner guide.

## 11. Out of scope for this version

Customer accounts, stock counters synchronised with sales, reviews,
newsletter, blog, gift cards, multi-currency, wholesale pricing, automatic
Mondial Relay label purchase (done in Marie's Mondial Relay space from the
order e-mail), live chat. Each can be added without changing the model above.

## Appendix A: product data transcribed from the labels (FR)

Prices are placeholders to confirm with Marie (`launch.pricesConfirmed`).
Nutrition values are per 100 g as printed. The grués de cacao table printed
on the label repeats the moringa table and is marked `nutritionVerified:
false`.

1. `poudre-de-moringa-100g`, SKU REP-MOR-100, poudres, 8.90 EUR, 100 g, Niger (NE), featured.
   Ingrédients: 100 % feuilles de Moringa (Moringa oleifera) séchées et broyées. Sans additif. Sans colorant. Sans conservateur.
   Comment est obtenue la poudre: La poudre de Moringa est obtenue à partir des feuilles séchées, qui sont soigneusement broyées pour obtenir une poudre fine et naturelle.
   Nutriments: naturellement source de protéines, fer, calcium, polyphénols.
   Conseils: à incorporer dans les smoothies, les jus de fruits, les yaourts et compotes, les sauces, les préparations culinaires. Commencer par une petite quantité et ajuster selon vos envies.
   Recette "Smoothie au Moringa": 1 cuillère à café de poudre de Moringa, 1 banane bien mûre, 1 pomme ou quelques morceaux d'ananas, 200 ml d'eau ou de lait végétal, 1 cuillère à café de miel selon votre goût, quelques glaçons. Mettre tous les ingrédients dans un mixeur, mixer jusqu'à obtenir une préparation homogène et onctueuse, servir frais.
   Conservation: conserver dans un endroit sec, à l'abri de la chaleur et de l'humidité. Bien refermer après ouverture.
   Nutrition (from the 200 g label, same product): 1290 kJ / 308 kcal; MG 3,0 g dont AGS 0,7 g; glucides 64 g dont sucres < 2,5 g; fibres 13 g; protéines 13 g; sel < 0,03 g. Verified true.
   Ne contient pas: additifs, conservateurs, colorants, gluten.
2. `poudre-de-moringa-200g`, SKU REP-MOR-200, poudres, 15.90 EUR, 200 g, Niger (NE).
   Ingrédients: 100 % feuilles de moringa séchées, broyées. Produit fini vendu en poudre (non en feuilles entières). Sans additifs, sans conservateur, sans colorant, sans gluten.
   Conseils: à incorporer dans vos boissons, préparations culinaires (soupes, sauces, plats), smoothies ou jus. Idées: dans un verre d'eau le matin ou avant un repas; dans vos smoothies; dans vos yaourts, soupes ou desserts.
   Bienfaits (label wording): riche en vitamines (A, C, E, K); source de minéraux (fer, calcium, magnésium, potassium); riche en protéines végétales; antioxydant naturel; contribue à la vitalité et au bien-être.
   Nutrition as above, verified true. Related: 100 g.
3. `poudre-de-baobab-100g`, SKU REP-BAO-100, poudres, 7.90 EUR, 100 g, Sénégal (SN), featured.
   Comment est obtenue la poudre: La poudre de baobab est obtenue à partir de la pulpe séchée du fruit du baobab. Après récolte, la pulpe naturellement sèche est séparée des graines et des fibres, puis réduite en une poudre fine.
   Ingrédients: 100 % pulpe de fruit de baobab en poudre. Sans additif. Sans colorant. Sans conservateur.
   Nutriments: naturellement source de fibres alimentaires, vitamine C, calcium, potassium, magnésium.
   Conseils: à incorporer dans les boissons et jus de fruits, les smoothies, les yaourts et compotes, les céréales et porridges, les préparations et desserts. Bien mélanger avant consommation.
   Recette "Boisson fraîche au baobab": 1 à 2 cuillères à café de poudre de baobab, 250 ml d'eau fraîche, 1 cuillère à café de miel ou de sucre selon votre goût, quelques glaçons. Mélanger la poudre de baobab avec un peu d'eau, puis ajouter progressivement le reste de l'eau. Sucrer selon votre goût et servir bien frais.
   Conservation: standard. No nutrition table on the label (verified false, no table).
4. `poudre-de-souchet-100g`, SKU REP-SOU-P100, poudres, 6.90 EUR, 100 g, Niger (NE).
   Ingrédients: produit 100 % végétal, sans gluten. Poudre obtenue après broyage des tubercules de souchet.
   Conseils: à incorporer dans vos boissons, préparations crues ou cuites ou recettes selon vos envies.
   Les plus (label wording): sans gluten; riche en vitamine E; apporte des minéraux (fer, magnésium, phosphore, potassium); des protéines végétales; et des fibres alimentaires.
   Conservation: conserver dans un endroit sec, à l'abri de la chaleur et de l'humidité. No table.
5. `tubercules-de-souchet-200g`, SKU REP-SOU-T200, graines, 7.90 EUR, 200 g, origin not printed (leave "Afrique de l'Ouest" to confirm), featured.
   Ingrédients: 100 % tubercules de souchet (sans additifs, sans conservateur, sans colorant).
   Conseils: à incorporer dans vos boissons, préparations culinaires ou recettes selon vos envies. Idées: en lait végétal, smoothie ou yaourt; dans vos pâtisseries, soupes ou desserts.
   Recette "Horchata de souchet (lait de souchet)": faites tremper 250 g de tubercules de souchet dans 1 litre d'eau pendant 12 h; égouttez et rincez; mixez avec 1 litre d'eau fraîche; filtrez à l'aide d'un tissu propre; sucrez selon votre goût (miel, sirop, etc.).
   Les plus: source de fibres; source de protéines végétales; source de magnésium, de fer, de phosphore et de potassium.
   Nutrition: 400 à 450 kcal; MG 22 à 25 g dont AGS < 1 g; glucides 40 à 45 g dont sucres < 5 g; fibres 20 à 25 g; protéines 4 à 5 g; sel 0,05 g. Verified true.
6. `poudre-d-orge-grillee-100g`, SKU REP-ORG-100, poudres, 5.90 EUR, 100 g, "Allemagne, Sonam'Tsampa" (DE).
   Ingrédients: 100 % orge grillée (sans additifs, sans conservateur, sans colorant, sans gluten) [label wording; barley contains gluten in law, flag for the owner].
   Conseils: à incorporer dans vos boissons, préparations culinaires (soupes, porridges, bouillies, crêpes, etc.) ou à saupoudrer sur vos plats. Idées: dans un grand verre d'eau, le matin ou avant un repas; dans vos smoothies; dans vos yaourts, soupes ou desserts.
   Bienfaits: riche en fibres; source de protéines végétales; source de minéraux (fer, calcium, magnésium, phosphore, potassium); indice glycémique modéré (environ 35).
   Nutrition: 1529 kJ / 362 kcal; MG 3,0 g dont AGS 0,7 g; glucides 64 g dont sucres < 2,5 g; fibres 13 g; protéines 13 g; sel < 0,03 g. Verified true.
7. `fleurs-d-hibiscus-bissap-100g`, SKU REP-HIB-100, infusions, 6.50 EUR, 100 g, origin not printed (to confirm), featured.
   Ingrédients: 100 % fleurs d'hibiscus séchées (calices). Sans additifs, sans conservateur, sans colorant, sans gluten.
   Conseils: à incorporer dans vos boissons, infusions, sirops, jus ou recettes selon vos envies. Idées: en infusion chaude ou froide; dans vos smoothies; pour la préparation de sirops ou de jus naturels.
   Recette "Infusion de bissap": faites bouillir 1 litre d'eau; ajoutez 2 à 3 cuillères à soupe de fleurs d'hibiscus; laissez infuser 10 à 15 minutes; filtrez et dégustez chaud ou froid. Vous pouvez ajouter un peu de miel, de menthe ou de citron selon vos goûts.
   Bienfaits: riche en antioxydants; source de vitamine C; contribue à une bonne hydratation; goût fruité et rafraîchissant.
   Nutrition: 1290 kJ / 308 kcal; MG 0,4 g dont AGS 0,1 g; glucides 68 g dont sucres < 2,5 g; fibres 13 g; protéines 3,2 g; sel < 0,03 g. Verified true.
8. `teguments-de-psyllium-200g`, SKU REP-PSY-200, graines, 9.90 EUR, 200 g, Inde (IN).
   Ingrédients: téguments de Psyllium 100 % naturels, sans additif, sans gluten.
   Conseils: à incorporer dans vos boissons, préparations crues ou cuites ou recettes selon vos envies.
   Les plus (label wording): riche en fibres alimentaires; favorise le transit intestinal; aide à la digestion; contribue à maintenir un taux de cholestérol normal; 100 % naturel. [Health claims: keep only wording that appears on the label, add the general disclaimer.]
   Conservation: standard. No table.
9. `poudre-de-cacao-100g`, SKU REP-CAC-P100, cacao, 6.90 EUR, 100 g, Côte d'Ivoire (CI).
   Ingrédients: 100 % cacao ivoirien. Poudre obtenue après extraction du beurre de cacao avec un arôme intense.
   Conseils: idéal pour vos boissons chaudes (chocolat, lait végétal); pour vos pâtisseries, desserts et yaourts; à saupoudrer sur vos plats favoris.
   Recette "Chocolat chaud maison": faites chauffer 1 litre de lait végétal (amande, avoine ou autre); ajoutez 2 à 3 cuillères à soupe de poudre de cacao; sucrez selon votre goût et mélangez bien; laissez frémir 10 minutes en remuant. Dégustez bien chaud.
   Nutrition: 1489 kJ / 357 kcal; MG 22,6 g dont AGS 13,5 g; glucides 17,1 g dont sucres 0,7 g; fibres 24,0 g; protéines 13 g; sel < 0,03 g. Verified true.
10. `grues-de-cacao-100g`, SKU REP-CAC-G100, cacao, 7.90 EUR, 100 g, Côte d'Ivoire (CI).
    Ingrédients: 100 % grué de cacao ivoirien.
    Conseils: à consommer tel quel (en encas); à ajouter dans vos yaourts, smoothies, porridges, céréales ou desserts; ou à utiliser en pâtisserie (cookies, muffins, gâteaux).
    Bienfaits: riche en antioxydants; source de magnésium, fer, phosphore et potassium; contribue à une bonne énergie; goût intense et naturel.
    Nutrition: as printed but implausible (3,0 g MG), verified false.

Shared label texts: "Notre philosophie: prendre soin de soi en partageant le
goût et les bienfaits de nos terroirs." "Naturellement bon !" "Conditionné
par l'ESAT Les Oliviers (Gennevilliers, 92)."

## Appendix B: photo inventory

Sixteen photos, 2000 by 3000 px (one 3000 by 2000), all distinct (MD5 and
perceptual hash). Single packshots: `Racine en partage.jpg` souchet
tubercules; `-01` hibiscus; `-02` souchet poudre; `-03` orge grillée; `-04`
baobab; `-05` psyllium; `-06` cacao poudre; `-07` grués; `-08` moringa 100 g;
`-09` moringa 200 g. Duos: `-10` moringa 200 + 100; `-11` grués + poudre de
cacao; `-12` souchet poudre + tubercules; `-13` baobab + orge; `-14` hibiscus
+ psyllium. Trio landscape `-15` orge, hibiscus, moringa: the hero. Logos:
`logo.png` (1536 by 1024, transparent, with tagline) and `logo2.png` (1254 by
1235, white background, the cleaner source for the medallion crop). Originals
stay outside the repository; the repository holds WebP derivatives at 1600 px
(products), 2400 px (hero) and the brand crops.
