# Launch runbook

The one ordered list of everything between the repository as it is and a
shop that takes real orders on `https://racinesenpartage.fr`. Each step says
who does it, where, and how to check it. The detailed how-to for each
service stays in `docs/deployment.md` (sections quoted as "D3", "D8.2");
ownership, the rights letter and the support offer are in
`docs/handover.md`; Marie's own copy of the costs and accounts, in French,
is `docs/client/couts-et-comptes.md`.

Figures were checked on 2026-11-08 against providers' public pages and
comparators; "verify" marks a figure to read once more on the provider's
page the day it is used.

## 0. Principles

1. **One identity.** Every account is created with
   `racinesenpartage@gmail.com`, by the developer, who has access to that
   inbox. Marie receives the whole set at handover and changes every
   password herself. Exceptions, where the law or the provider wants the
   owner in person, are marked **Marie** below: Stripe identity check and
   IBAN, the Mondial Relay contract and its payment card, the domain's
   payment method, the Google Business Profile verification, the mediator
   membership.
2. **One vault.** Before the first account, create a Bitwarden account
   (free) on the business Gmail. Every password, every two-factor recovery
   code set and every API key that is not a Worker secret goes in it. At
   handover Marie gets the master password and sets a new one.
3. **Two-factor on everything.** Enrol an authenticator app on the
   developer's phone during setup; at the handover session re-enrol each
   service on Marie's phone (every provider offers "change authenticator
   app") and print the recovery codes for her.
4. **Final names from day one.** The GitHub account `racinesenpartage` is
   created and the repository transferred to it before Cloudflare is wired,
   so nothing points at `ngawang21` later. Stripe, OVHcloud, Mondial Relay
   carry Marie's legal identity from the start.
5. **Test mode until the last step.** Stripe test keys, `BDTEST` relay code
   and the `workers.dev` host until phase 9. Live keys are the last change.

## 1. The stack, and what it costs

| Layer                     | Tool and plan                                      | Fixed cost                                                                      | Limits that matter at Marie's scale                                                                                                                    |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site                      | Astro 7 static build, French and English           | 0                                                                               | none                                                                                                                                                   |
| Hosting, API, cron        | Cloudflare Workers, Free plan, static assets       | 0                                                                               | 100,000 Worker requests a day (only `/api/*` counts; static files are free and unlimited, verify)                                                      |
| Builds and deploys        | Cloudflare Workers Builds, on every push           | 0                                                                               | 3,000 build minutes a month, one build at a time (verify); one build is 2 to 3 minutes                                                                 |
| Code, CI                  | GitHub Free, private repository, Actions           | 0                                                                               | 2,000 Actions minutes a month on private repositories; one CI run is 8 to 10 minutes                                                                   |
| Content editing           | Sveltia CMS at `/admin/` plus its auth Worker      | 0                                                                               | none                                                                                                                                                   |
| Payments                  | Stripe Checkout, standard pricing France           | 0 monthly                                                                       | 1.5 % + 0.25 EUR per EEA card payment; 2.5 % UK cards; 3.25 % other cards (verify)                                                                     |
| Order and form e-mails    | Resend, Free plan, domain `racinesenpartage.fr`    | 0                                                                               | 3,000 e-mails a month, 100 a day, one domain; about 50 orders a day at two e-mails each                                                                |
| Newsletter                | Resend Audiences and Broadcasts, Free plan         | 0                                                                               | about 1,000 contacts on the free plan (verify); Pro is 20 USD a month                                                                                  |
| Anti-bot, analytics, mail | Cloudflare Turnstile, Web Analytics, Email Routing | 0                                                                               | none                                                                                                                                                   |
| Form budget               | Cloudflare Workers KV, Free                        | 0                                                                               | 1,000 writes a day; the forms write one per e-mail                                                                                                     |
| Domain                    | OVHcloud, `.fr`, DNS at Cloudflare                 | 4.99 EUR HT the first year, then 7.79 EUR HT a year (5.99 and 9.35 TTC, verify) | auto-renewal on                                                                                                                                        |
| Relay delivery            | Mondial Relay Offre Start, prepaid                 | 0 monthly on the offer as published (verify)                                    | about 3 EUR HT per label for a small parcel (verify at sign-up)                                                                                        |
| Home delivery             | Colissimo labels bought on laposte.fr              | 0 monthly                                                                       | per parcel, by weight (verify)                                                                                                                         |
| Bank                      | Marie's Hello bank! account                        | her existing fees                                                               | Stripe pays out to any French IBAN; a dedicated pro account is mandatory for a micro-entrepreneur only above 10,000 EUR of turnover two years in a row |
| Consumer mediator         | Chosen from the CECMC list                         | yearly membership, varies by mediator                                           | mandatory for sales to consumers                                                                                                                       |

