# Racines en Partage: iteration 3, owner data and the features that make a shop complete

Date: 2026-11-08. Builds on `2026-11-01-racines-en-partage-shop-design.md`
(the v1 spec) and the two first iterations recorded in the implementation
plan's progress log. This document is the source of truth for the third
iteration; the v1 spec stays authoritative for everything it does not change.

## 1. Inputs of this iteration

### 1.1 New data from the owner (notes of 2026-11-08)

- E-mail: `racinesenpartage@gmail.com` replaces the Outlook address everywhere
  (settings, legal texts, FAQ, docs, e-mail reply-to).
- SIRET `911 858 843 00020` (SIREN `911 858 843`, NIC `00020`). The legal
  notice prints both; the settings hold the SIRET and the SIREN is derived.
- Question: "Est-ce possible de relier ma banque Hello Bank à ce site ?".
  Answer for the client letter: yes, Stripe pays out to any French bank
  account; she enters her Hello Bank IBAN in Stripe (Paramètres, Comptes
  bancaires et devises) and payouts arrive automatically, daily or weekly,
  with a 7-day first delay. Nothing to build.
- Reference sites she likes: kasana.bio (and its webshop on
  nature-snacks.bio), herboristerieduvalmont.com, thes-traditions.com. The
  study is `2026-11-08-reference-sites-study.md` (made with REA's browser
  inspection of eight pages plus the downloaded HTML; both PrestaShop shops
  use Société des Avis Garantis for reviews and Brevo for the newsletter,
  Thés & Traditions is the premium benchmark: price per kilo, bulk saving,
  size options, numbered collection cards, complete Product JSON-LD).
- "Tous mes produits sont : 100 % végétal, sans additif, sans conservateurs":
  a site-wide promise, shown on the home reassurance strip, the product page
  assurance list and the About page.
