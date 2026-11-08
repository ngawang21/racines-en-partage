# Handover

The site is sold to Marie (Racines en Partage). This file lists who holds
each account, how the rest moves to her, the rights assignment, the support
offer and what she can do without a developer. Setup steps for each service
are in `docs/deployment.md`; her day-to-day instructions are in
`docs/guide-proprietaire.md`.

Principle (2026-11-08): every account is opened with the business address
`racinesenpartage@gmail.com`, by the developer, who has access to that
inbox, and configured by him; the GitHub account `racinesenpartage` is
created and the repository transferred to it before Cloudflare is wired, so
nothing is renamed later. Accounts that carry money or legal identity
(Stripe, Mondial Relay, the domain) carry Marie's legal identity from day
one and she completes their identity steps herself. At handover Marie
receives every credential through a shared password vault, changes each
password and moves two-factor authentication to her phone. The ordered
steps are in `docs/launch-runbook.md`.

## 1. Accounts matrix

| Service                                                                  | Holder                               | From day one or transferred                    | Admin                       | Developer access during support                                    |
| ------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| GitHub repository `racines-en-partage`                                   | Marie, account `racinesenpartage`    | Transferred from `ngawang21` before deployment | Marie                       | Collaborator (write)                                               |
| GitHub OAuth App (CMS sign-in)                                           | Marie, account `racinesenpartage`    | Created under her account                      | Marie                       | None needed                                                        |
| Cloudflare (zone, Worker, secrets, Email Routing, Authenticator Worker)  | Marie                                | Day one                                        | Marie (super administrator) | Member, Administrator role (role names to verify)                  |
| OVHcloud (domain `racinesenpartage.fr`)                                  | Marie's business as registrant       | Day one                                        | Marie                       | Technical contact                                                  |
| Stripe                                                                   | Marie                                | Day one (only she can activate it)             | Marie (Owner)               | Developer role                                                     |
| Mondial Relay Offre Start                                                | Marie                                | Day one                                        | Marie                       | None                                                               |
| Resend (sending domain, API key, newsletter audience)                    | Marie (`racinesenpartage@gmail.com`) | Day one                                        | Marie                       | Team member if the free plan allows it (to verify), otherwise none |
| Cloudflare Turnstile widget (contact, newsletter, stock alert forms)     | Marie, in her Cloudflare account     | Day one                                        | Marie                       | Through the Cloudflare membership                                  |
| GitHub fine-grained token `GITHUB_TOKEN` (reviews written by the Worker) | Marie, account `racinesenpartage`    | Created from her account before deployment     | Marie                       | Rotates it during support                                          |
| Gmail `racinesenpartage@gmail.com`                                       | Marie                                | Already hers                                   | Marie                       | None                                                               |
| Google Search Console, Business Profile                                  | Marie                                | Day one                                        | Marie (owner)               | User (full)                                                        |
| Bing Webmaster Tools                                                     | Marie                                | Day one                                        | Marie                       | User                                                               |
| Instagram                                                                | Marie                                | Already hers                                   | Marie                       | None                                                               |

Credentials live in a Bitwarden vault opened on the business address; at
handover Marie takes the master password, changes every account password and
re-enrols two-factor authentication (GitHub, Cloudflare, OVHcloud, Stripe,
Resend) on her phone. During support the developer signs in with his own
seats where the provider offers them (GitHub collaborator, Cloudflare
member, Stripe Developer role) and through the vault elsewhere.

## 2. Transfer steps, in order

The repository, the OAuth App and the reviews token are already under
`racinesenpartage` (runbook phase B), so the handover is a one-hour session:

1. Final payment received; both parties sign the rights assignment
   (section 3).
2. Marie sets the vault's master password; the developer's device is
   removed from the vault.
3. Marie re-enrols two-factor authentication on her phone for GitHub,
   Cloudflare, OVHcloud, Resend and Stripe, prints the recovery codes, and
   changes every account password.