Yearly cash cost of the site itself: the domain, about 9.35 EUR TTC a year
after the first. Everything else is per sale or per parcel.

## 2. Accounts to create, in order

| #   | Account                                   | Created by           | Identity on the account                         | Two-factor        | Marie needed for                                   |
| --- | ----------------------------------------- | -------------------- | ----------------------------------------------- | ----------------- | -------------------------------------------------- |
| 1   | Bitwarden (vault)                         | Developer            | `racinesenpartage@gmail.com`                    | app               | master password at handover                        |
| 2   | GitHub `racinesenpartage`                 | Developer            | business Gmail                                  | app               | nothing                                            |
| 3   | Cloudflare                                | Developer            | business Gmail                                  | app               | nothing                                            |
| 4   | OVHcloud                                  | Developer            | business Gmail, registrant: her business, SIREN | app or SMS        | payment method for the domain                      |
| 5   | Resend                                    | Developer            | business Gmail                                  | app               | nothing                                            |
| 6   | Stripe                                    | Developer starts     | business Gmail, business: her legal entity      | app or SMS        | identity document, date of birth, IBAN, activation |
| 7   | Mondial Relay Offre Start                 | **Marie**, with help | business Gmail, SIRET, her card for the prepaid | provider's choice | the contract and the top-up                        |
| 8   | Google (Search Console, Business Profile) | Developer            | business Gmail (it is a Google account already) | Google prompts    | Business Profile verification at the shop address  |
| 9   | Bing Webmaster Tools                      | Developer            | Microsoft account on the business Gmail         | app               | nothing                                            |
| 10  | Consumer mediator                         | **Marie**            | her business                                    | n/a               | membership and payment                             |

Already hers: the Gmail, Hello bank!, Instagram. `ngawang21` keeps
collaborator access on GitHub, a member seat on Cloudflare and the
Developer role on Stripe during the support period, and is removed by Marie
at its end (`docs/handover.md`, section 2).

## 3. Phase by phase

Each step: **who**, what, check. Commands run at the repository root.

### Phase A. Preparation (developer, 1 hour)

1. **Dev** Bitwarden: create the account on the business Gmail, enable
   two-factor, create a folder "Racines en Partage". Check: sign in from a
   second device.
2. **Dev** Gmail: check that recovery phone and recovery e-mail on
   `racinesenpartage@gmail.com` are Marie's, and that two-step verification
   is on. Everything below hangs on this inbox.
3. **Dev** Decide the domain with Marie: `racinesenpartage.fr` (the site,
   the Worker vars and the e-mail sender already use it); the `.com` and
   the hyphenated `.fr` are optional redirects.
4. **Dev** Local gates pass: `pnpm check`, `pnpm test`, `pnpm test:worker`,
   `pnpm build`, `pnpm test:build`, `pnpm e2e`.

### Phase B. GitHub under the final owner (developer, 30 minutes)

1. **Dev** Create the GitHub account `racinesenpartage` with the business
   Gmail; two-factor with the authenticator; recovery codes in the vault.
2. **Dev** Signed in as `ngawang21`: repository Settings, Danger Zone,
   Transfer ownership, to `racinesenpartage`. Accept the transfer as
   `racinesenpartage`, keep it private, then Settings, Collaborators, add
   `ngawang21` with Write.
3. **Dev** Update every reference to the old owner, commit, push:

   ```sh
   grep -rn "ngawang21" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
   git remote set-url origin git@github.com:racinesenpartage/racines-en-partage.git
   ```

   Files expected: `wrangler.jsonc` (`GITHUB_REPO`), `public/admin/config.yml`
   (`backend.repo`), `README.md`, `CLAUDE.md`, `docs/deployment.md`,
   `docs/handover.md`.

4. **Dev** Actions tab: the `ci` workflow runs green on the new owner. D1.

### Phase C. Cloudflare account, first deploy, secrets (developer, 1 to 2 hours)

