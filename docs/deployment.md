# Deployment, domain, payments, e-mail

The shop is one Cloudflare Worker. `pnpm build` produces `dist/` (static
pages, images, `catalog.json`); `npx wrangler deploy` uploads `dist/` as
static assets together with the Worker script in `worker/`, which answers
`/api/*` (checkout, order pages, Stripe webhook, forms, reviews) and runs
the daily review invitations. Workers Builds runs both commands on every
push to `main`. There is no database: Stripe holds the orders,
`catalog.json` holds prices and stock, the repository holds the content and
the reviews, Resend holds the newsletter contacts.

The ordered checklist with who does what is `docs/launch-runbook.md`; this
file is the detailed reference it points to. Everything below is done once,
in web interfaces, in the order given. Values
marked "to verify" were not confirmed on 2026-11-01; check them on the
provider's page before relying on them.

Who owns what, and what changes at handover, is in `docs/handover.md`.

## 1. GitHub repository and CI

1. Create the private repository `ngawang21/racines-en-partage` (no README,
   no licence: the repository already has its files).
2. Push:

   ```bash
   git remote add origin git@github.com:ngawang21/racines-en-partage.git
   git push -u origin main
   ```

3. Actions tab: the `ci` workflow must pass (install, `pnpm check`,
   `pnpm test`, `pnpm build`, `pnpm test:build`, `pnpm e2e`).
4. Settings, Branches: no protection rule is needed while one developer works
   on `main`. The CMS also commits to `main`.

At handover the repository moves to Marie's GitHub account
`racinesenpartage` (see `docs/handover.md`, section 2).

## 2. Cloudflare account and Workers Builds

The Cloudflare account is opened in Marie's name from day one, because it
holds the domain zone, the Worker and the secrets.

1. With Marie: create a free Cloudflare account with
   `racinesenpartage@gmail.com`. She sets the password and two-factor
   authentication on her phone.
2. She invites the developer: Manage account, Members, Invite, role
   Administrator (exact role names to verify in the dashboard).
3. Developer, in that account: Workers & Pages, Create, Import a repository,
   authorise the Cloudflare GitHub app on `ngawang21` and choose
   `racines-en-partage`.