4. Marie signs in to `/admin/` with her account, changes one product text,
   saves, and sees it online about 2 minutes later.
5. Check each row of the matrix: Marie is admin everywhere, auto-renewal of
   the domain is on with her payment method, Stripe payouts go to her IBAN.
6. Developer deletes local copies of secrets (`.dev.vars`) that hold live
   values.
7. Hand over the documents: `docs/guide-proprietaire.md`,
   `docs/client/presentation.md`, `docs/client/couts-et-comptes.md`, this
   file.
8. End of support: Marie removes the developer from GitHub, Cloudflare,
   Stripe, Search Console and Bing, and replaces the technical contact at
   OVHcloud. Section 4 says when.

## 3. Rights assignment letter (template, French)

Replace the bracketed fields. This template was not written by a lawyer;
have it reviewed if the stakes justify it.

---

**Cession de droits d'auteur sur le site Racines en Partage**

Entre :

[Prénom Nom du développeur], [statut, SIREN si applicable], demeurant
[adresse], ci-après « le Cédant »,

et :

[Prénom Nom], exerçant sous le nom commercial Racines en Partage, [forme
juridique], SIREN [numéro], 9 Rue du Marché, 95400 Arnouville, ci-après
« la Cessionnaire ».

**Article 1. Objet.** Le Cédant cède à la Cessionnaire, à titre exclusif,
les droits patrimoniaux d'auteur sur les éléments qu'il a créés pour le site
https://racinesenpartage.fr :

- le code source et la configuration du dépôt `racines-en-partage` (site,
  Worker, scripts, tests, configuration du CMS) ;
- la conception graphique du site (mise en page, styles, composants,
  motifs et illustrations créés pour le site) ;
- les textes rédigés par le Cédant pour le site et sa documentation.

Les photographies et le logo appartiennent déjà à la Cessionnaire et ne sont
pas concernés. Les bibliothèques open source utilisées (Astro, Hono, Stripe,
Sveltia CMS et autres) restent soumises à leurs propres licences.

**Article 2. Droits cédés.** Droits de reproduction, de représentation,
d'adaptation, de modification, de traduction et d'exploitation commerciale,
sur tout support et par tout moyen, notamment en ligne, conformément à
l'article L131-3 du code de la propriété intellectuelle.

**Article 3. Étendue.** Pour le monde entier et pour toute la durée de
protection légale des droits d'auteur.

**Article 4. Prix.** La cession est consentie pour le prix de [montant] euros,
compris dans le prix de la prestation réglé le [date du paiement].

**Article 5. Remise.** Le dépôt de code est transféré au compte GitHub de la
Cessionnaire le [date]. Le Cédant ne conserve aucun droit d'exploitation.
[Option : le Cédant peut citer le site dans ses références, sans en
reproduire le code.]

Fait à [ville], le [date], en deux exemplaires.

Le Cédant | La Cessionnaire

---

## 4. Support

| Period                | What                                 | Price              |
| --------------------- | ------------------------------------ | ------------------ |
| 30 days after go-live | Corrective fixes included            | Included           |
| After that, option A  | Per intervention, quoted before work | [rate to define]   |
| After that, option B  | Small monthly retainer               | [amount to define] |

Included in the 30 days: anything that does not work as described in the
spec (a page, the cart, the checkout, the e-mails, the CMS), a failed
deployment caused by the code, a security update that cannot wait, help on
the first few orders and labels.

Not included: new features, new page types, design changes, content entry,
and outages of third parties (Stripe, Cloudflare, Mondial Relay, Resend).

Retainer (option B), suggested content: dependency and security updates
every quarter, a check of the Stripe API version and the Mondial Relay
widget, one small change per month, a reply within two working days.

## 5. Independence plan

### What Marie does alone, with the owner guide