1. **Dev** Create the Cloudflare account with the business Gmail, Free plan,
   two-factor on. Manage account, Members: invite the developer's own
   Cloudflare e-mail as Administrator so day-to-day work does not use the
   owner login. D2.
2. **Dev** Workers & Pages, Create, Import a repository: authorise the
   Cloudflare GitHub app on `racinesenpartage`, choose the repository.
   Worker name `racines-en-partage`, build `pnpm build`, deploy
   `npx wrangler deploy`, root `/`, build variable
   `PUBLIC_MONDIAL_RELAY_BRAND=BDTEST`. D2 step 4.
3. **Dev** Deploy. Check on a phone: home, `/boutique/`, a product page,
   `/api/health` on `racines-en-partage.<account>.workers.dev`.
4. **Dev** Turnstile: Add widget `racines-en-partage`, hostnames
   `racinesenpartage.fr` and the `workers.dev` host, Managed mode. Site key
   into the vault for phase H (it goes in the CMS settings), secret key
   into the Worker secret `TURNSTILE_SECRET_KEY`. D14.
5. **Dev** KV: `pnpm exec wrangler kv namespace create FORMS_KV` (after
   `pnpm exec wrangler login` on the owner account), paste the id into
   `wrangler.jsonc` and uncomment the `kv_namespaces` line, commit, push.
   Check Bindings lists `FORMS_KV`. D18.
6. **Dev** Secrets, Worker Settings, Variables and Secrets (D3), in this
   order:
   - `FORMS_SECRET`: `openssl rand -base64 32`. D13.
   - `ORDER_EMAIL_TO`: `racinesenpartage@gmail.com`.
   - `TURNSTILE_SECRET_KEY`: from step 4.
   - `GITHUB_TOKEN`: fine-grained token created **as `racinesenpartage`**,
     repository `racinesenpartage/racines-en-partage` only, Contents read
     and write, one year; expiry reminder in the vault's note. D16.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: phase F.
   - `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`: phase E.
7. **Dev** Web Analytics: Analytics & Logs, Web Analytics, Add a site
   (hostname `racinesenpartage.fr`), copy the token into the vault for the
   CMS field `analytics.cloudflareToken` (phase H).

### Phase D. Domain and DNS (developer, Marie for the payment, then wait up to 24 hours)

1. **Dev** OVHcloud account with the business Gmail. Account holder and
   registrant: Marie's business (name, SIREN, address). Technical contact:
   the developer.
2. **Marie** Payment method on the OVHcloud account (her card or SEPA
   mandate), or the developer pays and re-invoices. Order
   `racinesenpartage.fr` with automatic renewal. Price seen on 2026-11-08:
   4.99 EUR HT the first year, 7.79 EUR HT a year after (verify). D4.
3. **Dev** Cloudflare, Add a domain, `racinesenpartage.fr`, Free. Copy the
   two nameservers into OVHcloud (Domain names, DNS servers, Modify). Wait
   for Cloudflare's "zone active" e-mail.
4. **Dev** Worker Settings, Domains & Routes: custom domains
   `racinesenpartage.fr` and `www.racinesenpartage.fr`; Redirect rule
   `www` to apex, 301. D5.
5. **Dev** Email Routing: destination `racinesenpartage@gmail.com` (Marie
   or the developer clicks the confirmation in the inbox), custom addresses
   `contact@` and `commandes@`. D7.
6. **Dev** DNSSEC on, DS record pasted at OVHcloud (skip if refused). D4
   step 6.
7. Check:

   ```sh
   curl -sI https://racinesenpartage.fr/ | grep -iE "^(HTTP|content-security-policy)"
   curl -sI https://www.racinesenpartage.fr/boutique/ | grep -iE "^(HTTP|location)"
   curl -s https://racinesenpartage.fr/sitemap-index.xml | head -3
   ```

8. **Dev** Turnstile widget: remove the `workers.dev` hostname once the
   domain answers.

### Phase E. Resend (developer, 30 minutes plus DNS propagation)

1. **Dev** Resend account on the business Gmail, two-factor on.
2. **Dev** Domains, Add `racinesenpartage.fr` (EU region if offered). Create
   each DNS record in Cloudflare exactly as shown, unproxied. Merge SPF
   with Email Routing's if both land on the apex. Add `_dmarc` TXT
   `v=DMARC1; p=none;`. Verify. D6.
