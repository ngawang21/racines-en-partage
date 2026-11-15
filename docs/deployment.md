# Deployment guide

The shop is one Cloudflare Worker. `pnpm build` writes `dist/` (pages,
images, `catalog.json`); `npx wrangler deploy` uploads it as static assets
with the Worker in `worker/`, which answers `/api/*` (checkout, orders,
Stripe webhook, forms, reviews) and runs the daily review invitations.
Workers Builds runs both on every push to `main`. No database: Stripe holds
the orders, `catalog.json` the prices and stock, the repository the content
and reviews, Resend the newsletter contacts.

`docs/launch-runbook.md` is the ordered checklist (who does what, quoted as
"D3", "D8.2"); this file is the step-by-step reference. Ownership and
handover: `docs/handover.md`.

## How to read this guide

- `A > B > C` is a click path; **bold** is the exact label on screen.
- **Who:** Dev is the developer, Marie the owner (needed in person).
- **Check:** how to know the step worked. Do not move on until it passes.
- Labels were checked against each provider's documentation on 2026-11-15.
  "(unverified)" marks a label the docs did not show: trust the screen.
- Cloudflare moves menus often. If a path differs, type the page name
  (for example "Email Routing") in the dashboard search bar at the top.
- Every password, key and backup code goes into the Bitwarden vault.

## Progress

| Section                       | Who        | Status on 2026-11-15                              |
| ----------------------------- | ---------- | ------------------------------------------------- |
| 1. GitHub and CI              | Dev        | Done                                              |
| 2. Cloudflare, Workers Builds | Dev        | Done                                              |
| 3. Secrets                    | Dev        | Start now: `ORDER_EMAIL_TO`, `FORMS_SECRET`       |
| 4. Domain and DNS             | Dev        | 4.1 done (confirm the e-mail); **next: 4.2, 4.3** |
| 5. Custom domain, www         | Dev        | After 4.5                                         |
| 6. Resend                     | Dev        | After 4.5 (account can be opened now)             |
| 7. Email Routing              | Dev, Marie | After 4.5                                         |
| 8. Stripe                     | Marie, Dev | To do                                             |
| 9. Mondial Relay              | Marie, Dev | To do                                             |
| 10. Sveltia CMS               | Dev        | To do                                             |
| 12. Go-live                   | Dev, Marie | Last                                              |
| 13 to 18. Forms, reviews, KV  | Dev        | With section 3                                    |

## 1. GitHub repository and CI

**Who:** Dev. **Status:** done.

The private repository `ngawang21/racines-en-partage` holds `main`; Workers
Builds is connected to it (section 2). It moves to Marie's GitHub account
`racinesenpartage` at handover.

1. Repository > **Actions**: the `ci` workflow passes (install,
   `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:build`, `pnpm e2e`).
2. No branch protection while one developer works on `main` (the CMS also
   commits to `main`).

At handover (`docs/handover.md`, section 2):

1. GitHub: repository > **Settings** > **General** > **Danger Zone** >
   **Transfer** > **Specify an organization or username**: `racinesenpartage`
   > type the repository name > **I understand, transfer this repository**.
2. Cloudflare documents nothing about transfers, so reconnect the build:
   install the Cloudflare GitHub app on `racinesenpartage`
   (`github.com/settings/installations` > **Cloudflare Workers and Pages** >
   **Configure** > **Only select repositories**), then Worker >
   **Settings** > **Builds** > **Disconnect**, and connect again with the
   form of section 2.2. Push a commit and check that the build runs.
3. Change `GITHUB_REPO` in `wrangler.jsonc` (section 16) and `backend.repo`
   in `public/admin/config.yml`.

## 2. Cloudflare account and Workers Builds

**Who:** Dev, on the business Gmail; handed over to Marie at the end
(`docs/launch-runbook.md`, section 0). **Status:** done.

### 2.1 Account

1. `dash.cloudflare.com/sign-up`: `racinesenpartage@gmail.com`, a Bitwarden
   password, verification link in Gmail, plan **Free**. Do not add the
   domain here (section 4).

   Created with "Continue with Google"? There is no Cloudflare password, and
   two-factor needs one: log out, `dash.cloudflare.com/login` > **Forgot
   your password?** > the address > follow the e-mail (up to 20 minutes).
   Sign in with e-mail and password from then on.

2. Two-factor: profile menu (top right) > **My Profile** > **Authentication**
   > **Add** next to **Mobile App Authentication**. Save the setup key and
   > the backup codes in Bitwarden.
3. Account name: **Configurations** > **Account Name** > **Change Name** >
   `Racines en Partage` (unverified).
4. **Workers & Pages** > **Change** next to **Your subdomain** >
   `racinesenpartage`. Test address:
   `https://racines-en-partage.racinesenpartage.workers.dev`.
5. Optional developer seat: **Members** > **Invite members** > the
   developer's own Cloudflare e-mail > scope **All resources** (entire
   account) > role **Administrator** (not "Super Administrator") > **Invite**.
   The invitee turns two-factor on before accepting.

### 2.2 Connect the repository

1. **Workers & Pages** > **Create application** > **GitHub**. On GitHub, app
   "Cloudflare Workers and Pages": account `ngawang21` > **Only select
   repositories** > `racines-en-partage` > **Install & Authorize**. Repository
   missing from Cloudflare's list? `github.com/settings/installations` >
   **Configure** > **Repository access**.
2. Fill the form:

   | Field                            | Value                                   | Why                                                       |
   | -------------------------------- | --------------------------------------- | --------------------------------------------------------- |
   | Project (Worker) name            | `racines-en-partage`                    | Must equal `name` in `wrangler.jsonc`, or the build fails |
   | Build command                    | `pnpm build`                            | Writes `dist/`                                            |
   | Deploy command                   | `npx wrangler deploy` (default)         | Uses the wrangler of `package.json`                       |
   | Preview (non-production) command | default                                 | Preview builds are turned off in step 4                   |
   | Root directory                   | empty or `/`                            |                                                           |
   | Production branch                | `main`                                  |                                                           |
   | API token                        | created automatically                   |                                                           |
   | Build variables                  | `PUBLIC_MONDIAL_RELAY_BRAND` = `BDTEST` | Read by Astro at build time; Marie's code later (9.1)     |

   Leave `NODE_VERSION` and `PNPM_VERSION` unset: the image reads `.nvmrc`
   (22) and `packageManager` (`pnpm@9.15.4`). Runtime secrets go in
   section 3, not here.

3. **Save and Deploy**.
4. Worker > **Settings** > **Build** > **Branch control**: untick **Enable
   Preview Builds**. Leave **Build watch paths** at `*`.

**Check:** the build log shows the pnpm install, `65 page(s) built` and the
`workers.dev` URL. On a phone: home, `/boutique/`, a product page,
`/api/health` (`{"ok":true,...}`). Checkout and forms answer errors until
sections 3, 6 and 8 are done; the relay map works with `BDTEST`.

Build history: Worker > **Deployments** > **View build history**. To
rebuild without a change, push a commit (a retry button on a build may also
exist; unverified).

### 2.3 Free plan

