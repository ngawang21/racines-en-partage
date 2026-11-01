# Deployment, domain, payments, e-mail

The shop is one Cloudflare Worker. `pnpm build` produces `dist/` (static
pages, images, `catalog.json`); `npx wrangler deploy` uploads `dist/` as
static assets together with the Worker script in `worker/`, which answers
`/api/*` (checkout, order lookup, Stripe webhook). Workers Builds runs both
commands on every push to `main`. There is no database: Stripe holds the
orders, `catalog.json` holds prices and stock, the repository holds the
content.

Everything below is done once, in web interfaces, in the order given. Values
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
   `racinesenpartage@outlook.com`. She sets the password and two-factor
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

| Name                         | Kind             | Value                                                                                                              | Comes from |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| `STRIPE_SECRET_KEY`          | secret           | `sk_test_...` first, then `sk_live_...`                                                                            | Section 8  |
| `STRIPE_WEBHOOK_SECRET`      | secret           | `whsec_...` of the endpoint in the same mode as the key                                                            | Section 8  |
| `RESEND_API_KEY`             | secret, optional | `re_...`                                                                                                           | Section 6  |
| `ORDER_EMAIL_TO`             | secret           | `racinesenpartage@outlook.com`                                                                                     | Marie      |
| `SITE_URL`                   | variable         | `https://racinesenpartage.fr`                                                                                      | Fixed      |
| `ORDER_EMAIL_FROM`           | variable         | `commandes@racinesenpartage.fr` (check in `worker/` whether a display name `Racines en Partage <...>` is expected) | Section 6  |
| `PUBLIC_MONDIAL_RELAY_BRAND` | build variable   | `BDTEST`, then Marie's client code                                                                                 | Section 9  |

Notes:

1. `SITE_URL` and `ORDER_EMAIL_FROM` are also declared under `vars` in
   `wrangler.jsonc`. On each deploy, Wrangler applies the values from the
   file, so change them in the file, not only in the dashboard (to verify
   against the final `wrangler.jsonc`; secrets are never in the file).
2. `PUBLIC_MONDIAL_RELAY_BRAND` is read by Astro at build time. It goes in
   Settings, Builds, Variables and secrets, not in the runtime variables. A
   change needs a new build (Deployments, Retry, or any push).
3. Without `RESEND_API_KEY`, the webhook logs the order summary and still
   answers 200. Marie then relies on Stripe's own receipt and dashboard.
4. Customer e-mails carry the reply-to `racinesenpartage@outlook.com`, so a
   customer who answers reaches Marie's inbox.
5. Local development: copy `.dev.vars.example` to `.dev.vars` (git ignored),
   fill test values, run `pnpm dev:worker`.

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

## 6. Resend: sending domain

Free tier: 3,000 e-mails per month, 100 per day. Each paid order sends two
e-mails (Marie and the customer), so the daily ceiling is about 50 orders.