3. **Dev** API Keys: one key, Full access (it must also add contacts),
   domain `racinesenpartage.fr`, into the Worker secret `RESEND_API_KEY`.
4. **Dev** Audiences: create `Newsletter Racines en Partage`, id into
   `RESEND_AUDIENCE_ID`. D15.
5. Check: a contact form message from the deployed site reaches the Gmail
   inbox with the customer as reply-to; a newsletter signup sends the
   confirmation, its button adds the contact to the audience. Gmail, Show
   original: SPF, DKIM and DMARC pass.

### Phase F. Stripe (developer starts, Marie activates, 1 hour together)

1. **Dev** Create the Stripe account with the business Gmail. Fill the
   business profile: name Racines en Partage, SIRET 911 858 843 00020,
   address 9 Rue du Marché 95400 Arnouville, website, product description
   (tisanes et poudres végétales). Statement descriptor
   `RACINES EN PARTAGE`. Branding: medallion logo, `#163a1c`, `#e03a3a`.
   Payment methods: cards, Apple Pay, Google Pay. Customer e-mails:
   receipts on. D8.1.
2. **Marie** Activation: her identity document, date of birth, role
   (owner), and the IBAN of her Hello bank! account (app, RIB). Payout
   schedule: weekly is a good default. Stripe deducts 1.5 % + 0.25 EUR per
   EEA card payment before paying out; fees are not returned on a refund
   (verify on stripe.com/fr/pricing).
3. **Dev** Settings, Team: invite the developer as Developer.
4. **Dev** Test mode: `sk_test_` into `STRIPE_SECRET_KEY`; webhook endpoint
   `https://racinesenpartage.fr/api/webhooks/stripe` with the three
   `checkout.session.*` events; `whsec_` into `STRIPE_WEBHOOK_SECRET`.
   D8.2.
5. **Dev** Test checklist D8.2 step 4: three delivery methods, FR and EN,
   3-D Secure card, declined card, back button, promo code, refund. Both
   e-mails received each time, webhook 200.
6. Live keys wait for phase I.

### Phase G. Mondial Relay (Marie, developer for the code, 30 minutes)

1. **Marie** Open the Offre Start account online (professional, SIRET,
   prepaid balance topped up with her card). Comparators on 2026-11-08
   disagree on whether a small monthly fee applies to that offer; read the
   current terms on mondialrelay.fr before signing, and prefer the
   no-subscription version. Per-label price from about 3 EUR HT (verify).
   D9.1.
2. **Dev** Build variable `PUBLIC_MONDIAL_RELAY_BRAND` set to her client
   code, Deployments, Retry. Check: `/commande/`, Point Relais, postcode
   95400 lists relay points.
3. **Marie** Create one label from a test order e-mail (stop before
   paying). Every field needed is in the e-mail. D9.2.

### Phase H. CMS sign-in and owner settings (developer, 1 hour)

1. **Dev** Deploy the Sveltia CMS Authenticator Worker in the owner's
   Cloudflare account. GitHub OAuth App created under `racinesenpartage`
   (callback `<worker url>/callback`). Secrets `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET`, `ALLOWED_DOMAINS=racinesenpartage.fr`. D10.
2. **Dev** `public/admin/config.yml` `backend.base_url`, `public/_headers`
   admin block narrowed to that Worker origin, `docs/content.md` table.
   Commit, push.
3. **Dev** Sign in at `/admin/` as `racinesenpartage`. Settings: Turnstile
   site key (`forms.turnstileSiteKey`), Web Analytics token
   (`analytics.cloudflareToken`), Instagram URL, `newsletter.welcomeCode`
   if Marie wants one (create the matching Stripe promotion code first).
   Save: the rebuild takes about 2 minutes.
4. Check: the contact form shows no visible challenge and sends; the
   Analytics dashboard counts the visit.

### Phase I. Content and legal inputs (Marie, developer enters them)

1. **Marie** The two cacao prices, then `launch.pricesConfirmed: true` in
   the CMS settings.
2. **Marie** Photo of the baobab 200 g pouch; label fixes listed in
   `docs/client/presentation.md`, section 5.
3. **Marie** VAT status, publication director (her name), the mediator's
   name and address once she has joined one. Developer removes the `TODO`s
   in `src/content/legal/`. `docs/legal-notes.md`.