| Limit                | Free plan                                         | The shop                                                                                                                                                                       |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker requests      | 100,000 a day                                     | Only `/api/*` runs the Worker (`run_worker_first`); static assets are free and not counted. Over the limit `/api/*` answers 429.                                               |
| CPU time per request | 10 ms (waiting on Stripe, Resend, GitHub is free) | Not measured yet: during 8.2, read the CPU time of the webhook, checkout and cron calls in Worker > **Observability**. Over it: error 1102, then Workers Paid (5 USD a month). |
| Builds               | 3,000 min a month, one at a time, 20 min max      | One build takes about 3 minutes                                                                                                                                                |
| Cron triggers        | 5 per account                                     | 1                                                                                                                                                                              |

Web Analytics (cookieless, no banner) once the zone is active: **Web
Analytics** > **Add a site** > hostname `racinesenpartage.fr` > **Done** >
**Manage site** > **Enable with JS Snippet installation**. Never the
automatic injection: the site loads the beacon itself under its CSP. Copy
the token from the snippet into the CMS settings,
`analytics.cloudflareToken`.

## 3. Secrets and variables

**Who:** Dev. **Where:** **Workers & Pages** > `racines-en-partage` >
**Settings** > **Variables and Secrets** > **Add** > type **Secret** > name
and value > **Deploy**. Each deploy makes a new Worker version.

Set them as their source becomes ready:

| When              | Names                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Now               | `ORDER_EMAIL_TO`, `FORMS_SECRET` (section 13)                         |
| With section 16   | `GITHUB_TOKEN`                                                        |
| After section 6   | `RESEND_API_KEY`                                                      |
| After section 8.2 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test), live ones in 8.3 |
| After section 14  | `TURNSTILE_SECRET_KEY`, only once the CMS site key is saved           |
| After section 15  | `RESEND_AUDIENCE_ID`                                                  |

| Name                          | Kind             | Value                                                                        | Section |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------- | ------- |
| `STRIPE_SECRET_KEY`           | secret           | `sk_test_...` (sandbox) first, then `sk_live_...`                            | 8       |
| `STRIPE_WEBHOOK_SECRET`       | secret           | `whsec_...` of the destination in the same mode as the key                   | 8       |
| `RESEND_API_KEY`              | secret           | `re_...`, **Full access** (the newsletter adds contacts)                     | 6       |
| `ORDER_EMAIL_TO`              | secret           | `racinesenpartage@gmail.com`                                                 | Marie   |
| `FORMS_SECRET`                | secret           | `openssl rand -base64 32`                                                    | 13      |
| `TURNSTILE_SECRET_KEY`        | secret           | Turnstile secret key; without it the contact and newsletter forms answer 404 | 14      |
| `RESEND_AUDIENCE_ID`          | secret, optional | Id of the newsletter segment in Resend                                       | 15      |
| `GITHUB_TOKEN`                | secret           | Fine-grained token, Contents read and write on this repository only          | 16      |
| `SITE_URL`                    | variable         | `https://racinesenpartage.fr` (in `wrangler.jsonc`)                          | Fixed   |
| `ORDER_EMAIL_FROM`            | variable         | `Racines en Partage <commandes@racinesenpartage.fr>` (in `wrangler.jsonc`)   | 6       |
| `GITHUB_REPO`                 | variable         | `ngawang21/racines-en-partage` (in `wrangler.jsonc`)                         | 16      |
| `FORMS_DAILY_LIMIT`           | variable         | `60` (in `wrangler.jsonc`)                                                   | 18      |
| `FORMS_KV`                    | KV binding       | Daily form budget namespace (in `wrangler.jsonc`)                            | 18      |
| `PUBLIC_MONDIAL_RELAY_BRAND`  | build variable   | `BDTEST`, then Marie's client code                                           | 9       |
| `FORMS_ALLOW_WITHOUT_CAPTCHA` | `.dev.vars` only | `true` skips Turnstile locally; never in the dashboard or `wrangler.jsonc`   | 14      |

**Check:** **Variables and Secrets** lists each name; secrets show no value.

Notes:

1. Variables declared in `wrangler.jsonc` (`SITE_URL`, `ORDER_EMAIL_FROM`,
   `GITHUB_REPO`, `FORMS_DAILY_LIMIT`) are reapplied from the file on every
   deploy: change them in the file, never only in the dashboard. Secrets
   are never in the file.
2. `PUBLIC_MONDIAL_RELAY_BRAND` is a build variable: Worker > **Settings** >
   **Build** > **Build variables and secrets**. A change needs a new build
   (push a commit).
3. Without `RESEND_API_KEY` the webhook logs the order summary and still
   answers 200; Marie then relies on Stripe's receipt and dashboard.
4. Customer e-mails carry the reply-to `racinesenpartage@gmail.com`.
5. Local development: copy `.dev.vars.example` to `.dev.vars` (git
   ignored), fill test values, `pnpm dev:worker`.
6. Rate limiting needs no dashboard step: `CHECKOUT_LIMITER` (10 a minute
   per IP on `POST /api/checkout`), `ORDERS_LIMITER` (30 a minute on
   `GET /api/orders/:id` and `POST /api/orders/lookup`) and `FORMS_LIMITER`
   (10 a minute on contact, newsletter and review endpoints) are declared
   under `ratelimits` in `wrangler.jsonc`, created on deploy, free. Over the
   limit: `429 RATE_LIMITED`, `Retry-After: 60` (`worker/README.md`). If the
   bindings were ever unavailable, the fallback is a zone rule: **Security
   rules** > **Create rule** > **Rate limiting rules** on the same paths.
7. A feature whose secret is missing answers `404 FEATURE_DISABLED` and logs
   `config.missing` with the name: newsletter without `FORMS_SECRET`,
   `RESEND_API_KEY` or `RESEND_AUDIENCE_ID`; reviews without `FORMS_SECRET`
   or `GITHUB_TOKEN`; contact form without `ORDER_EMAIL_TO` or
   `RESEND_API_KEY`; contact and newsletter forms without
   `TURNSTILE_SECRET_KEY`. Marie's CMS switches act too, after the rebuild
   her save triggers: `newsletter.enabled` false hides the signup blocks and
   turns the newsletter endpoints off; `reviews.enabled` false hides the
   reviews, turns `POST /api/reviews` off and stops the invitations.

## 4. Domain at OVHcloud, DNS at Cloudflare

**Who:** Dev (Marie paid). **Order:** 4.2 and 4.3 now, 4.4 once the DS
record is gone, then wait for 4.5. Sections 3 and 6 can go on meanwhile.

State on 2026-11-15: `racinesenpartage.fr` is registered at OVHcloud on
Marie's account (type Entreprise), 3 years for 18.70 EUR TTC, renewal in
November 2029 at 7.79 EUR HT a year. Included options kept: DNSSEC and a
Zimbra Starter mailbox (unused). The domain still uses OVHcloud's servers
(`dns103.ovh.net`, `ns103.ovh.net`) with parking records, and DNSSEC is on
(DS key tag 57304, algorithm 8).

### 4.1 OVHcloud account (done)