4. Build settings:
   - Project (Worker) name: `racines-en-partage` (must match `name` in
     `wrangler.jsonc`)
   - Build command: `pnpm build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
   - Node version: taken from `.nvmrc` (22)
   - Build variable: `PUBLIC_MONDIAL_RELAY_BRAND` = `BDTEST` for now (see
     section 9)
5. Deploy. The first deployment answers on
   `racines-en-partage.<account>.workers.dev`. Open it on a phone and check
   the home page, `/boutique/`, a product page and `/api/health`.
6. Settings, Builds: enable preview builds for branches other than `main` if
   needed.

Free plan: 100,000 Worker requests per day. Only `/api/*` runs the Worker
first (`run_worker_first`); whether static asset requests count against that
limit is to verify on the Cloudflare pricing page. A small shop is far below
it either way.

Cloudflare Web Analytics is cookieless and optional: Analytics & Logs, Web
Analytics, add the site. It needs no cookie banner.

## 3. Secrets and variables

Set in Workers & Pages, `racines-en-partage`, Settings, Variables and
Secrets. Saving a secret deploys a new version of the Worker.

| Name                          | Kind             | Value                                                                                                   | Comes from |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| `STRIPE_SECRET_KEY`           | secret           | `sk_test_...` first, then `sk_live_...`                                                                 | Section 8  |
| `STRIPE_WEBHOOK_SECRET`       | secret           | `whsec_...` of the endpoint in the same mode as the key                                                 | Section 8  |
| `RESEND_API_KEY`              | secret, optional | `re_...`                                                                                                | Section 6  |
| `ORDER_EMAIL_TO`              | secret           | `racinesenpartage@gmail.com`                                                                            | Marie      |
| `SITE_URL`                    | variable         | `https://racinesenpartage.fr`                                                                           | Fixed      |
| `ORDER_EMAIL_FROM`            | variable         | `Racines en Partage <commandes@racinesenpartage.fr>` (display name and address, as in `wrangler.jsonc`) | Section 6  |
| `PUBLIC_MONDIAL_RELAY_BRAND`  | build variable   | `BDTEST`, then Marie's client code                                                                      | Section 9  |
| `FORMS_SECRET`                | secret           | 32 random bytes, base64 (`openssl rand -base64 32`)                                                     | Section 13 |
| `TURNSTILE_SECRET_KEY`        | secret           | Secret key of the Turnstile widget; without it the contact and newsletter forms answer 404              | Section 14 |
| `RESEND_AUDIENCE_ID`          | secret, optional | Id of the newsletter audience in Resend                                                                 | Section 15 |
| `GITHUB_TOKEN`                | secret           | Fine-grained token, contents read and write on this repository only                                     | Section 16 |
| `GITHUB_REPO`                 | variable         | `ngawang21/racines-en-partage` (in `wrangler.jsonc`)                                                    | Section 16 |
| `FORMS_DAILY_LIMIT`           | variable         | `60` e-mails a day from the forms (in `wrangler.jsonc`)                                                 | Section 18 |
| `FORMS_KV`                    | KV binding       | Namespace of the daily form budget (in `wrangler.jsonc`)                                                | Section 18 |
| `FORMS_ALLOW_WITHOUT_CAPTCHA` | `.dev.vars` only | `true` skips Turnstile locally; never in the dashboard or `wrangler.jsonc`                              | Section 14 |

Notes:

1. `SITE_URL`, `ORDER_EMAIL_FROM`, `GITHUB_REPO` and `FORMS_DAILY_LIMIT`
   are also declared under `vars` in `wrangler.jsonc`. On each deploy, Wrangler applies the values from the
   file, so change them in the file, not only in the dashboard (to verify
   against the final `wrangler.jsonc`; secrets are never in the file).
2. `PUBLIC_MONDIAL_RELAY_BRAND` is read by Astro at build time. It goes in
   Settings, Builds, Variables and secrets, not in the runtime variables. A
   change needs a new build (Deployments, Retry, or any push).
3. Without `RESEND_API_KEY`, the webhook logs the order summary and still
   answers 200. Marie then relies on Stripe's own receipt and dashboard.
4. Customer e-mails carry the reply-to `racinesenpartage@gmail.com`, so a
   customer who answers reaches Marie's inbox.
5. Local development: copy `.dev.vars.example` to `.dev.vars` (git ignored),
   fill test values, run `pnpm dev:worker`.
6. Rate limiting needs no dashboard step: the three bindings
   `CHECKOUT_LIMITER` (10 requests per minute and IP on `POST /api/checkout`),
   `ORDERS_LIMITER` (30 per minute on `GET /api/orders/:id` and
   `POST /api/orders/lookup`) and `FORMS_LIMITER` (10 per minute on the
   contact, newsletter and review endpoints) are declared under `ratelimits`
   in `wrangler.jsonc` and created on deploy. They are
   free. Over the limit the API answers `429 RATE_LIMITED` with
   `Retry-After: 60` (`worker/README.md`, Rate limiting). The alternative,
   if the bindings are ever unavailable, is a Cloudflare WAF rate limiting
   rule (Security, WAF, Rate limiting rules) on the same paths; without
   either, the Worker simply does not limit.
7. A feature whose secret is missing answers `404 FEATURE_DISABLED` and logs
   `config.missing` with the name: the newsletter without `FORMS_SECRET`,
   `RESEND_API_KEY` or `RESEND_AUDIENCE_ID`; reviews without `FORMS_SECRET`
   or `GITHUB_TOKEN`; the contact form without `ORDER_EMAIL_TO` or
   `RESEND_API_KEY`; the contact and newsletter forms without
   `TURNSTILE_SECRET_KEY` (section 14). The owner's
   switches in the CMS settings act too, after the rebuild that her save
   triggers: `newsletter.enabled` false hides the signup blocks and turns
   the newsletter endpoints off; `reviews.enabled` false hides the reviews,
   turns `POST /api/reviews` off and stops the invitations
   (`catalog.json`, `features`).

## 4. Domain at OVHcloud, DNS at Cloudflare

`racinesenpartage.fr` was available on 2026-11-01, as were
`racines-en-partage.fr` and `racines-en-partage.com`. Registration costs
about 7 to 10 EUR per year.

1. With Marie: create her OVHcloud customer account (her e-mail, her
   business as the account holder).
2. Order `racinesenpartage.fr` from her account. Registrant: her business
   (name, SIREN, address). Technical contact: the developer. Turn on
   automatic renewal with her payment method.
3. Optional, her choice: also register `racines-en-partage.fr` and
   `racines-en-partage.com` and redirect them to the main domain (each about
   the same yearly price; to verify at order time).
4. Cloudflare, Add a domain, `racinesenpartage.fr`, Free plan. Cloudflare
   shows two nameservers.
5. OVHcloud control panel, Web Cloud, Domain names, `racinesenpartage.fr`,
   tab "DNS servers", Modify: replace both OVHcloud nameservers with the two
   Cloudflare ones.
6. DNSSEC, optional: enable it on Cloudflare (DNS, Settings) and paste the DS
   record in the OVHcloud "DNSSEC" tab. If OVHcloud refuses it, leave it off;
   the site works without it.
7. Wait for Cloudflare's e-mail saying the zone is active (usually one hour,
   up to 24 hours).

## 5. Custom domain and www redirect

1. Worker `racines-en-partage`, Settings, Domains & Routes, Add, Custom
   domain: `racinesenpartage.fr`. Repeat for `www.racinesenpartage.fr`.
2. Rules, Redirect rules: redirect `www.racinesenpartage.fr/*` to
   `https://racinesenpartage.fr/${1}`, status 301, preserve the query string.
   Keep one host only: the Stripe success and cancel URLs, the webhook and
   the canonical URLs all use the apex.
3. Check `https://racinesenpartage.fr/` (padlock),
   `https://www.racinesenpartage.fr/boutique/` (redirects to the apex) and
   `https://racinesenpartage.fr/sitemap-index.xml`.
4. Once the custom domain serves the shop and the go-live order has passed
   (section 12), close the `workers.dev` address: until then the whole shop,
   `/api/*` included, also answers on
   `racines-en-partage.<account>.workers.dev`, the Worker accepts that host
   as an origin and sends Stripe customers back to it. Before closing it,
   check that both Stripe webhook endpoints (test and live) use
   `https://racinesenpartage.fr/api/webhooks/stripe` and that the Turnstile
   widget no longer lists the `workers.dev` host. Then add to
   `wrangler.jsonc`, next to `"main"`:

   ```jsonc
   "workers_dev": false,
   // Keep the per-version preview URLs for branch tests (verify they stay on).
   "preview_urls": true,
   ```

   Commit and push (a toggle in the dashboard would be undone by the next
   deploy, which applies `wrangler.jsonc`). Check:
   `curl -sI https://racines-en-partage.<account>.workers.dev/api/health`
   no longer answers 200, and `https://racinesenpartage.fr/api/health` still
   does. Do not set it earlier: phase C of `docs/launch-runbook.md` tests on
   that address before the domain exists.

## 6. Resend: sending domain

Free tier: 3,000 e-mails per month, 100 per day. Each paid order sends two
e-mails (Marie and the customer), so the daily ceiling is about 50 orders.

1. Create a Resend account with `racinesenpartage@gmail.com` (Marie owns
   it; team access for the developer to verify on the free plan).
2. Domains, Add domain: `racinesenpartage.fr` (choose an EU region if
   offered; to verify).
3. Resend lists the DNS records to create (DKIM, SPF, and usually an MX for
   the bounce subdomain). In Cloudflare, DNS, Records, add each one exactly
   as shown. TXT and MX records are never proxied.
4. Add a DMARC record if Resend does not provide one: TXT on `_dmarc` with
   `v=DMARC1; p=none;` to start.
5. Only one SPF record may exist per name. If Resend's SPF lands on the apex
   and collides with Email Routing's (section 7), merge them into one
   `v=spf1 ... ~all` record.
6. Back in Resend, Verify. Status must turn "Verified".
7. API Keys, Create: permission "Sending access", domain
   `racinesenpartage.fr`. Paste it into `RESEND_API_KEY` (section 3).

Sender: `commandes@racinesenpartage.fr`. Reply-to:
`racinesenpartage@gmail.com`.

## 7. Cloudflare Email Routing for contact@

Free. Lets the site show `contact@racinesenpartage.fr` while mail lands in
Marie's Gmail.

1. Cloudflare, `racinesenpartage.fr`, Email, Email Routing, Get started.
2. Destination address: `racinesenpartage@gmail.com`. Marie clicks the
   confirmation link she receives.
3. Custom addresses: `contact@racinesenpartage.fr` to that destination. Add
   `commandes@racinesenpartage.fr` too, so a customer who writes to the
   sender address is not lost.
4. Cloudflare adds its MX and SPF records. Check them against section 6,
   step 5.
5. Ask Marie to add `commandes@racinesenpartage.fr` to her Gmail contacts
   after the first test order, and to mark it "Not spam" if needed.

## 8. Stripe

Pricing (France, standard): 1.5 % + 0.25 EUR per payment with an EEA card,
no monthly fee. Some sources give 1.4 % for non-French EEA cards: to verify on
stripe.com/fr/pricing.

### 8.1 Account (Marie)

1. Marie creates the account at dashboard.stripe.com with her e-mail. Only
   she can activate it: identity, business details (SIREN, legal form),
   IBAN for payouts.
2. Statement descriptor: `RACINES EN PARTAGE` (what customers see on their
   bank statement).
3. She invites the developer: Settings, Team, role Developer.
4. Settings, Branding: medallion logo, brand colour `#163a1c`, accent
   `#e03a3a`. This styles the hosted Checkout page.
5. Settings, Payment methods: cards on; Apple Pay and Google Pay on.
   Methods that confirm later (bank debits) work with the webhook
   (`checkout.session.async_payment_succeeded`) but delay the order e-mail
   until the funds clear. Keep cards and wallets only at launch.
6. Settings, Customer emails: enable receipts for successful payments (and
   for refunds). This is the fallback if Resend fails.

### 8.2 Test mode

1. Switch the dashboard to test mode. Developers, API keys: copy the secret
   key `sk_test_...` into `STRIPE_SECRET_KEY`.
2. Developers, Webhooks (the menu may be called Workbench; to verify), Add
   endpoint:
   - URL: `https://racinesenpartage.fr/api/webhooks/stripe` (before the
     domain is live, use the `workers.dev` URL and change it later)
   - Events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded` and
     `checkout.session.async_payment_failed` (the last one only writes a
     log line, `order.payment_failed`, should a bank debit ever be enabled)
3. Reveal the signing secret `whsec_...` and paste it into
   `STRIPE_WEBHOOK_SECRET`.
4. Test checklist, on the deployed site:
   1. Order two products with Point Relais, card `4242 4242 4242 4242`, any
      future expiry date, any CVC.
   2. The browser lands on `/merci/` with the order number and the relay
      point. The cart is empty.
   3. Stripe, Webhooks, the endpoint: the event shows HTTP 200.
   4. Marie's Gmail receives the order e-mail (French) with lines, totals,
      customer phone and the relay point block (name, address, ID).
   5. The customer address receives its e-mail in the checkout language.
   6. Repeat with "Livraison à domicile" (Stripe asks for the address) and
      with "Retrait" (no address).
   7. Repeat once in English from `/en/`.
   8. Card `4000 0027 6000 3184` (strong authentication) passes after the
      test challenge; card `4000 0000 0000 0002` is declined with a clear
      message on Stripe's page.
   9. "Back" on the Stripe page returns to `/panier/` with the cart intact.
   10. Create a test promo code (section 8.4) and use it once.
   11. Refund the first test payment from the dashboard.
   12. Send-once markers. Every "send once" guard of the Worker (order
       e-mails, review invitations, "already reviewed") is a metadata key
       written on the completed Checkout Session; the tests use a fake
       Stripe, so check it once for real. Take the session id `cs_test_...`
       of the first test order (the `session_id` in the `/merci/` address).
       Workbench (Developers), Logs (menu names to verify): the request
       `POST /v1/checkout/sessions/cs_test_...` answers 200 and its response
       `metadata` holds `"emails_sent": "true"` next to `delivery_method`.
       The same from a terminal with the Stripe CLI:
       `stripe checkout sessions retrieve cs_test_...`. Workers & Pages, the
       Worker, Logs must show no `order.mark_failed` line for that session.
       A 400 on that request, or an `order.mark_failed` line, means Stripe
       refuses the update: stop, nothing is idempotent until it is solved.
       The other markers are checked in section 12, step 16:
       `review_invited` (the invitation run; a refusal logs
       `review.mark_failed` and sends no invitation) and `reviewed_<SKU>`, for
       example `reviewed_REP-MOR-100` (a submitted review; a refusal logs
       `review.mark_failed`, harmless since the review file decides).

### 8.3 Live mode

1. Account activated by Marie (Stripe shows "payments enabled").
2. Live mode, Developers, API keys: copy `sk_live_...` into
   `STRIPE_SECRET_KEY`.
3. Create the live webhook endpoint with the same URL and the same three
   events; paste its own `whsec_...` into `STRIPE_WEBHOOK_SECRET`. Test and
   live endpoints have different secrets.
4. Place one real order with a small product, check section 8.2, step 4, items 2
   to 5, then refund it from the dashboard.

### 8.4 Day to day (Marie, from the dashboard or the Stripe app)

- Orders: Payments. Each payment links to the Checkout session with the
  delivery metadata.
- Promo codes: Product catalogue, Coupons, create a coupon, then a customer
  facing code. The checkout accepts codes (`allow_promotion_codes`). Free
  shipping is decided on the basket before the code: a 50 EUR basket with a
  10 % code still ships free. Codes never reduce the shipping fee itself.
- Refunds: open the payment, Refund, full or partial.

## 9. Mondial Relay

### 9.1 Offre Start (Marie)

"Offre Start" for professionals: no commitment of volume or duration, no
subscription or management fee, prepaid account opened online, up to 5,000
parcels per year. Price from about 3.09 EUR HT per parcel according to the
official page; other pages say 2.76 EUR: to verify at sign-up.

1. Marie opens the Offre Start account online with her business details and
   tops up the prepaid balance.
2. The account gives a client code ("code enseigne").
3. Developer: set the build variable `PUBLIC_MONDIAL_RELAY_BRAND` to that
   code (section 3, note 2) and rebuild. `BDTEST` is a public example code
   for development only; never go live with it.
4. On `/commande/`, choose Point Relais, enter a postcode: the map must list
   relay points. If it shows no result with her code, ask Mondial Relay
   support whether the code needs activating for the Parcel Shop Picker
   widget (to verify).

### 9.2 Labels

The site records the chosen relay point; it does not buy labels. For each
order, Marie creates the label in her Mondial Relay pro space from the order
e-mail: recipient name, phone (Mondial Relay notifies by SMS), relay point
ID, parcel weight. Home delivery labels (Colissimo) are bought separately
from La Poste (prices to verify).

Alternative without a direct contract: Sendcloud (free plan) or Boxtal (pay
per label). The site stays compatible because it only records the relay
point. The widget still needs a valid brand code; how to obtain one without
a Mondial Relay account is to verify.

## 10. Sveltia CMS and its Authenticator

The CMS is the static page `/admin/` (`public/admin/index.html` and
`public/admin/config.yml`). It signs in to GitHub through a small Worker,
the Sveltia CMS Authenticator, deployed in Marie's Cloudflare account.

1. Deploy https://github.com/sveltia/sveltia-cms-auth (Deploy to Cloudflare
   button, or clone and `npx wrangler deploy`). Note the Worker URL, for
   example `https://sveltia-cms-auth.<account>.workers.dev`.
2. GitHub, Settings, Developer settings, OAuth Apps, New OAuth App. Create
   it under Marie's account `racinesenpartage` if it already exists,
   otherwise under the developer's and transfer it at handover:
   - Application name: `Racines en Partage CMS`
   - Homepage URL: any, use `https://racinesenpartage.fr`
   - Authorization callback URL: `<worker url>/callback`
3. Generate a client secret.
4. Authenticator Worker, Settings, Variables and Secrets:
   - `GITHUB_CLIENT_ID`: the client ID
   - `GITHUB_CLIENT_SECRET`: the secret, type Encrypt
   - `ALLOWED_DOMAINS`: `racinesenpartage.fr` (to test the CMS from the
     `workers.dev` host before the domain is live, add that host; list
     syntax to verify in the Authenticator README)
5. In the repository, `public/admin/config.yml`, set
   `backend.base_url: <worker url>`. In `public/_headers`, `/admin/*`
   block, replace `https://*.workers.dev` in `connect-src` and `frame-src`
   with that exact Authenticator origin (a comment in the file marks it):
   any `workers.dev` Worker is allowed until then. Update the table in
   `docs/content.md`, section 7. Commit and push.
6. Open `https://racinesenpartage.fr/admin/`, "Sign in with GitHub".
   Editors need a GitHub account with write access to the repository. The
   interface follows the browser language (French available).
7. Alternative sign-in: a GitHub personal access token with read and write
   access to the repository contents (scope to verify).

Each save in the CMS is a commit on `main`, which triggers a build and a
deploy: the change is live after about 2 minutes.

## 11. CSP

`public/_headers` is the only place the Content-Security-Policy is set
(Cloudflare applies it to the static assets; `astro preview` and
`wrangler dev` ignore it). Three policies exist:

- **Global** (`/*`, every page): `default-src 'self'`, `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'` (Astro scoped styles),
  `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`,
  `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'self'`. No
  inline script runs anywhere: the JSON-LD and the `application/json` data
  blocks are not executed, and a build test fails if any other inline script
  appears.
- **Checkout** (`/commande/*` and `/en/checkout/*`, two identical blocks):
  the global policy plus the Mondial Relay Parcel Shop Picker, which loads
  only when the customer picks the relay method.
- **Admin** (`/admin/*`): the Sveltia CMS policy (below).

Each route block starts with `! Content-Security-Policy`, which detaches the
global header before the route's own is added. Without it Cloudflare sends
both headers and the browser enforces the stricter of the two, so the widget
or the CMS would be blocked.

### 11.1 Checkout hosts

jQuery 2.2.4 and Leaflet 1.9.4 (script, stylesheet and the `images/` folder
the stylesheet references) are copies served from `public/vendor/`, on the
shop's own origin; `public/vendor/README.md` lists their source URLs and
sha384 hashes. Only the Mondial Relay plugin is loaded from a third party.
Hosts captured with `scripts/relay-capture.mjs` (widget 4.0.11, 2026-11-01),
one line per host and directive:

| Host                                                                               | Directives                                          | What                                                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `widget.mondialrelay.com`                                                          | `script-src`, `style-src`, `img-src`, `connect-src` | plugin and its versioned script, styles, marker images, JSONP results |
| `www.mondialrelay.com`                                                             | `img-src`                                           | one image loaded by the widget                                        |
| `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org`, `c.tile.openstreetmap.org` | `img-src`                                           | map tiles                                                             |

No font host: the widget is mounted with `CSS: '0'`, so its theme stylesheet,
which `@import`s Montserrat from Google Fonts (a request carrying the
visitor's IP to Google), never loads; `src/styles/relay-widget.css` styles the
widget instead and loads with it.

The same list is the `REMOTE_HOSTS` constant of `src/cart/relay-widget.ts`;
`tests/build/headers.test.ts` fails when the two checkout blocks of
`_headers` allow a host that constant does not name, or miss one it names.

Every other directive is the global one. The checkout policy has neither
`'unsafe-eval'` nor `'unsafe-inline'` in `script-src`, and no CDN host,
although the widget was written for all three:

- The widget's init appends Leaflet from `unpkg.com` (unversioned) even when
  Leaflet is already loaded, unless a `<script>` or `<link>` in `<head>`
  already carries that exact URL. `preemptWidgetLeaflet` adds two inert
  elements with those URLs (a script of a non-JavaScript type, a link of an
  unknown `rel`), which the browser neither fetches nor runs; the vendored
  Leaflet is the one in use.
- The widget appends server-sent HTML that holds one inline script, which
  jQuery would run through `eval`. `src/cart/relay-widget.ts`
  (`neutraliseGlobalEval`) replaces `jQuery.globalEval` with a function that
  never evaluates and reproduces the two effects of that script natively
  (the `MondialRelayLanguage` labels and the click handler that returns from
  the list to the map on phones).
- The widget's list items carry inline `onclick` attributes, which the CSP
  would block. `disarmInlineHandlers` moves them to `data-rep-onclick` as
  they appear and replays them from one delegated listener through
  `parseInlineHandler` (`src/cart/relay.ts`), which accepts only the known
  shapes `MR_jQuery('#id').trigger('Event', n)` and
  `MR_jQuery(this).parent().find('.x').toggleClass('y')`.

### 11.2 Capture script

`scripts/relay-capture.mjs` serves `dist/` with the headers of
`dist/_headers` applied the way Cloudflare applies them (`astro preview` and
`wrangler dev` ignore that file; the matching code is
`scripts/lib/headers.mjs`, shared with the build test), then drives the
Chromium of `@playwright/test`:

- **checkout**: adds the first product on `/boutique/`, opens `/commande/`,
  picks "Point Relais", searches the postcode (default `95400`), clicks a
  result and checks that a point with an ID of the form `FR-123456` lands in
  the cart;
- **admin**: opens `/admin/` and waits for the "Sign In with GitHub" button.

Each run records every CSP violation (`securitypolicyviolation` events and
"Refused to" console lines) and every third-party host requested, prints one
JSON report per target and exits non-zero unless every step worked with zero
violation.

```sh
pnpm build
node scripts/relay-capture.mjs                    # checkout and admin
node scripts/relay-capture.mjs checkout --postcode 75011
node scripts/relay-capture.mjs admin --headed     # watch the browser
```

It needs the network and the Chromium of `@playwright/test`
(`pnpm exec playwright install chromium` once; on the development machine
`~/.local/lib` is added to `LD_LIBRARY_PATH` automatically). Last run
(2026-11-01): checkout, 7 results for 95400, point `FR-036408` selected,
zero violation, no request to `unpkg.com` or `ajax.googleapis.com`; admin,
sign-in screen reached, zero violation.

When Mondial Relay changes the widget (symptoms: "Refused to load" or
"Refused to execute" errors in the browser console on `/commande/`, a map
that never appears, or list items that no longer select a point), run the
script, then:

1. A new host shows up as a violation and in `hosts`: add it to
   `REMOTE_HOSTS`, to both checkout blocks of `public/_headers` and to the
   table above.
2. A new inline handler shows up as a list item that no longer selects a
   point: read its `data-rep-onclick` value (`--headed`, devtools), extend
   `parseInlineHandler` and its unit tests in
   `tests/unit/cart-relay-api.test.ts`. A changed inline script shows up as
   a `globalEval` call whose code is neither of the two known effects:
   reproduce it in `neutraliseGlobalEval`. A new library URL appended by the
   widget's init shows up as a blocked `unpkg.com` (or other CDN) request:
   vendor the file under `public/vendor/` and add the URL to
   `preemptWidgetLeaflet`, rather than allowing the CDN.
3. Run `pnpm test`, `pnpm test:build` and `pnpm e2e`, deploy, and check the
   map on the live site with the browser console open.

### 11.3 Admin

`/admin/*` replaces the global policy with the Sveltia one: `script-src`
adds `'wasm-unsafe-eval'` and the whole `https://unpkg.com` host, on purpose
(after sign-in Sveltia imports helper packages, image encoders and date
locales, from other unpkg paths; `docs/content.md`, section 7). Only the main
bundle is pinned, by version and Subresource Integrity in
`public/admin/index.html`; the helpers are not. Because the admin shares the
shop origin, Sveltia's GitHub token sits in the same `localStorage` as the
shop pages, so the strict shop CSP is what protects it. `connect-src` adds the GitHub API,
`github.com`, `www.githubstatus.com`, `*.workers.dev` (the Authenticator),
`unpkg.com` and the optional AI helpers of the CMS; `img-src` adds `blob:`
and the GitHub user content hosts; `font-src` adds `cdn.jsdelivr.net`;
`frame-src` adds `*.workers.dev`; `worker-src` allows `blob:`. The same
block sets `X-Robots-Tag: noindex`. `*.workers.dev` is to be narrowed to the
Authenticator host once it is known (section 10, step 5).

### 11.4 After the first deploy

Check that each route carries its own policy:

```sh
curl -sI https://racinesenpartage.fr/commande/ | grep -i content-security-policy
curl -sI https://racinesenpartage.fr/admin/ | grep -i content-security-policy
curl -sI https://racinesenpartage.fr/ | grep -i content-security-policy
```

- `/commande/` must print the checkout policy (with
  `widget.mondialrelay.com`), and only one `content-security-policy` line.
- `/admin/` must print the admin policy (with `api.github.com`), and only
  one line.
- `/` must print the strict policy (`script-src 'self'` and nothing else in
  that directive).

Repeat with `/en/checkout/`. Two lines on one route mean a missing
`! Content-Security-Policy` in its block.

## 12. Go-live checklist

1. `pnpm launch-check` passes: SIRET filled and valid,
   `launch.pricesConfirmed: true`, no `TODO` left in the legal texts, the CMS
   `forms.turnstileSiteKey` filled, `PUBLIC_MONDIAL_RELAY_BRAND` set to
   Marie's code (not `BDTEST`) in the local `.env` (same value as the Workers
   Builds variable; the script says "relay brand unknown" without a `.env`),
   and the `FORMS_KV` binding uncommented in `wrangler.jsonc`.
2. Legal pages read through with Marie: mentions légales, CGV (mediator
   named), confidentialité. See `docs/legal-notes.md`.
3. Test orders in test mode pass (section 8.2), for all three delivery
   methods, FR and EN.
4. Webhook deliveries show 200 in Stripe for every test order.
5. Both e-mails received for every test order; none in junk.
6. A relay label created in Marie's Mondial Relay space from a test order
   e-mail: every field needed is in the e-mail. Stop before paying if the
   parcel is not shipped.
7. Live keys and live webhook in place (section 8.3); one real order paid
   and refunded.
8. `PUBLIC_MONDIAL_RELAY_BRAND` is Marie's code, not `BDTEST`.
9. `curl -sI https://racinesenpartage.fr/ | grep -i content-security-policy`
   prints the strict policy (see section 11.4 for every route); the checkout
   map loads without console errors.
10. Google Search Console, Add property, Domain: `racinesenpartage.fr`;
    verification by a TXT record in Cloudflare DNS.
11. Submit the sitemap `https://racinesenpartage.fr/sitemap-index.xml`, then
    URL inspection and "Request indexing" for `/`, `/boutique/`, `/en/` and
    the four featured product pages.
12. Google Business Profile (business.google.com) for the shop address,
    9 Rue du Marché, 95400 Arnouville: pickup is offered there by
    appointment. If Marie prefers not to publish the address, create a
    service-area profile instead. Website `https://racinesenpartage.fr`,
    phone 07 75 68 91 08, logo and product photos. Verification takes a few
    days.
13. Bing Webmaster Tools: "Import from Google Search Console".
14. Instagram: bio link set to `https://racinesenpartage.fr`, and the
    Instagram URL filled in the CMS settings (`brand.instagram`).
15. Forms: a contact message and a stock alert reach Marie's Gmail with
    the customer as reply-to; a newsletter signup sends the confirmation,
    its link opens `/newsletter/?t=...`, and the button adds the contact
    to the Resend audience; `/ma-commande/` finds a test order by number
    and e-mail; `FORMS_KV` is bound (sections 13 to 18).
16. Reviews: run the cron locally (section 17) against a test order placed
    7 to 10 days earlier (the run lists sessions created between 10 and 7
    days before it, so a fresh order is not listed: keep the first test
    order of section 8.2 for this). The run logs `review.invites` with
    `invited: 1`; the session's metadata then holds `review_invited: "true"`
    (no `review.mark_failed` line); a second run reports `skipped: 1` and
    sends nothing. Open the invitation link, submit a review, check
    `reviewed_<SKU>` on the session and the new file in
    `src/content/reviews/` on GitHub, and publish it from the CMS.
17. After the go-live order: `workers_dev` set to false (section 5, step 4).
18. Commit, push, check the deployment and the CI run.

## 13. Forms secret

`FORMS_SECRET` signs the links of the review invitation and of the
newsletter confirmation (HMAC-SHA256). Generate it once:

```bash
openssl rand -base64 32
```

Paste the output into the secret `FORMS_SECRET` (section 3) and nowhere
else. Changing it invalidates every invitation and confirmation link already
sent; do it only if the value leaked.

## 14. Cloudflare Turnstile

Turnstile protects the contact, stock-alert and newsletter forms against
bots. Free, no cookie banner needed.

1. Cloudflare dashboard, Turnstile, Add widget.
2. Widget name: `racines-en-partage`. Hostnames: `racinesenpartage.fr`
   (add the `*.workers.dev` host too while testing on it).
3. Widget mode: Managed (Cloudflare shows a checkbox only when it doubts).
   Pre-clearance: No.
4. Create. Cloudflare shows a site key and a secret key.
5. The site key is public: paste it in the CMS settings, field
   `forms.turnstileSiteKey` (the Turnstile site key). Saving rebuilds the
   site with the widget.
6. The secret key goes into the Worker secret `TURNSTILE_SECRET_KEY`
   (section 3). Never in the CMS or the repository.

Without the secret the contact, stock-alert and newsletter forms answer
`404 FEATURE_DISABLED` and log `config.missing` (`TURNSTILE_SECRET_KEY`), so
bots cannot spend the Resend quota through an unprotected form. Locally,
`FORMS_ALLOW_WITHOUT_CAPTCHA=true` in `.dev.vars` skips the check; never set
it in the dashboard or in `wrangler.jsonc`. With the secret, a missing or refused token answers
`400 CAPTCHA_FAILED`, and so does a Turnstile outage (the check fails
closed; the customer retries). Both are set or both are empty: an empty
site key in the CMS while `TURNSTILE_SECRET_KEY` is set makes every
contact, stock-alert and newsletter form fail with `400 CAPTCHA_FAILED`,
because the pages render no widget and send no token. Set the secret after
the site key is saved and the site rebuilt; remove the site key only after
deleting the secret.

## 15. Resend audience (newsletter)

The newsletter is double opt-in: the form sends a confirmation e-mail whose
link opens `/newsletter/?t=<token>` (EN `/en/newsletter/?t=`); the contact
is created in Resend only when the person clicks "Confirmer mon
inscription" on that page, which posts the token to
`POST /api/newsletter/confirm`. A mail scanner that opens the link
subscribes nobody.

1. Resend, Audiences (also called Contacts in newer dashboards; to verify),
   Create audience: `Newsletter Racines en Partage`.
2. Copy its id (a UUID) into the secret `RESEND_AUDIENCE_ID` (section 3).
   The API key of section 6 must also allow contacts: "Full access", or a
   key restricted to sending cannot add contacts (to verify on the key
   page; create a second key if needed and use it as `RESEND_API_KEY`).
3. Optional welcome code: Marie creates a promotion code in Stripe
   (Products, Coupons, then a promotion code such as `BIENVENUE10`), then
   types exactly the same code in the CMS settings
   (`newsletter.welcomeCode`) and saves. After the rebuild the confirmation
   e-mail prints it. A code that does not exist in Stripe is refused at
   checkout, so create it first.
4. Campaigns are written in Resend Broadcasts to that audience; Resend adds
   the unsubscribe link (owner guide).

Without `RESEND_AUDIENCE_ID`, or with `newsletter.enabled` off in the CMS,
the newsletter endpoints answer `404 FEATURE_DISABLED`. On the page, an
expired (after 48 hours) or altered link shows the "invalid link" message;
Resend unavailable shows a retry message (clicking again later works).

## 16. GitHub token for reviews

`POST /api/reviews` commits each review as a file in `src/content/reviews/`
with `published: false`; Marie publishes it from the CMS.

The token can write any file of the repository, and every push to `main`
deploys the site: whoever holds it can change the shop. Store it only as
the Worker secret `GITHUB_TOKEN` (never in `.dev.vars` on a shared machine,
a chat or a ticket), rotate it every year, and revoke it at once if it may
have leaked. The Worker itself only writes new files under
`src/content/reviews/`. Narrowing the access later is possible with a
GitHub App installed on this repository only, or with a separate reviews
repository that the build reads.

1. GitHub, signed in as `ngawang21`: Settings, Developer settings, Personal
   access tokens, Fine-grained tokens, Generate new token.
2. Name: `racines-en-partage reviews`. Resource owner: `ngawang21`.
   Expiration: one year (custom date).
3. Repository access: Only select repositories, `racines-en-partage`.
4. Permissions, Repository permissions: Contents, Read and write. Nothing
   else (Metadata read-only is added automatically).
5. Generate, copy the token into the secret `GITHUB_TOKEN` (section 3).
6. Put a calendar reminder two weeks before the expiry date: generate a new
   token the same way, replace the secret, delete the old token.
7. `GITHUB_REPO` is `ngawang21/racines-en-partage` in `wrangler.jsonc`.
   After the transfer to Marie's account (`docs/handover.md`), change it to
   the new owner and create the token from her account.

An expired or revoked token makes review submissions fail with
`502 INTERNAL_ERROR` and the log line `review.github_failed` with status
401; nothing is lost on the customer's side except that submission, and
the invitation link keeps working once the token is replaced.

## 17. Review invitations (cron trigger)

`wrangler.jsonc` declares `"triggers": { "crons": ["0 9 * * *"] }`: every
day at 09:00 UTC (10:00 in winter, 11:00 in summer in Paris) the Worker
lists the Checkout Sessions created between 10 and 7 days earlier (a
session missed by a failed run is retried on the next two days;
`review_invited` prevents a second invitation), sets
`metadata.review_invited = 'true'` on the session and then sends one
invitation per paid order with a customer e-mail. The mark comes first and
fails closed: when Stripe refuses it, the log shows `review.mark_failed`
with the session id and no invitation goes out. A transient e-mail failure
removes the mark again, so the next run retries. The run needs
`STRIPE_SECRET_KEY`, `RESEND_API_KEY` and `FORMS_SECRET`; without
`RESEND_API_KEY` or `FORMS_SECRET` it logs `config.missing` and sends
nothing.

- Check a run: Workers & Pages, the Worker, Settings, Trigger events lists
  the cron; Logs shows `review.invites` with the counts `listed`,
  `invited`, `skipped` and `failed`.
- Test without waiting: `pnpm exec wrangler dev --test-scheduled`, then
  `curl "http://localhost:8787/__scheduled?cron=0+9+*+*+*"` (with test
  keys in `.dev.vars`). The run uses the current time, so it only lists test
  orders placed 7 to 10 days earlier.
- Disable the invitations: Marie turns `reviews.enabled` off in the CMS
  settings; after the rebuild the run logs `review.invites_off` and sends
  nothing, and the review page answers `404 FEATURE_DISABLED`. To stop the
  run itself, remove the `triggers` block from `wrangler.jsonc` and deploy
  (deleting the trigger in the dashboard lasts only until the next deploy).

## 18. Daily form budget (Workers KV)

Resend's free plan sends 100 e-mails a day, and the order e-mails need
them. Turnstile and the per-IP limit stop most abuse; the daily budget is
the last ceiling: each e-mail sent by the contact, stock-alert or
newsletter form increments a counter in KV (`forms:<UTC day>`, kept two
days), and past `FORMS_DAILY_LIMIT` (60 in `wrangler.jsonc`) those forms
answer `429 RATE_LIMITED` until midnight UTC, with the log line
`forms.budget_exhausted`. Order e-mails and review invitations are never
counted. KV counts approximately (a few extra e-mails may pass under
load), which is enough for a ceiling.

1. Create the namespace, in the dashboard (Storage & Databases, KV, Create
   a namespace, name `FORMS_KV`) or with
   `pnpm exec wrangler kv namespace create FORMS_KV`. Copy its id.
2. In `wrangler.jsonc`, uncomment the `kv_namespaces` line and paste the
   id. Commit and push: the deploy binds it. A placeholder id would make
   every deploy fail, which is why the line ships commented.
3. Check: Workers & Pages, the Worker, Bindings lists `FORMS_KV`.

Without the binding no budget applies (tests, before this step). A KV
error lets the form through and logs `forms.budget_unavailable`.

## 19. Customer space ("Mon espace")

`/mon-compte/` (EN `/en/account/`) lets customers see their past orders
without a password. Nothing to set up beyond the forms: `FORMS_SECRET`
signs the sign-in links and the session cookie, `RESEND_API_KEY` sends the
link, Turnstile and the daily budget apply as for the other forms
(sections 13, 14, 18).

- The e-mail "Votre lien de connexion" carries a link valid 15 minutes.
- Opening it sets the cookie `rep_session` (`HttpOnly`, `Secure`,
  `SameSite=Lax`, path `/api/account`, 30 days). It is strictly necessary,
  so it needs no consent banner; the privacy policy names it.
- The orders come from Stripe (the Checkout Sessions of that e-mail).
  Nothing is stored by the shop.
- To sign everybody out at once, change `FORMS_SECRET` (section 13); this
  also voids pending review and newsletter links.

## Troubleshooting

- **Build fails on Cloudflare, passes locally.** Check the build command
  (`pnpm build`), that `pnpm-lock.yaml` is committed, that `.nvmrc` says 22,
  and read the build log for a content validation error (a CMS edit with a
  missing image or an empty price fails the build on purpose). Fix the
  content, push again. The previous version stays online meanwhile.
- **A page returns 404.** The Worker serves `dist/404.html`
  (`not_found_handling: "404-page"`). Check the trailing slash and the
  route table in the spec. A product renamed in the CMS changes its URL.
- **`/api/*` returns 404 or HTML.** `run_worker_first: ["/api/*"]` must be
  in `wrangler.jsonc`, and the deployed Worker must be the one built from
  this repository (Deployments tab).
- **Webhook signature errors (400 `INVALID_SIGNATURE`).** When the Worker
  logs show `config.missing` with `name: "STRIPE_WEBHOOK_SECRET"`, the
  secret is not set at all. Otherwise the `STRIPE_WEBHOOK_SECRET` does not
  belong to this endpoint or this mode (test and live differ), or it was
  pasted with a space. Copy it again from the endpoint page. Then, in
  Stripe, resend the failed events.
- **Webhook 500 `EMAIL_FAILED`.** The owner e-mail could not be sent:
  Worker logs `order.email_refused` (a Resend 4xx: domain not verified,
  wrong `ORDER_EMAIL_TO` or sender) or `order.email_failed` (Resend down),
  with `recipient: "owner"`. The customer e-mail waits for the owner's, so
  nobody receives a confirmation twice. Stripe retries for up to three
  days, then e-mails the account about the failing endpoint. Fix the cause,
  then resend the event from the endpoint page.
- **A customer sees "un prix a changé".** The Worker refused an order
  because the page showed another price than `/catalog.json`
  (`409 PRICE_CHANGED`): a tab opened before a price change, or the minute
  after a deploy while the Worker's catalogue cache refreshes. Reloading the
  page fixes it; nothing was charged.
- **Webhook 200 but no e-mail.** Check `RESEND_API_KEY`, the domain status
  in Resend (Verified), the Resend logs, the 100 per day limit, then
  Gmail's spam folder. Workers & Pages, the Worker, Logs shows the order
  summary when no key is set.
- **E-mails land in junk.** DKIM, SPF and DMARC must all pass: open the
  message in Gmail, "Show original", and read the SPF, DKIM and DMARC
  lines.
- **CMS login loop or "origin not allowed".** `ALLOWED_DOMAINS` does not
  match the host in the address bar, the OAuth callback URL is not
  `<worker url>/callback`, or `base_url` in `public/admin/config.yml`
  points at another Worker. Also check that the GitHub account has write
  access to the repository (after the transfer, to the new owner's).
- **CMS save does not appear on the site.** Check the commit on GitHub,
  then the build in Workers & Pages, Deployments.
- **Redeploy without a change.** Workers & Pages, `racines-en-partage`,
  Deployments, Retry.