4. **Marie** Reads and approves CGV and privacy policy.
5. **Dev** `pnpm launch-check` passes.

### Phase J. Google, Bing, Instagram (developer, 30 minutes, verification days later)

1. **Dev** Search Console: property type Domain, `racinesenpartage.fr`,
   TXT record in Cloudflare DNS. Submit
   `https://racinesenpartage.fr/sitemap-index.xml`. Request indexing for
   `/`, `/boutique/`, `/en/` and the featured products. D12 steps 10 and 11.
2. **Dev** Google Business Profile for 9 Rue du Marché, 95400 Arnouville
   (pickup by appointment), or a service-area profile if Marie prefers not
   to show the address. **Marie** completes the verification Google asks
   for (video of the premises or a postcard). D12 step 12.
3. **Dev** Bing Webmaster Tools, Import from Google Search Console.
4. **Marie** Instagram bio link to the site.
5. Analytics is Cloudflare Web Analytics, cookieless, so no Google
   Analytics and no cookie banner.

### Phase K. Go-live (developer and Marie, 1 hour)

1. **Dev** Run `docs/deployment.md` section 12 top to bottom.
2. **Dev** Live Stripe keys and the live webhook endpoint into the Worker
   secrets. D8.3.
3. **Marie** One real order with the cheapest product, paid with her own
   card; both e-mails arrive; **Dev** refunds it from the dashboard.
4. **Dev** Review flow once against a test order:
   `pnpm exec wrangler dev --test-scheduled` and the `__scheduled` curl of
   D17, the invitation link, a review, the file in
   `src/content/reviews/`, publication from the CMS.
5. **Dev** Lighthouse mobile on the live home, shop, product and cart
   pages (target 95 on each category) and a real-phone walk of the
   purchase flow.
6. **Dev** Reminders in the vault's notes: `GITHUB_TOKEN` expiry, domain
   renewal date, the quarterly dependency update.

### Phase L. Handover session (Marie and developer, 1 hour, after the final payment)

1. Rights assignment signed (`docs/handover.md`, section 3).
2. Bitwarden: Marie sets the master password; the developer's device is
   removed.
3. Two-factor re-enrolled on Marie's phone for GitHub, Cloudflare,
   OVHcloud, Resend, Stripe; recovery codes printed and kept with her
   papers.
4. Marie changes the password of every account in the table of section 2.
5. Marie signs in to `/admin/`, edits a product text, sees it live.
6. Hand over `docs/guide-proprietaire.md`, `docs/client/presentation.md`,
   `docs/client/couts-et-comptes.md`, `docs/handover.md`.
7. Support starts: 30 days of corrective fixes included (`docs/handover.md`,
   section 4).

## 4. Secrets and where each comes from

| Worker secret or variable       | Phase  | Source                                   |
| ------------------------------- | ------ | ---------------------------------------- |
| `FORMS_SECRET`                  | C6     | `openssl rand -base64 32`                |
| `ORDER_EMAIL_TO`                | C6     | the business Gmail                       |
| `TURNSTILE_SECRET_KEY`          | C4     | Turnstile widget                         |
| `GITHUB_TOKEN`                  | C6     | fine-grained token of `racinesenpartage` |
| `FORMS_KV` binding              | C5     | KV namespace id in `wrangler.jsonc`      |
| `RESEND_API_KEY`                | E3     | Resend API key, full access              |
| `RESEND_AUDIENCE_ID`            | E4     | Resend audience                          |
| `STRIPE_SECRET_KEY`             | F4, K2 | Stripe, test then live                   |
| `STRIPE_WEBHOOK_SECRET`         | F4, K2 | Stripe endpoint, test then live          |
| `PUBLIC_MONDIAL_RELAY_BRAND`    | C2, G2 | build variable, `BDTEST` then her code   |
| CMS `forms.turnstileSiteKey`    | H3     | Turnstile widget, public key             |
| CMS `analytics.cloudflareToken` | H3     | Web Analytics site token                 |

The full table with kinds and notes is D3.

## 5. Order of operations, compressed

A vault, B GitHub owner, C Cloudflare and first deploy, D domain, E Resend,
F Stripe test, G Mondial Relay, H CMS and settings, I content and legal, J
Google, K live, L handover. D can start right after A (the registration and
the nameserver change only need the OVHcloud and Cloudflare accounts) so the
DNS wait overlaps with C and E.