1. Type **Entreprise**; legal name and SIRET from the SIRENE register, kept
   as is. Under the VAT exemption (art. 293 B du CGI), tick "My business is
   not registered for VAT": the VAT number OVHcloud shows is only computed
   from the SIREN. In doubt, check it on `ec.europa.eu/taxation_customs/vies`.
2. Two-factor: name (top right) > **Mon compte** > **Sécurité** > **Activer
   la double authentification** > **Application Mobile** > **Suivant** >
   **Afficher le secret** (copy it into Bitwarden) > scan > enter a code.
   Save the 10 backup codes in Bitwarden. At handover: add Marie's app and
   SMS to her number, delete the developer's device (**...** >
   **Supprimer**), regenerate the backup codes.
3. Administrator, technical and billing contacts all stay on this account.
4. Renewal: the domain page already shows **Renewal: Automatic · Every
   year** (first renewal November 2029). It only works with a saved payment
   method: Marie's card under **Payment methods** (**Moyens de paiement**),
   added at the Stripe session.
5. **To do:** the domain page shows "Contact correction: the following email
   address is waiting for your confirmation: racinesenpartage@gmail.com".
   Open the Gmail inbox, find the OVHcloud e-mail (search "OVHcloud",
   check Spam) and click its confirmation link. No e-mail? On the domain
   page, click **Relaunch operation**. An unconfirmed owner address can get
   the domain suspended, so do it before 4.4.

### 4.2 Turn DNSSEC off at OVHcloud

**Why:** OVHcloud changes the nameservers (4.4) only once DNSSEC is off, and
a DS record left at the registry would make the site unreachable for many
visitors after the switch. **Time:** 2 minutes, then up to 24 hours of
waiting. **State on 2026-11-15:** on (DS key tag 57304).

1. `ovh.com/manager` > sign in > **Web Cloud** > **Domains & DNS** >
   `racinesenpartage.fr` > tab **DNS Zone**.
2. The tab shows, in order: **Records** (11 entries), **DNS servers**,
   **Anycast DNS**, then **DNSSEC**: "Zone signing", **Enabled**, "You are
   protected against DNS data tampering.", and below it **DS records**: key
   tag 57304, algorithm 8 (RSASHA256), **Active**.
3. In the **DNSSEC** block, click the **Enabled** switch (or the **...** or
   action next to "Zone signing") and choose to disable it. A window opens:
   confirm.
   - Older layout (French): **Noms de domaine** > `racinesenpartage.fr` >
     **Informations générales** > box **Sécurité** > switch above
     **Délégation sécurisée - DNSSEC**.
4. Change nothing else. Do not buy **Anycast DNS** (Cloudflare replaces
   OVHcloud's DNS), do not edit the **Records**, and do not touch **DNS
   servers** yet (that is 4.4).

**Check, right away:** **DNSSEC** shows **Disabled**, or a pending
operation. The **DS records** entry (key tag 57304) disappears when
OVHcloud has removed it from the registry.

**Check, then every few hours:** this prints nothing (today it prints
`57304 8 2 7909...`).

```sh
dig +short DS racinesenpartage.fr
```

Without a terminal: `dnssec-analyzer.verisignlabs.com/racinesenpartage.fr`
shows no DS record for `racinesenpartage.fr`. Once it is empty, wait **one
more hour** (the `.fr` registry caches the record 3,600 seconds), then go
to 4.4. Meanwhile, do 4.3.

### 4.3 Add the zone in Cloudflare

Can be done at once; the zone simply waits in "pending".

1. **Domains** > **Onboard a domain** > `racinesenpartage.fr` (no `www`).
2. DNS records: choose to **enter them manually** and add **none**. A quick
   scan would import OVHcloud's parking records (A `213.186.33.5` on the
   apex and `www`, MX `mx1`/`mx2`/`mx3.mail.ovh.net`, TXT
   `v=spf1 include:mx.ovh.com -all`, TXT `1|www.racinesenpartage.fr`). They
   block the Worker custom domain (section 5) and Email Routing, which
   refuses to start while foreign MX records exist (error 2008). If the scan
   ran anyway: **DNS** > **Records** > delete every imported record.
3. AI crawler options, if shown: do not block AI crawlers, do not let
   Cloudflare manage `robots.txt` (the site serves its own).
4. Plan **Free** > **Continue**. Copy the two nameservers
   (`<name>.ns.cloudflare.com`) exactly. Skip the SSL/TLS suggestions.

**Check:** the zone shows **Pending Nameserver Update**. A Free zone not
active within 28 days is deleted.

### 4.4 Switch the nameservers at OVHcloud

Only after 4.2's check passes.