1. Create a Resend account with `racinesenpartage@outlook.com` (Marie owns
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
`racinesenpartage@outlook.com`.

## 7. Cloudflare Email Routing for contact@

Free. Lets the site show `contact@racinesenpartage.fr` while mail lands in
Marie's Outlook.

1. Cloudflare, `racinesenpartage.fr`, Email, Email Routing, Get started.
2. Destination address: `racinesenpartage@outlook.com`. Marie clicks the
   confirmation link she receives.
3. Custom addresses: `contact@racinesenpartage.fr` to that destination. Add
   `commandes@racinesenpartage.fr` too, so a customer who writes to the
   sender address is not lost.
4. Cloudflare adds its MX and SPF records. Check them against section 6,
   step 5.
5. Ask Marie to add `commandes@racinesenpartage.fr` to her Outlook safe
   senders after the first test order, and to mark it "Not junk" if needed.

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
   - Events: `checkout.session.completed` and
     `checkout.session.async_payment_succeeded`
3. Reveal the signing secret `whsec_...` and paste it into
   `STRIPE_WEBHOOK_SECRET`.
4. Test checklist, on the deployed site:
   1. Order two products with Point Relais, card `4242 4242 4242 4242`, any
      future expiry date, any CVC.
   2. The browser lands on `/merci/` with the order number and the relay
      point. The cart is empty.
   3. Stripe, Webhooks, the endpoint: the event shows HTTP 200.
   4. Marie's Outlook receives the order e-mail (French) with lines, totals,
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

### 8.3 Live mode

1. Account activated by Marie (Stripe shows "payments enabled").
2. Live mode, Developers, API keys: copy `sk_live_...` into
   `STRIPE_SECRET_KEY`.
3. Create the live webhook endpoint with the same URL and the same two
   events; paste its own `whsec_...` into `STRIPE_WEBHOOK_SECRET`. Test and
   live endpoints have different secrets.
4. Place one real order with a small product, check section 8.2, step 4, items 2
   to 5, then refund it from the dashboard.

### 8.4 Day to day (Marie, from the dashboard or the Stripe app)

- Orders: Payments. Each payment links to the Checkout session with the
  delivery metadata.
- Promo codes: Product catalogue, Coupons, create a coupon, then a customer
  facing code. The checkout accepts codes (`allow_promotion_codes`).
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
   `backend.base_url: <worker url>`. Commit and push.
6. Open `https://racinesenpartage.fr/admin/`, "Sign in with GitHub".
   Editors need a GitHub account with write access to the repository. The
   interface follows the browser language (French available).
7. Alternative sign-in: a GitHub personal access token with read and write
   access to the repository contents (scope to verify).

Each save in the CMS is a commit on `main`, which triggers a build and a
deploy: the change is live after about 2 minutes.

## 11. CSP

`public/_headers` keeps the strict policy (`script-src 'self'`,
`connect-src 'self'`) on every route, with two relaxations:

- `/admin/*`: the Sveltia script and the GitHub APIs.
- `/commande/*` and `/en/checkout/*`: the Mondial Relay widget and its
  dependencies (jQuery, Leaflet, map tiles).

Hosts allowed on the checkout routes (captured from the widget's network
requests in headless Chromium; the source of truth is `public/_headers`):

<!-- Filled by the checkout implementer. One line per host and directive. -->

- To be filled.

After any change to the widget or a "refused to load" error in the browser
console on `/commande/`, capture the requests again and update both
`public/_headers` and this list.

## 12. Go-live checklist

1. `pnpm launch-check` passes: SIREN filled, `launch.pricesConfirmed: true`,
   no `TODO` left in the legal texts.
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
   prints the policy; the checkout map loads without console errors.
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
15. Commit, push, check the deployment and the CI run.

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
- **Webhook signature errors (400 `INVALID_SIGNATURE`).** The
  `STRIPE_WEBHOOK_SECRET` does not belong to this endpoint or this mode
  (test and live differ), or it was pasted with a space. Copy it again from
  the endpoint page. Then, in Stripe, resend the failed events.
- **Webhook 200 but no e-mail.** Check `RESEND_API_KEY`, the domain status
  in Resend (Verified), the Resend logs, the 100 per day limit, then
  Outlook's junk folder. Workers & Pages, the Worker, Logs shows the order
  summary when no key is set.
- **E-mails land in junk.** DKIM, SPF and DMARC must all pass: open the
  message source in Outlook and read the `Authentication-Results` header.
- **CMS login loop or "origin not allowed".** `ALLOWED_DOMAINS` does not
  match the host in the address bar, the OAuth callback URL is not
  `<worker url>/callback`, or `base_url` in `public/admin/config.yml`
  points at another Worker. Also check that the GitHub account has write
  access to the repository (after the transfer, to the new owner's).
- **CMS save does not appear on the site.** Check the commit on GitHub,
  then the build in Workers & Pages, Deployments.
- **Redeploy without a change.** Workers & Pages, `racines-en-partage`,
  Deployments, Retry.