- Add, edit, hide or delete a product; prices, photos, texts, stock status.
- Edit categories, home, about, FAQ, contact and legal texts.
- Change shipping prices, the free-shipping threshold, the announcement bar,
  pause the shop (`shop.open`).
- Follow orders, refund, create promo codes in Stripe.
- Create Mondial Relay labels from the order e-mail.
- Change her contact details in the CMS settings.
- Publish or refuse customer reviews (CMS, "Avis clients"), answer them.
- Write and send newsletters in Resend Broadcasts to the newsletter audience.
- Answer contact form messages and back-in-stock alerts from her Gmail inbox.

### What needs a developer

- A new delivery method or country, a new page type, any new feature
  (customer accounts, stock counters: see spec section 11 and the iteration 3
  spec, section 3).
- Wording of the order e-mails (templates live in `worker/email/`).
- CSP changes, Stripe API or library upgrades, a broken build that is not a
  content error.
- Domain or DNS changes beyond what `docs/deployment.md` describes.

### How any developer takes over

1. Marie invites them: collaborator on GitHub, member on Cloudflare,
   Developer role on Stripe.
2. Clone, `pnpm install` (Node 22 from `.nvmrc`, pnpm 9), copy
   `.dev.vars.example` to `.dev.vars` with test keys, `pnpm dev` and
   `pnpm dev:worker`.
3. Read `README.md`, `CLAUDE.md`, the spec in `docs/superpowers/specs/`,
   `docs/content.md` and `docs/deployment.md`.
4. Run `pnpm check`, `pnpm test`, `pnpm test:worker`, `pnpm build`,
   `pnpm test:build`, `pnpm e2e` before and after any change.

The stack is standard and documented (Astro, Hono on Cloudflare Workers,
Stripe Checkout, Sveltia CMS). The repository is self-contained: no file
outside it is needed.

## 6. Running costs

| Item                                            | Cost                                                                                       | Paid to                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| Domain `racinesenpartage.fr`                    | 4.99 EUR HT the first year, then 7.79 EUR HT a year (5.99 and 9.35 TTC, seen 2026-11-08)   | OVHcloud                            |
| Extra domains (optional)                        | About the same each, per year (to verify)                                                  | OVHcloud                            |
| Card payments                                   | 1.5 % + 0.25 EUR per EEA card payment (to verify on stripe.com/fr/pricing), no monthly fee | Stripe, deducted from payouts       |
| Mondial Relay labels                            | From about 3 EUR HT per parcel, prepaid; read the Offre Start terms at sign-up             | Mondial Relay                       |
| Colissimo labels                                | Per parcel (to verify)                                                                     | La Poste                            |
| Consumer mediator                               | Depends on the mediator chosen (to verify)                                                 | Mediator                            |
| Hosting, CMS, e-mail sending, e-mail forwarding | 0 EUR at her scale                                                                         | Cloudflare, GitHub, Sveltia, Resend |
| Newsletter audience, Turnstile, Web Analytics   | 0 EUR at her scale (Resend free plan contact and sending limits to verify)                 | Resend, Cloudflare                  |

No monthly software fee. Shipping costs are charged to customers (4.90 EUR
relay, 6.90 EUR home, editable in the CMS). Stripe's fee is not returned on
a refund. The French version for Marie is `docs/client/couts-et-comptes.md`.

## 7. What to do when

The full table is in `docs/guide-proprietaire.md`, section "Que faire si".
It covers at least:

| Situation                 | Where                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| Change a price            | Owner guide, product editing                                           |
| Add a product             | Owner guide, new product                                               |
| Out of stock              | Owner guide, stock status                                              |
| Refund an order           | Owner guide, Stripe refunds                                            |
| Holiday pause             | Owner guide, shop pause                                                |
| The site is down          | Owner guide, "Que faire si"; then the developer                        |
| Change the contact e-mail | Owner guide, settings; Email Routing in `docs/deployment.md` section 7 |