1. **Web Cloud** > **Domains & DNS** > `racinesenpartage.fr` > tab **DNS
   Zone** > block **DNS servers** ("Configuration: OVHcloud default
   (internal)", `dns103.ovh.net`, `ns103.ovh.net`) > its edit action
   (**Modify** or **...**; unverified, the new layout is not in OVHcloud's
   guides yet). Older layout: tab **Serveurs DNS** > **Modifier les
   serveurs DNS**.
2. Choose to use your own DNS servers: **Option 2 : Utiliser mes propres
   DNS (ou ceux d'un autre fournisseur DNS)** in the French layout.
3. First DNS server: the first Cloudflare nameserver, associated IP empty >
   **+** > the second one. Remove `dns103.ovh.net` and `ns103.ovh.net` if
   still listed.
4. Apply (**Appliquer la configuration** > check the summary >
   **Appliquer**). Progress shows under the pending operations.

### 4.5 Activation

1. Cloudflare rechecks by itself; the zone **Overview** has a button to
   check now. Usually active within 1 to 2 hours, at most 24; Cloudflare
   e-mails the Gmail inbox.
2. **Check:** the zone shows **Active**, and:

   ```sh
   dig +short NS racinesenpartage.fr   # only the two Cloudflare nameservers
   dig +short DS racinesenpartage.fr   # nothing
   dig +trace racinesenpartage.fr NS +noall +authority +nodnssec | tail -3
   ```

   Stuck in Pending: a mistyped nameserver, an OVHcloud server left in the
   list, or a DS record still published.

### 4.6 DNSSEC through Cloudflare (optional, once active)

1. Cloudflare: **DNS** > **Settings** > card **DNSSEC** > **Enable DNSSEC**.
   The dialog shows the values (later: **DS record** on the same card).
2. OVHcloud: **Noms de domaine** > `racinesenpartage.fr` > tab **DS
   Records** (shown only with external nameservers) > **Ajouter**:

   | OVHcloud field                   | Value from Cloudflare                      |
   | -------------------------------- | ------------------------------------------ |
   | Key Tag                          | Key Tag                                    |
   | Flag                             | Flags, `257`                               |
   | Algorithme                       | Algorithm, `13` (ECDSA P-256 with SHA-256) |
   | Clé publique (encodée en base64) | **Public Key**, not the Digest             |

3. **Valider**. If OVHcloud refuses it, leave DNSSEC off; the site works
   without it.

**Check:** `dig +short DS racinesenpartage.fr` shows the new key tag with
algorithm 13.

### 4.7 Optional extra domains

`racines-en-partage.fr` and `racines-en-partage.com` were free on
2026-11-01. Marie may register them later (about 10 EUR a year each) and
point them at the main domain with a redirect rule (section 5, step 3).

## 5. Custom domain and www redirect

**Who:** Dev. **Needs:** zone Active (4.5). 10 minutes.

1. Apex: **Workers & Pages** > `racines-en-partage` > **Settings** >
   **Domains & Routes** > **Add** > **Custom Domain** >
   `racinesenpartage.fr` > **Add Custom Domain**. Cloudflare creates the DNS
   record and the certificate; the name must have no CNAME, A or AAAA
   record of its own.
2. `www` placeholder record, so the redirect has something to answer on:
   **DNS** > **Records** > **Add record** > Type **A**, Name `www`, IPv4
   `192.0.2.1` (a reserved address, never reached), Proxy status
   **Proxied** > **Save**. `www` is not attached to the Worker.
3. Redirect: **Rules** > **Overview** > **Create rule** > **Redirect Rule**
   (the template "Redirect from WWW to root" fills the same fields):
   - Rule name: `www to apex`
   - When incoming requests match: **Wildcard pattern**, Request URL
     `https://www.racinesenpartage.fr/*`
   - Then: Target URL `https://racinesenpartage.fr/${1}`, Status code
     **301**, **Preserve query string** on
   - **Deploy**
4. **SSL/TLS** > **Edge Certificates** > **Always Use HTTPS**: on
   (sends `http://` to `https://` before the redirect rule).

Only the apex is used: the Stripe return URLs, the webhook and the
canonical URLs all point to it.

**Check:** `https://racinesenpartage.fr/` shows the padlock;
`https://www.racinesenpartage.fr/boutique/?a=1` lands on
`https://racinesenpartage.fr/boutique/?a=1`;
`https://racinesenpartage.fr/sitemap-index.xml` and `/api/health` answer.

5. Later, after the go-live order (section 12, step 17): close the
   `workers.dev` address. Until then the whole shop, `/api/*` included,
   also answers on `racines-en-partage.racinesenpartage.workers.dev`, the
   Worker accepts it as an origin and sends Stripe customers back to it.
   Before closing it, check that both Stripe webhook destinations (sandbox
   and live) use `https://racinesenpartage.fr/api/webhooks/stripe` and that
   the Turnstile widget no longer lists the `workers.dev` host. Then add to
   `wrangler.jsonc`, next to `"main"`:

   ```jsonc
   "workers_dev": false,
   // Keep the per-version preview URLs ("Version URLs" in the dashboard).
   "preview_urls": true,
   ```

   Commit and push (the dashboard toggle would be undone by the next
   deploy). **Check:**
   `curl -sI https://racines-en-partage.racinesenpartage.workers.dev/api/health`
   no longer answers 200; `https://racinesenpartage.fr/api/health` still
   does. Not earlier: phase C of `docs/launch-runbook.md` tests on that
   address before the domain exists.

## 6. Resend: sending domain

**Who:** Dev. **Needs:** zone Active (4.5) for the DNS records; the account
can be opened before. Free plan: 100 e-mails a day, 3,000 a month, 1,000
newsletter contacts. Each order sends two e-mails (Marie and the customer),
so about 50 orders a day.

1. `resend.com/signup` with `racinesenpartage@gmail.com` and a Bitwarden
   password.
2. **Domains** > **Add Domain** > `racinesenpartage.fr` > region
   **eu-west-1 (Ireland)** > leave the Return-Path subdomain at `send` >
   **Add**.
3. DNS records, either way:
   - **Sign in to Cloudflare** on the domain page (Domain Connect) and
     approve; Resend writes the records itself.
   - Or by hand, in Cloudflare **DNS** > **Records** > **Add record**, each
     exactly as Resend shows it, names without the domain, Proxy status
     **DNS only**: TXT `resend._domainkey` (DKIM), MX `send` and TXT `send`
     (SPF `v=spf1 include:amazonses.com ~all`).
4. DMARC (Gmail expects it): **Add record** > TXT, Name `_dmarc`, Content
   `v=DMARC1; p=none;`.
5. Resend > the domain > **Verify DNS Records**.
6. **API Keys** > **Create API Key** > name `racines-en-partage worker` >
   permission **Full access** (a "Sending access" key cannot add newsletter
   contacts) > **Add**. Copy it into `RESEND_API_KEY` (section 3); it is
   shown once.

**Check:** the domain shows **Verified** (usually within 15 minutes; after
72 hours use **Restart verification**).

Resend's SPF lives on `send.racinesenpartage.fr`, Email Routing's on the
apex (section 7): they do not collide. Sender `commandes@racinesenpartage.fr`,
reply-to `racinesenpartage@gmail.com`.

## 7. Cloudflare Email Routing for contact@

**Who:** Dev, Marie clicks one e-mail. **Needs:** zone Active, no OVHcloud
MX left (4.3). Free. The site shows `contact@racinesenpartage.fr`, mail
lands in Marie's Gmail.

1. **Compute** > **Email Service** > **Email Routing** > **Onboard Domain**
   > `racinesenpartage.fr`. Cloudflare adds and locks its records: MX
   > `route1`, `route2`, `route3.mx.cloudflare.net`, TXT
   > `v=spf1 include:_spf.mx.cloudflare.net ~all` on the apex, and a DKIM TXT
   > `cf2024-1._domainkey`.
2. **Destination Addresses** > `racinesenpartage@gmail.com`. Marie clicks
   **Verify** in the e-mail she receives.
3. **Routing Rules** > **Create routing rule** > `contact` @
   `racinesenpartage.fr` > Action **Send to an email** > the Gmail address >
   **Save**. Repeat for `commandes`, so a customer who answers the sender
   address is not lost.
4. After the first test order, Marie adds `commandes@racinesenpartage.fr` to
   her Gmail contacts and marks it "Not spam" if needed.

**Check:** a message from another mailbox to `contact@racinesenpartage.fr`
reaches the Gmail inbox.

## 8. Stripe

Pricing (France, standard): 1.5 % + 0.25 EUR per payment with an EEA card,
2.5 % + 0.25 EUR UK cards, 3.15 % + 0.25 EUR other cards (+2 % if currency
conversion). No monthly fee. Stripe now calls test mode a **sandbox**.

### 8.1 Account (Marie)

**Who:** Marie in person, with the developer. 30 minutes.

1. `dashboard.stripe.com/register` with her e-mail. Only she can activate
   it: identity, business details (SIREN, micro-entreprise), IBAN for
   payouts (any French IBAN, Hello bank included).
2. Statement descriptor (5 to 22 characters): **Settings** > **Business** >
   **Business details** > **Public details** (unverified) >
   `RACINES EN PARTAGE`.
3. Developer access: **Settings** > **Team** > **Add member** > developer's
   e-mail > role **Developer** > **Send invites** (valid 10 days).
4. **Settings** > **Business** > **Branding**: medallion logo, brand colour
   `#163a1c`, accent `#e03a3a` (styles the Checkout page and receipts).
5. **Settings** > **Payments** > **Payment methods** (unverified): cards,
   Apple Pay, Google Pay on; keep bank debits off at launch (they delay the
   order e-mail until funds clear).
6. **Settings** > **Business** > **Customer emails** > **Payments**:
   **Successful payments** and **Refunds** on. This is the fallback if
   Resend fails. Sandbox payments send no automatic receipt.

**Check:** the dashboard home says payments are enabled (or lists what is
still missing).

### 8.2 Sandbox (test)

**Who:** Dev. **Needs:** 8.1 step 3.

1. Account picker (top left) > **Sandboxes** > open the sandbox (create one
   if none).
2. **Developers** > **API keys** > **Secret key** > reveal > copy
   `sk_test_...` into `STRIPE_SECRET_KEY` (section 3).
3. Webhook: **Developers** > **Workbench** > **Webhooks** > **Create an
   event destination** (also labelled **Add destination**):
   - **Your account** > payload **Snapshot** (keep the API version shown)
   - events `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed` (the last only logs
     `order.payment_failed`) > **Continue**
   - **Webhook endpoint** > **Continue** > Endpoint URL
     `https://racinesenpartage.fr/api/webhooks/stripe` (before the domain is
     live, the `workers.dev` URL; change it later) > create
4. On the destination page: **Reveal secret** > copy `whsec_...` into
   `STRIPE_WEBHOOK_SECRET`.
5. Test on the deployed site:
   1. Two products, Point Relais, card `4242 4242 4242 4242`, any future
      date, any CVC.
   2. `/merci/` shows the order number and the relay point; the cart is
      empty.
   3. Workbench > **Webhooks** > the destination > **Event deliveries**:
      HTTP 200.
   4. Marie's Gmail receives the French order e-mail: lines, totals, phone,
      relay block (name, address, ID).
   5. The customer receives its e-mail in the checkout language.
   6. Repeat with "Livraison à domicile" (Stripe asks the address) and
      "Retrait" (no address).
   7. Once in English from `/en/`.
   8. Card `4000 0027 6000 3184` passes after the test challenge; card
      `4000 0000 0000 0002` is declined with a clear message.
   9. "Back" on Stripe's page returns to `/panier/` with the cart intact.
   10. A promo code (8.4) works once.
   11. Refund the first payment (8.4).
   12. Send-once markers (the tests use a fake Stripe, so check once for
       real). Take `cs_test_...` from the `session_id` of the first
       `/merci/` address. Workbench > **Logs** > filter
       `/v1/checkout/sessions` > **Refresh logs**: the
       `POST /v1/checkout/sessions/cs_test_...` request answers 200 and its
       response `metadata` holds `"emails_sent": "true"`. Or with the Stripe
       CLI: `stripe checkout sessions retrieve cs_test_...`. Worker >
       **Observability**: no `order.mark_failed` line for that session. A
       400 or a `order.mark_failed` line means Stripe refuses the update:
       stop, nothing is idempotent until solved. `review_invited` and
       `reviewed_<SKU>` are checked in section 12, step 16.
6. CPU time: Worker > **Observability** > an invocation of the webhook,
   checkout and cron: CPU under 10 ms (section 2.3).

**Check:** every item above passes.

### 8.3 Live mode

**Needs:** account activated by Marie.

1. Leave the sandbox (account picker > the live account).
2. **Developers** > **API keys** > **Create secret key** (code by e-mail or
   SMS) > name `racines-en-partage worker` > copy `sk_live_...` into
   `STRIPE_SECRET_KEY` and Bitwarden: it is shown only once.
3. Same webhook destination as 8.2 step 3 in live mode; its own `whsec_...`
   into `STRIPE_WEBHOOK_SECRET` (sandbox and live secrets differ).
4. One real order of a small product: check 8.2 step 5, items 2 to 5, then
   refund it.

A restricted key (`rk_live_...`) is Stripe's recommended hardening; the
Worker needs Checkout Sessions read and write (create, list, update
metadata). Test it in the sandbox before switching (unverified).

### 8.4 Day to day (Marie, dashboard or Stripe app)

- Orders: **Payments**; each payment links to its Checkout Session and
  delivery metadata.
- Promo codes: **Products** > **Coupons** > **+ New** > percentage or
  amount > **Use customer-facing promotion codes** > the code (options:
  first order only, minimum amount, expiry, uses) > **Create coupon**. Free
  shipping is decided on the basket before the code; codes never reduce the
  shipping fee.
- Refunds: **Payments** > **...** on the payment > **Refund payment** >
  amount and reason > **Refund**. Stripe keeps its fee.

## 9. Mondial Relay

### 9.1 Offre Start (Marie)

**Who:** Marie, with her business details; Dev for step 3.

"Offre Start" for professionals: no volume or duration commitment, no
subscription. Price per parcel, prepaid balance and yearly cap: read them in
the Offre Start CGV at sign-up (the official pages could not be fetched on
2026-11-15; third-party figures are not reliable).

1. Marie opens the Offre Start account on `mondialrelay.fr` (espace
   professionnel) and tops up if asked.
2. She sends the developer her **code client**: the widget's `Brand`
   parameter.
3. Dev: Worker > **Settings** > **Build** > **Build variables and secrets** >
   `PUBLIC_MONDIAL_RELAY_BRAND` = her code > push a commit to rebuild.
   `BDTEST` is the public test code (the widget shows a warning with it);
   never go live with it.

**Check:** `/commande/` > Point Relais > postcode: the map lists relay
points with no test warning. No result with her code: ask Mondial Relay
support to activate it for the Parcel Shop Picker widget.

### 9.2 Labels

The site records the chosen relay point; it does not buy labels. For each
order Marie creates the label in her Mondial Relay pro space from the order
e-mail: recipient name, phone (Mondial Relay texts the customer), relay
point ID, weight. Home delivery labels (Colissimo) come from La Poste.

Without a direct contract, Sendcloud (free plan) or Boxtal (per label) also
work: the site only records the relay point. The widget still needs a valid
`Brand` code.

## 10. Sveltia CMS and its Authenticator

**Who:** Dev. 20 minutes. The CMS is `/admin/` (`public/admin/index.html`,
`public/admin/config.yml`). It signs in to GitHub through a small Worker,
the Sveltia CMS Authenticator, in Marie's Cloudflare account.

1. `github.com/sveltia/sveltia-cms-auth` > **Deploy to Cloudflare Workers**
   (or clone and `pnpm exec wrangler deploy`). Note the URL, for example
   `https://sveltia-cms-auth.racinesenpartage.workers.dev`.
2. GitHub > **Settings** > **Developer settings** > **OAuth Apps** > **New
   OAuth App** (or **Register a new application**). Under `racinesenpartage`
   if that account exists, else under `ngawang21` and transfer it at
   handover:
   - Application name `Racines en Partage CMS`
   - Homepage URL `https://racinesenpartage.fr`
   - Authorization callback URL `<authenticator url>/callback`
   - **Register application** > **Generate a new client secret**.
3. Authenticator Worker > **Settings** > **Variables and Secrets**:
   - `GITHUB_CLIENT_ID` (Text): the client ID
   - `GITHUB_CLIENT_SECRET` (Secret): the secret
   - `ALLOWED_DOMAINS` (Text): `racinesenpartage.fr` while testing add
     `, racines-en-partage.racinesenpartage.workers.dev` (comma separated,
     no port; `*.x` does not match `x` itself)
   - **Deploy**
4. Repository: `public/admin/config.yml` > `backend.base_url:` the
   authenticator URL (no `/callback`). `public/_headers`, `/admin/*` block:
   replace `https://*.workers.dev` in `connect-src` and `frame-src` with that
   exact origin (a comment marks it). Update `docs/content.md`, section 7.
   Commit and push.
5. Open `https://racinesenpartage.fr/admin/` > **Sign In with GitHub**.
   Editors need write access to the repository. The interface follows the
   browser language.

**Check:** a test edit saved in the CMS appears as a commit on `main`, and
on the site after the build (about 2 minutes).

Fallback without the Authenticator: **Sign In with Token** on the login
screen, with a fine-grained token (section 16 steps, permission **Contents:
Read and write**).

At handover: OAuth app > **Transfer ownership** > `racinesenpartage` >
**Transfer this application**; Marie accepts under **OAuth Apps** >
**Pending transfer requests** > **Complete transfer**.

## 11. CSP

Reference, no dashboard step. `public/_headers` is the only place the
Content-Security-Policy is set (Cloudflare applies it to the static assets;
`astro preview` and `wrangler dev` ignore it). Three policies:

- **Global** (`/*`): `default-src 'self'`, `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'` (Astro scoped styles),
  `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`,
  `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'self'`. No
  inline script runs: JSON-LD and `application/json` blocks are not
  executed, and a build test fails on any other inline script.
- **Checkout** (`/commande/*` and `/en/checkout/*`, two identical blocks):
  global plus the Mondial Relay Parcel Shop Picker, loaded only when the
  customer picks the relay method.
- **Admin** (`/admin/*`): the Sveltia CMS policy (11.3).

Each route block starts with `! Content-Security-Policy`, which detaches the
global header first. Without it Cloudflare sends both headers and the
browser enforces the stricter one, blocking the widget or the CMS.

### 11.1 Checkout hosts

jQuery 2.2.4 and Leaflet 1.9.4 (script, stylesheet, `images/`) are copies in
`public/vendor/` on the shop's origin; `public/vendor/README.md` lists their
sources and sha384 hashes. Only the Mondial Relay plugin comes from a third
party. Hosts captured with `scripts/relay-capture.mjs` (widget 4.0.11,
2026-11-01):

| Host                                                                               | Directives                                          | What                                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `widget.mondialrelay.com`                                                          | `script-src`, `style-src`, `img-src`, `connect-src` | plugin, versioned script, styles, markers, JSONP results |
| `www.mondialrelay.com`                                                             | `img-src`                                           | one image                                                |
| `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org`, `c.tile.openstreetmap.org` | `img-src`                                           | map tiles                                                |

No font host: the widget is mounted with `CSS: '0'`, so its theme stylesheet
(which `@import`s Montserrat from Google Fonts) never loads;
`src/styles/relay-widget.css` styles it instead.

The same list is `REMOTE_HOSTS` in `src/cart/relay-widget.ts`;
`tests/build/headers.test.ts` fails when the checkout blocks and that
constant differ.

The checkout policy has neither `'unsafe-eval'` nor `'unsafe-inline'` in
`script-src`, and no CDN host, although the widget expects all three:

- The widget's init appends Leaflet from `unpkg.com` unless a `<script>` or
  `<link>` in `<head>` already carries that exact URL.
  `preemptWidgetLeaflet` adds two inert elements with those URLs (a script
  of a non-JavaScript type, a link of an unknown `rel`), never fetched; the
  vendored Leaflet is used.
- The widget appends server-sent HTML holding one inline script, which
  jQuery would run through `eval`. `neutraliseGlobalEval`
  (`src/cart/relay-widget.ts`) replaces `jQuery.globalEval` with a function
  that never evaluates and reproduces that script's two effects natively
  (the `MondialRelayLanguage` labels and the phone list-to-map handler).
- The list items carry inline `onclick` attributes. `disarmInlineHandlers`
  moves them to `data-rep-onclick` and replays them from one delegated
  listener through `parseInlineHandler` (`src/cart/relay.ts`), which accepts
  only `MR_jQuery('#id').trigger('Event', n)` and
  `MR_jQuery(this).parent().find('.x').toggleClass('y')`.

### 11.2 Capture script

`scripts/relay-capture.mjs` serves `dist/` with `dist/_headers` applied as
Cloudflare does (matching code in `scripts/lib/headers.mjs`, shared with the
build test) and drives the Chromium of `@playwright/test`:

- **checkout**: adds the first product, opens `/commande/`, picks "Point
  Relais", searches the postcode (default `95400`), clicks a result, checks
  that a point `FR-123456` lands in the cart;
- **admin**: opens `/admin/` and waits for "Sign In with GitHub".

It records every CSP violation and third-party host, prints one JSON report
per target and exits non-zero unless every step worked with zero violation.

```sh
pnpm build
node scripts/relay-capture.mjs                    # checkout and admin
node scripts/relay-capture.mjs checkout --postcode 75011
node scripts/relay-capture.mjs admin --headed     # watch the browser
```

Needs the network and Playwright's Chromium
(`pnpm exec playwright install chromium` once; `~/.local/lib` is added to `LD_LIBRARY_PATH` on the
development machine). Last run (2026-11-01): 7 results for 95400, point
`FR-036408` selected, zero violation, no request to `unpkg.com` or
`ajax.googleapis.com`; admin sign-in reached, zero violation.

When Mondial Relay changes the widget ("Refused to load/execute" in the
console on `/commande/`, no map, or list items that no longer select a
point), run the script, then:

1. A new host: add it to `REMOTE_HOSTS`, both checkout blocks of
   `public/_headers` and the table above.
2. A new inline handler (an item no longer selects): read its
   `data-rep-onclick` (`--headed`, devtools), extend `parseInlineHandler`
   and `tests/unit/cart-relay-api.test.ts`. A changed inline script (a
   `globalEval` call that is neither known effect): reproduce it in
   `neutraliseGlobalEval`. A new library URL (a blocked CDN request): vendor
   it under `public/vendor/` and add it to `preemptWidgetLeaflet`.
3. `pnpm test`, `pnpm test:build`, `pnpm e2e`, deploy, check the live map
   with the console open.

### 11.3 Admin

`/admin/*` replaces the global policy: `script-src` adds
`'wasm-unsafe-eval'` and the whole `https://unpkg.com` host on purpose
(after sign-in Sveltia imports helpers, image encoders and date locales
from other unpkg paths; `docs/content.md`, section 7). Only the main bundle
is pinned (version and Subresource Integrity in `public/admin/index.html`).
The admin shares the shop origin, so Sveltia's GitHub token sits in the same
`localStorage`; the strict shop CSP protects it. `connect-src` adds the
GitHub API, `github.com`, `www.githubstatus.com`, `*.workers.dev` (the
Authenticator), `unpkg.com` and the CMS's optional AI helpers; `img-src`
adds `blob:` and GitHub user content; `font-src` adds `cdn.jsdelivr.net`;
`frame-src` adds `*.workers.dev`; `worker-src` allows `blob:`. The block
also sets `X-Robots-Tag: noindex`. Narrow `*.workers.dev` to the
Authenticator host in section 10, step 4.

### 11.4 After the first deploy

```sh
curl -sI https://racinesenpartage.fr/commande/ | grep -i content-security-policy
curl -sI https://racinesenpartage.fr/admin/ | grep -i content-security-policy
curl -sI https://racinesenpartage.fr/ | grep -i content-security-policy
```

**Check:** `/commande/` prints the checkout policy (with
`widget.mondialrelay.com`), `/admin/` the admin policy (with
`api.github.com`), `/` the strict one (`script-src 'self'` only), each on
exactly one line. Repeat with `/en/checkout/`. Two lines on a route mean a
missing `! Content-Security-Policy` in its block.

## 12. Go-live checklist

**Who:** Dev, Marie for steps 2, 6, 7 and 12. Run top to bottom.

1. `pnpm launch-check` passes: SIRET valid, `launch.pricesConfirmed: true`,
   no `TODO` in the legal texts, CMS `forms.turnstileSiteKey` filled,
   `PUBLIC_MONDIAL_RELAY_BRAND` set to Marie's code in the local `.env`
   (same as the build variable), `FORMS_KV` uncommented in `wrangler.jsonc`.
2. Legal pages read with Marie: mentions légales, CGV (mediator named),
   confidentialité (`docs/legal-notes.md`).
3. Sandbox orders pass (8.2) for all three delivery methods, FR and EN.
4. Every webhook delivery shows 200.
5. Both e-mails received for every order; none in junk.
6. A relay label prepared in Marie's Mondial Relay space from a test order
   e-mail: every field is there. Stop before paying.
7. Live keys and live webhook in place (8.3); one real order paid and
   refunded.
8. `PUBLIC_MONDIAL_RELAY_BRAND` is Marie's code, not `BDTEST`.
9. CSP checks of 11.4 pass; the checkout map loads without console errors.
10. Google Search Console (`search.google.com/search-console`) > **Add
    property** > **Domain** > `racinesenpartage.fr`. If Cloudflare is
    offered as provider, **Start verification** and sign in; otherwise copy
    the TXT `google-site-verification=...` into Cloudflare **DNS** >
    **Records** > **Add record** > TXT, Name `@` > back in Search Console
    **Verify**. Keep the record.
11. Search Console > **Sitemaps** > `sitemap-index.xml` > **Submit**; then
    **URL inspection** > **Request indexing** for `/`, `/boutique/`, `/en/`
    and the four featured product pages.
12. Google Business Profile (`business.google.com`, with Marie): 9 Rue du
    Marché, 95400 Arnouville (pickup by appointment), or service area only
    with the address hidden if she prefers. Website
    `https://racinesenpartage.fr`, phone 07 75 68 91 08, logo, product
    photos. Verification: Google chooses (video, phone, e-mail or postcard);
    allow up to 5 business days.
13. Bing Webmaster Tools (`bing.com/webmasters`) > **Import** from Google
    Search Console > sign in to Google > pick the site > **Import**.
14. Instagram bio link `https://racinesenpartage.fr`; CMS settings
    `brand.instagram` filled.
15. Forms: a contact message and a stock alert reach Marie's Gmail with the
    customer as reply-to; a newsletter signup sends the confirmation, its
    link opens `/newsletter/?t=...`, the button adds the contact in Resend
    (**Audience** > **Contacts**); `/ma-commande/` finds a test order by
    number and e-mail; `FORMS_KV` is bound (sections 13 to 18).
16. Reviews: run the cron locally (section 17) against a sandbox order
    placed 7 to 10 days earlier (keep the first order of 8.2 for this). The
    run logs `review.invites` with `invited: 1`; the session's metadata
    holds `review_invited: "true"` (no `review.mark_failed`); a second run
    reports `skipped: 1`. Open the invitation, submit a review, check
    `reviewed_<SKU>` on the session and the new file in
    `src/content/reviews/` on GitHub, publish it from the CMS.
17. After the go-live order: `workers_dev` false (section 5, step 5).
18. Commit, push, check the deployment and the CI run.

## 13. Forms secret

**Who:** Dev. 2 minutes, now.

`FORMS_SECRET` signs the review invitation links, the newsletter
confirmation links, the customer sign-in links and the session cookie
(HMAC-SHA256).

1. `openssl rand -base64 32`
2. Paste the output into the secret `FORMS_SECRET` (section 3) and nowhere
   else.

Changing it voids every link already sent and signs every customer out: do
it only if the value leaked.

## 14. Cloudflare Turnstile

**Who:** Dev. 5 minutes. Protects the contact, stock-alert and newsletter
forms. Free, no cookie banner.

1. **Turnstile** > **Add widget**:
   - Widget name `racines-en-partage`
   - **Hostname management**: `racinesenpartage.fr` (add
     `racines-en-partage.racinesenpartage.workers.dev` while testing there)
   - **Widget mode**: **Managed**
   - **Pre-clearance support**: No
   - **Create**
2. Copy the **site key** into the CMS settings, `forms.turnstileSiteKey`,
   and save (the site rebuilds with the widget).
3. After that rebuild, copy the **secret key** into the Worker secret
   `TURNSTILE_SECRET_KEY` (section 3). Never in the CMS or the repository.

**Check:** the contact form shows the Turnstile box and a test message
arrives.

Both keys are set or both are empty. Secret set but no site key: every
form fails with `400 CAPTCHA_FAILED` (no widget, no token). Site key but no
secret: the forms answer `404 FEATURE_DISABLED` (`config.missing`). So set
the secret after the site key, and remove the site key only after deleting
the secret. A Turnstile outage fails closed (`400 CAPTCHA_FAILED`; the
customer retries). Locally, `FORMS_ALLOW_WITHOUT_CAPTCHA=true` in
`.dev.vars` skips the check.

## 15. Resend newsletter list

**Who:** Dev. **Needs:** section 6, with a **Full access** key.

Resend replaced Audiences with **Segments** (global contacts) in November 2025. The old audience endpoints still work but "will be removed in the
future" (no date). The Worker still calls
`POST /audiences/{id}/contacts` (`worker/email/resend.ts`): moving it to
`POST /contacts` with `segments` is a pending code change. Until then the
signup test in section 12, step 15 must pass with the id below.

Double opt-in: the form sends a confirmation e-mail whose link opens
`/newsletter/?t=<token>` (EN `/en/newsletter/?t=`); the contact is created
only when the person clicks "Confirmer mon inscription" there, so a mail
scanner subscribes nobody.

1. Resend > **Audience** > **Segments** > create the segment
   `Newsletter Racines en Partage`. Copy its id (a UUID) into
   `RESEND_AUDIENCE_ID` (section 3).
2. Optional welcome code: Marie creates a promotion code in Stripe (8.4),
   for example `BIENVENUE10`, then types exactly the same code in the CMS
   settings (`newsletter.welcomeCode`). The confirmation e-mail prints it
   after the rebuild. Create it in Stripe first: an unknown code is refused
   at checkout.
3. Campaigns: **Broadcasts** > **Create broadcast** > segment
   `Newsletter Racines en Partage`. Add the editor's unsubscribe footer, or
   a link to `{{{RESEND_UNSUBSCRIBE_URL}}}`: Resend does not add it on its
   own.

Without `RESEND_AUDIENCE_ID`, or with `newsletter.enabled` off, the
newsletter endpoints answer `404 FEATURE_DISABLED`. An expired (48 hours)
or altered link shows "invalid link"; Resend down shows a retry message.

## 16. GitHub token for reviews

**Who:** Dev. 5 minutes. `POST /api/reviews` commits each review to
`src/content/reviews/` with `published: false`; Marie publishes it in the
CMS.

The token can write any file, and every push to `main` deploys: whoever
holds it can change the shop. Only as the Worker secret `GITHUB_TOKEN`
(never in a chat, a ticket or `.dev.vars` on a shared machine), rotated
yearly, revoked at once if leaked.

1. GitHub as `ngawang21` > profile picture > **Settings** > **Developer
   settings** > **Personal access tokens** > **Fine-grained tokens** >
   **Generate new token**.
2. Token name `racines-en-partage reviews` > **Expiration** custom, one year
   > Resource owner `ngawang21` > **Repository access** **Only select
   > repositories** > `racines-en-partage`.
3. **Permissions** > Repository permissions > **Contents**: **Read and
   write**. Nothing else (Metadata read-only comes with it).
4. **Generate token** > copy into `GITHUB_TOKEN` (section 3).
5. Calendar reminder two weeks before expiry: new token the same way,
   replace the secret, delete the old one.

After the transfer to `racinesenpartage`, set `GITHUB_REPO` to
`racinesenpartage/racines-en-partage` and create the token from her
account.

An expired or revoked token makes submissions fail with
`502 INTERNAL_ERROR` and `review.github_failed` status 401; the invitation
link works again once the token is replaced.

## 17. Review invitations (cron trigger)

No dashboard step: `wrangler.jsonc` declares `"crons": ["0 9 * * *"]`, every
day at 09:00 UTC (10:00 Paris in winter, 11:00 in summer). The run lists the
Checkout Sessions created 10 to 7 days earlier, marks each with
`metadata.review_invited = 'true'`, then sends one invitation per paid order
with an e-mail. The mark comes first and fails closed (`review.mark_failed`,
no invitation); a transient e-mail failure removes it again so the next run
retries. Needs `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `FORMS_SECRET`
(otherwise `config.missing`, nothing sent).

- Schedule: Worker > **Settings** > **Triggers** > **Cron Triggers**.
- Past runs: Worker > **Settings** > **Trigger Events** > **View events**.
  Logs: Worker > **Observability**, `review.invites` with `listed`,
  `invited`, `skipped`, `failed`.
- Test now: `pnpm exec wrangler dev --test-scheduled`, then
  `curl "http://localhost:8787/__scheduled?cron=0+9+*+*+*"` (sandbox keys in
  `.dev.vars`; lists only orders 7 to 10 days old).
- Stop: Marie turns `reviews.enabled` off (the run logs
  `review.invites_off`). To stop the run itself, remove `triggers` from
  `wrangler.jsonc` and deploy (a dashboard deletion lasts until the next
  deploy).

## 18. Daily form budget (Workers KV)

**Who:** Dev. 5 minutes. Resend's free plan sends 100 e-mails a day and the
orders need them. Each e-mail from the contact, stock-alert or newsletter
form increments a KV counter (`forms:<UTC day>`, kept two days); past
`FORMS_DAILY_LIMIT` (60) those forms answer `429 RATE_LIMITED` until
midnight UTC (`forms.budget_exhausted`). Order e-mails and invitations are
never counted.

1. Create the namespace: `pnpm exec wrangler kv namespace create FORMS_KV`
   (or dashboard: **Storage & databases** > **Workers KV** > **Create
   instance** > `FORMS_KV`). Copy the id.
2. `wrangler.jsonc`: uncomment the `kv_namespaces` line, paste the id,
   commit and push. (It ships commented because a placeholder id fails
   every deploy. Do not add the binding in the dashboard: the next deploy
   would remove it.)

**Check:** Worker > **Bindings** lists `FORMS_KV`.

Without the binding no budget applies. A KV error lets the form through and
logs `forms.budget_unavailable`.

## 19. Customer space ("Mon espace")

Nothing to set up. `/mon-compte/` (EN `/en/account/`) shows past orders
without a password: `FORMS_SECRET` signs the sign-in link and the cookie,
`RESEND_API_KEY` sends the link, Turnstile and the daily budget apply.

- "Votre lien de connexion" is valid 15 minutes.
- The cookie `rep_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, path
  `/api/account`, 30 days) is strictly necessary: no consent needed; the
  privacy policy names it.
- Orders come from Stripe; the shop stores nothing.
- Sign everybody out: change `FORMS_SECRET` (also voids pending links).

## Troubleshooting

- **Build fails on Cloudflare, passes locally.** Build command `pnpm build`,
  `pnpm-lock.yaml` committed, `.nvmrc` 22; read the build log
  (**Deployments** > **View build history**) for a content error (a CMS
  edit with a missing image or empty price fails on purpose). Fix, push. The
  previous version stays online.
- **A page returns 404.** The Worker serves `dist/404.html`. Check the
  trailing slash; a product renamed in the CMS changes its URL.
- **`/api/*` returns 404 or HTML.** `run_worker_first: ["/api/*"]` must be
  in `wrangler.jsonc`, and the deployed Worker must come from this
  repository (**Deployments**).
- **Webhook 400 `INVALID_SIGNATURE`.** `config.missing` with
  `STRIPE_WEBHOOK_SECRET` in **Observability**: the secret is not set.
  Otherwise it belongs to another destination or mode, or has a space.
  Copy it again (destination > **Click to reveal**), then **Event
  deliveries** > **Resend** the failed events (up to 15 days).
- **Webhook 500 `EMAIL_FAILED`.** The owner e-mail failed:
  `order.email_refused` (Resend 4xx: domain not verified, wrong
  `ORDER_EMAIL_TO` or sender) or `order.email_failed` (Resend down). The
  customer e-mail waits for the owner's, so nobody gets two. Stripe retries
  for three days. Fix, then resend the event.
- **"Un prix a changé".** `409 PRICE_CHANGED`: the page showed another price
  than `/catalog.json` (old tab, or the minute after a deploy). Reload;
  nothing was charged.
- **Webhook 200 but no e-mail.** `RESEND_API_KEY`, domain **Verified**,
  Resend **Logs**, the 100 a day limit, Gmail spam. Without a key,
  **Observability** shows the order summary.
- **E-mails in junk.** Gmail > the message > **Show original**: SPF, DKIM
  and DMARC must say PASS.
- **Email Routing will not start (error 2008).** Foreign MX records remain:
  delete OVHcloud's MX in **DNS** > **Records**.
- **CMS login loop or "origin not allowed".** `ALLOWED_DOMAINS` does not
  match the address bar host, the callback is not
  `<authenticator url>/callback`, or `base_url` points elsewhere. The
  GitHub account needs write access to the repository.
- **CMS save not on the site.** Commit on GitHub, then the build in
  **Deployments** > **View build history**.
- **Redeploy without a change.** Push an empty commit:
  `git commit --allow-empty -m "chore: redeploy" && git push`.