- Product sheet (`fiche-produits.md`, hibiscus sheet) with her own prices,
  origins and descriptions. Prices (TTC): hibiscus 100 g 4 EUR, moringa 100 g
  6 EUR and 200 g 11 EUR, baobab 100 g 6 EUR and 200 g 12 EUR (new product),
  roasted barley 100 g 5 EUR, psyllium 200 g 7 EUR, tiger nut powder 100 g
  5 EUR, tiger nut tubercules 200 g 7 EUR. Cacao powder and nibs are not in
  the sheet and keep their placeholders, so `launch.pricesConfirmed` stays
  false until she confirms the two cacao prices. Origins: hibiscus Cameroon
  (it was "Afrique de l'Ouest"), tubercules Niger, the rest unchanged.
  Descriptions are rewritten in her voice (regional names of bissap, "pain
  de singe", "amande de terre", storage tips) under the health-claim policy
  of CLAUDE.md: no nutrition or health claim that a displayed table does not
  support. Her sheet's "contribuent au fonctionnement normal du transit",
  "riche en vitamine C", "antioxydants", "favoriser le microbiote" and the
  tsampa "valeurs indicatives" ranges are therefore not printed; the client
  letter lists them.

### 1.2 What the reference sites do that we do not (summary)

Full study in `2026-11-08-reference-sites-study.md`. The features that matter
for a 10-product micro-shop, ranked by value over cost on a static stack:

| Feature                               | References            | Decision      |
| ------------------------------------- | --------------------- | ------------- |
| Customer reviews with verified badge  | Valmont, Thés & T.    | Build (2.1)   |
| Price per kilo next to the price      | all three (legal)     | Build (2.4)   |
| Formats 100 g / 200 g switch          | Kasana shop, Thés & T | Build (2.5)   |
| Newsletter with double opt-in         | Valmont, Thés & T.    | Build (2.2)   |
| Contact form                          | all three             | Build (2.3)   |
| Order lookup without an account       | none (accounts do it) | Build (2.6)   |
| Site search                           | all three             | Build (2.7)   |
| Recipes / blog section                | Kasana, Thés & T.     | Build (2.8)   |
| Cart cross-sell                       | Thés & T.             | Build (2.9)   |
| Back-in-stock alert                   | Valmont               | Build (2.10)  |
| Promo codes                           | all three             | Already there |
| Cookieless analytics                  | (they use GTM)        | Build (2.11)  |
| "How it works" delivery steps         | Thés & T.             | Build (2.12)  |
| Product finder quiz                   | Thés & T.             | Later (3)     |
| Customer accounts, Google sign-in     | Valmont, Thés & T.    | No (3)        |
| Wishlist                              | Valmont, Thés & T.    | No (3)        |
| Loyalty points, referral              | Thés & T.             | No (3)        |
| Live chat (Valmont's chatbot)         | Valmont               | No (3)        |
| Instagram feed                        | Thés & T.             | Later (3)     |
| B2B page                              | Kasana                | Later (3)     |
| Gift cards                            | Valmont               | No (3)        |
| Cookie banner                         | all three             | Not needed    |

## 2. Features to build

Every feature keeps the stack: static Astro pages, one Cloudflare Worker, no
database. New state lives in Stripe metadata, in Resend (contacts) or in the
Git repository (reviews), so the owner keeps zero fixed cost.

### 2.1 Customer reviews (verified purchase, moderated by the owner)

Flow:

1. A daily Cron Trigger of the Worker (`0 9 * * *`, Paris morning) lists the
   Checkout Sessions created between 8 and 7 days ago. For each paid session
   with a customer e-mail and without `metadata.review_invited`, it sends a
   review invitation (FR or EN per `metadata.locale`) through Resend with
   the idempotency key `<session id>:review`, then sets
   `metadata.review_invited = 'true'`. Each session falls into exactly one
   daily window, so a missed day sends nothing twice.
2. The e-mail links to `/avis/?t=<token>` (EN `/en/review/?t=`). The token
   is `base64url(payload).base64url(hmac-sha256(payload, FORMS_SECRET))`
   with payload JSON `{ s: sessionId, k: [sku...], l: locale, e: expiryUnix }`
   (expiry 60 days). The page decodes the payload (without verifying) to show
   the ordered products and one form per product; the Worker verifies.
3. `POST /api/reviews` `{ token, sku, rating, author, title?, text, locale }`
   verifies the signature and expiry, checks the SKU is in the token, retrieves
   the session, refuses when `metadata['reviewed_' + sku]` is set (409
   `ALREADY_REVIEWED`), then writes
   `src/content/reviews/<product slug>--<order number>.yml` through the GitHub
   Contents API (`GITHUB_TOKEN` fine-grained, contents read and write on this
   repository, `GITHUB_REPO` variable) with `published: false`, and marks the
   session metadata. The commit message is
   `content: avis client sur <product slug>`.
4. The owner opens Sveltia, collection "Avis clients", reads, toggles
   "Publié", saves. The push rebuilds the site: the review appears on the
   product page, in the aggregate rating and in the JSON-LD.

Review file (collection `reviews`, folder `src/content/reviews/`, not
localised: each review carries its language):

```yaml
product: poudre-de-moringa-100g # product slug
rating: 5 # 1 to 5
author: Awa # first name or pseudonym, 2 to 40 characters
locale: fr
date: 2026-11-08
order: X9Y8Z7W6 # order number, empty for a review the owner adds herself
verified: true # came through the invitation token
published: false # the owner toggles it
title: Un vrai goût de feuille # optional, 80 characters max
text: >- # 20 to 1200 characters
  ...
reply: '' # optional public answer from the owner
```

Display: a "Avis" section on the product page (stars, count, average to one
decimal, list of published reviews newest first, verified badge, owner reply
in a quoted block, "Vous l'avez goûté ? Vous recevrez une invitation à donner
votre avis une semaine après votre commande." when there is none); a review
summary (stars and count) under the price when count is 1 or more; the same
summary on product cards; a "Ils en parlent" band on the home page when at
least three reviews are published site-wide (three most recent, with the
product name). JSON-LD: `aggregateRating` and the first five `review` nodes
on the Product. Reviews of a hidden product are not shown.

Anti-abuse: the token is the only way in (no public form), one review per
product per order, rate limit `FORMS_LIMITER` 10 per minute per IP, text
length limits, HTML stripped, author and text pass the same allow-list as the
relay text, and nothing is published without the owner.

### 2.2 Newsletter (Resend Audiences, double opt-in)

- Signup block in the footer on every page (e-mail field, consent sentence
  with a privacy link, submit) and the same component as a band on the
  recipes page. `POST /api/newsletter` `{ email, locale, turnstile? }` always
  answers 202 `{ ok: true }` (no account enumeration) and sends a confirmation
  e-mail with the link `/api/newsletter/confirm?t=<token>` (payload
  `{ m: email, l: locale, e: expiry 48 h }`, same signing as 2.1).
- The e-mail links to the static page `/newsletter/?t=<token>` (EN
  `/en/newsletter/?t=`), which shows a "Confirmer mon inscription" button;
  the click does `POST /api/newsletter/confirm` `{ token }`, which verifies
  and creates the contact in the Resend audience `RESEND_AUDIENCE_ID`
  (200 `{ ok: true }`, 400 `INVALID_TOKEN`, 502 `MAIL_FAILED`, 404
  `FEATURE_DISABLED`). A GET would let mail scanners that prefetch links
  subscribe people without a click; the POST keeps the consent proof. The
  page strips the token from the address once read.
- Campaigns: the owner writes them in Resend Broadcasts (documented in the
  owner guide, with the legal footer and the unsubscribe link Resend adds).
  `settings.newsletter.welcomeCode` (optional) prints a promotion code in
  the confirmation e-mail; she creates the code in Stripe.
- `settings.newsletter.enabled: false` hides every signup block and makes the
  endpoints answer 404.

### 2.3 Contact form and 2.10 back-in-stock alert

`POST /api/contact` `{ kind: 'contact' | 'stock_alert', locale, name, email,
message?, sku?, turnstile?, website: '' }` sends one e-mail to
`ORDER_EMAIL_TO` with reply-to the customer (subject "Message du site de
<name>" or "Alerte de stock : <product> pour <email>"), answers 202
`{ ok: true }`. `website` is a honeypot: when filled, answer 202 and send
nothing. Rate limit `FORMS_LIMITER`. The contact page shows the form next to
the existing contact cards; a product with stock `out` shows "Prévenez-moi du
retour" with an e-mail field under the disabled add button. The owner answers
by e-mail herself (documented); no storage.

Cloudflare Turnstile protects the contact, newsletter and stock-alert forms:
`settings.forms.turnstileSiteKey` (public) renders the widget, the Worker
verifies `turnstile` with `TURNSTILE_SECRET_KEY` when that secret is set, and
skips verification when it is not (local development, before the owner
creates the widget). The script loads lazily on the first focus of a form,
from `https://challenges.cloudflare.com` (added to `script-src` and
`frame-src` in the global CSP block).

### 2.4 Price per kilo

French law (arrêté du 16 novembre 1999 and article L112-1 of the code de la
consommation) requires the unit price for pre-packaged food. `formatUnitPrice`
prints "65,00 €/kg" (FR) or "€65.00/kg" (EN) from the cents and the net
weight; it appears under the price on the product page, on the product cards
(small, muted) and in the cart lines. The catalogue JSON for Stripe is not
changed.

### 2.5 Formats

Products with the same French `name` in the same category are one family
(moringa 100 g and 200 g, baobab 100 g and 200 g). The product page shows a
"Format" row of pills (100 g, 200 g) linking to each sibling, the current one
pressed; the price per kilo shows the saving. No new CMS field: the family is
derived at build time.

### 2.6 Order lookup ("Retrouver ma commande")

Page `/ma-commande/` (EN `/en/my-order/`): order number and e-mail fields.
`POST /api/orders/lookup` `{ number, email }` lists the Checkout Sessions of
that e-mail (`customer_details.email` filter, 100 most recent), finds the one
whose `orderNumber(id)` matches (case and spaces ignored), and returns the same
public order as `GET /api/orders/:id`, without the 48 h limit (the pair number
plus e-mail is the proof). 404 `ORDER_NOT_FOUND` otherwise, rate limit
`ORDERS_LIMITER`. The page renders the order with the thanks page's renderer
(lines, amounts, delivery, Point Relais, status). The link is in the footer
("Suivre ma commande"), the FAQ and the confirmation e-mail.

### 2.7 Search

A search button in the header opens a `<dialog>` with one input. The client
filters the embedded `#rep-catalog` (name, category name, keywords) and shows
the matching products with thumbnail, price and the add button; Enter on a
single result opens it, Escape closes. `ClientProduct` gains `category`
(slug), `categoryName` and `keywords` (the French and English regional names:
bissap, karkadé, tchongon, chufa, tsampa, ispaghul). Works on every page, no
network request.

### 2.8 Recipes page

`/recettes/` (EN `/en/recipes/`) lists every product recipe as a card (photo,
title, product name, number of steps, "Voir la recette" to the product's
recipe anchor), with a short intro and the newsletter band. `Recipe` JSON-LD
per card (`name`, `recipeIngredient`, `recipeInstructions`, `image`). The
home "Petites recettes" section links to it. Header and footer get the link.

### 2.9 Cart cross-sell

The cart drawer and the cart page show "Complétez votre commande": up to two
products taken from the `related` lists of the lines (then the featured ones),
not already in the cart, with thumbnail, price and an add button.
`ClientProduct` gains `related: sku[]` and `featured: boolean`.

### 2.11 Analytics

Cloudflare Web Analytics (free, cookieless, no consent banner needed):
`settings.analytics.cloudflareToken` (empty by default) adds the beacon
script to every page; the CSP allows `https://static.cloudflareinsights.com`
(script) and `https://cloudflareinsights.com` (connect). The owner reads
visits in the Cloudflare dashboard (owner guide).

### 2.12 Home additions

- "Comment ça marche" band: three steps (Commandez, Choisissez votre Point
  Relais ou le retrait à Arnouville, Recevez et partagez) with icons.
- Reviews band (2.1) when three reviews are published.
- The reassurance strip reads: "100 % végétal, sans additif ni conservateur",
  "Conditionné en France par l'ESAT Les Oliviers", "Livraison en Point Relais,
  offerte dès 49 €", "Paiement sécurisé".

### 2.13 Product page additions

Price per kilo, formats, review summary and section, sticky buy bar on phones
(appears when the add button scrolls out of view: price plus "Ajouter"),
"Prévenez-moi" when out of stock, "100 % végétal" assurance line.

## 3. Decisions on the other features

**Customer accounts with Google sign-in: not now.** An account system needs a
database (Cloudflare D1), an OAuth client the owner must register and keep
alive in Google Cloud, session cookies, a consent banner for the login cookie,
GDPR tooling (export, deletion, retention) and support work (lost access).
That is three to five days of build and an ongoing maintenance surface, for a
shop whose typical basket is one to three sachets. Guest checkout plus Stripe
Link already saves the card and the address for returning customers across
every Stripe shop, and the order lookup (2.6) gives "see what I bought"
without a password. Baymard's checkout studies rank mandatory accounts among
the top abandonment reasons. Revisit when the shop has a loyalty programme or
more than about 100 orders a month.

**Wishlist, loyalty points, referral: not now.** They only pay off with
accounts and a catalogue large enough to browse. Promotion codes (already
live in Stripe Checkout) cover the "offer" use case.

**Live chat, WhatsApp button: no.** Both create an expectation of instant
answers the owner cannot hold alone; the contact form and the phone number
answer the need.

**Product finder quiz ("Trouvez votre rituel"): later.** Nice brand moment,
three questions client-side; built in the next iteration if the owner likes
the idea.

**Instagram feed: later**, once she has an account; the link is already
supported. **B2B page: later**, if she confirms she sells to shops. **Gift
cards: no**, Stripe makes them a manual process the owner must track.

**Cookie banner: not needed.** The site sets no tracking cookie: the cart is
in localStorage (strictly necessary), Turnstile and Cloudflare Web Analytics
are cookieless, Stripe's cookies live on Stripe's pages.

## 4. Data model changes

- `settings.brand.siret` (14 digits) replaces `siren`; `legalTokens` exposes
  `{siren}` (first 9 digits, grouped by 3) and `{siret}` (grouped 3 3 3 5).
  `pnpm launch-check` validates the SIRET with the Luhn checksum.
- `settings.forms.turnstileSiteKey` (string, may be empty),
  `settings.newsletter.{enabled, welcomeCode}`,
  `settings.analytics.cloudflareToken`, `settings.reviews.enabled`.
- Product `keywords` (optional list, translated) for search.
- Collection `reviews` (section 2.1).
- Routes: `recipes`, `lookup`, `review` (noindex), `newsletter` (noindex).
- Locale namespaces: `reviews`, `recipes`, `search`, `forms`, `lookup`; new
  keys in `shop` (how it works), `product` (unit price, formats, stock alert),
  `cart` (cross-sell), `footer` (newsletter, lookup link), `nav` (recipes).

## 5. Worker API additions

| Route                           | Limit            | Notes                                        |
| ------------------------------- | ---------------- | -------------------------------------------- |
| `POST /api/contact`             | FORMS_LIMITER    | kinds contact and stock_alert, honeypot      |
| `POST /api/newsletter`          | FORMS_LIMITER    | always 202, confirmation e-mail              |
| `POST /api/newsletter/confirm`  | FORMS_LIMITER    | `{ token }`, adds the Resend contact         |
| `POST /api/reviews`             | FORMS_LIMITER    | token, GitHub commit, session metadata       |
| `POST /api/orders/lookup`       | ORDERS_LIMITER   | number plus e-mail                           |
| scheduled (`0 9 * * *`)         |                  | review invitations                           |

New secrets: `FORMS_SECRET` (32 random bytes, base64), `GITHUB_TOKEN`,
`TURNSTILE_SECRET_KEY` (required in production: without it the contact and
newsletter routes answer `FEATURE_DISABLED`, unless the development-only var
`FORMS_ALLOW_WITHOUT_CAPTCHA` is `true`), `RESEND_AUDIENCE_ID` (optional,
newsletter disabled without it). New variables: `GITHUB_REPO`,
`FORMS_DAILY_LIMIT` (default 60). Optional KV binding `FORMS_KV`: a daily
counter of form-triggered e-mails, so a flood of forms can never use up the
Resend quota the order e-mails need. Tokens carry a signed type
(`t: 'review' | 'newsletter'`). The cron looks at sessions created 10 to 7
days ago, so a failed run is retried on the following days. Origin check as for
checkout. Error codes added: `CAPTCHA_FAILED`, `ALREADY_REVIEWED`,
`INVALID_TOKEN`, `ORDER_NOT_FOUND`, `MAIL_FAILED`, `FEATURE_DISABLED`.
Every new endpoint is covered by Worker tests with fakes (Stripe list, GitHub
fetch, Turnstile fetch, Resend contacts).

## 6. Testing and gates

Unit tests for the new pure helpers (unit price, formats, review aggregate,
search index, cross-sell picking, token signing shared module), Worker tests
for every endpoint and the cron, build tests for the new headers and the
`Recipe` and `AggregateRating` JSON-LD, e2e for the search dialog, the contact
form (API mocked), the lookup page and the review page, axe on the new pages.
`pnpm check`, `pnpm test`, `pnpm test:worker`, `pnpm build`, `pnpm test:build`,
`pnpm e2e` stay green; no em dash in content or Markdown.

## 7. Out of scope

Quiz, Instagram feed, B2B page, accounts, loyalty, chat, gift cards (section
3). Shipping status ("expédiée") in the order lookup: it would need the owner
to mark orders shipped somewhere; Stripe has no such state, so the page shows
the order and the carrier's own notification channel instead.

## 8. Addendum (2026-11-08, owner feedback after the first delivery)

### 8.1 Page width

The Nature Snacks shop stretches its grid to the full window; this site keeps
a centred container. Both are choices; the premium one is the hybrid defined
in `docs/design/premium-standard.md` section 2: text and controls in a
bounded column, product grids wider on large screens, photography and bands
full-bleed. Changes: `--container` 1200 to 1280 px, a `.container-wide`
(1440 px) for the shop grid and the home featured grid with five columns from
1600 px, gutters 56 px from 1440 px, the hero photograph and the coloured
bands bleed to the edges, body measure stays at 55 to 75 characters.

### 8.2 Phone navigation

Phones are the primary device. The header hides on scroll down and returns on
scroll up (transform only, 200 ms), the mobile menu becomes a full-height
panel with 56 px rows, the contact line and the language switch, closing on
Escape, backdrop and navigation; page transitions stay a 150 ms crossfade;
the sticky buy bar and the cart drawer are thumb-reachable; every page is
walked at 390 px with one thumb before release. The audit against the
standard is `docs/design/premium-audit-2026-11-08.md`, with its fixes.

### 8.3 Business card

`pnpm card [medaillon|kraft|foret]` renders a 85 x 55 mm card (3 mm bleed)
with the wordmark, the international phone, the e-mail and a QR code to the
site, as a print PDF, PNG faces, a shareable image and previews, into
`docs/branding/card/` and `public/carte/`, plus a vCard. The page `/carte/`
(`/en/card/`, noindex, footer link) shows both faces and the downloads. Three
variants are proposed to the owner; the published one is the script's
argument.

### 8.4 Address and phone

The postal address prints the country ("9 Rue du Marché, 95400 Arnouville,
France") in the footer, the contact page, the checkout pickup line, the
thanks page and the e-mails. The phone prints "07 75 68 91 08" on French
pages and "+33 7 75 68 91 08" on English pages, the card and the vCard
(`formatPhoneIntl`); the `tel:` link is always E.164.

### 8.5 Recipes in the navigation

"Recettes" leaves the header: with six recipes attached to products it is a
content section, not a destination. It stays reachable from the home recipes
section, the shop page head ("Nos recettes"), product recipe disclosures and
the footer. The header holds Boutique, Notre histoire, FAQ, Contact, plus the
search, account and cart icons.

### 8.6 Customer space without passwords ("Mon espace")

The owner wants customers to see what they bought before, as the catalogue
grows, with zero maintenance and full trust. The answer is a passwordless
space backed by Stripe, the pattern Shopify's new customer accounts use:
no database, no password, no OAuth client to maintain.

Flow:

1. `/mon-compte/` (EN `/en/account/`, route `account`, noindex). Logged out:
   an e-mail field, "Recevoir mon lien de connexion", the sentence "Pas de mot
   de passe : un lien valable 15 minutes arrive dans votre boîte mail."
   `POST /api/account/login` `{ email, locale, turnstile? }` always answers
   202 and sends the link `<SITE_URL>/mon-compte/?t=<token>` (token
   `{ t: 'login', m, l, e: now + 15 min }`, Turnstile and the daily budget as
   for the other forms, `FORMS_LIMITER`).
2. Arriving with `?t=`, the page strips the token from the address and posts
   it to `POST /api/account/session` `{ token }`, which verifies it and
   answers 200 `{ ok: true, email: "a***@gmail.com" }` with the cookie
   `rep_session=<token { t: 'session', m, e: now + 30 days }>`; `HttpOnly;
   Secure; SameSite=Lax; Path=/api/account; Max-Age=2592000`. 400
   `INVALID_TOKEN` otherwise.
3. `GET /api/account/orders` (cookie, `ORDERS_LIMITER`) lists the Checkout
   Sessions of that e-mail (`customer_details.email`, 100 most recent,
   `status: complete`), newest first, line items attached for the 20 most
   recent, and answers `{ email (masked), orders: PublicOrder[] }`; 401
   `UNAUTHENTICATED` without a valid cookie.
4. `POST /api/account/review-token` `{ sessionId }` (cookie) checks the
   session belongs to the e-mail and is paid, and answers `{ token }` for the
   SKUs not yet reviewed (the same review token as the invitation), or 409
   `ALREADY_REVIEWED`.
5. `POST /api/account/logout` clears the cookie.

Page, logged in: a greeting with the masked e-mail and "Se déconnecter"; one
card per order (date, number, status, total, delivery mode) that expands to
the shared order renderer; "Commander à nouveau" adds the order's lines that
are still in the catalogue to the cart and opens the drawer; "Donner mon
avis" on paid orders opens `/avis/?t=`. Empty state: "Aucune commande avec
cette adresse. Vous avez peut-être commandé avec une autre adresse e-mail."
The account icon sits in the header next to the cart; the footer link reads
"Mon espace"; the order lookup page stays for people without their mailbox at
hand and links to the space. The privacy policy names the session cookie
(strictly necessary, 30 days). Google sign-in stays out: it would add an
OAuth client to maintain and a consent banner for no gain over the e-mail
link, since every order already has the e-mail.
