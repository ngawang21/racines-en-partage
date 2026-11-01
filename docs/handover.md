# Handover

The site is sold to Marie (Racines en Partage). This file lists who holds
each account, how the rest moves to her, the rights assignment, the support
offer and what she can do without a developer. Setup steps for each service
are in `docs/deployment.md`; her day-to-day instructions are in
`docs/guide-proprietaire.md`.

Principle: accounts that carry money, identity or legal ownership (Stripe,
Mondial Relay, the domain, Cloudflare) are opened in Marie's name from day
one. Only the code repository and the CMS sign-in app start on the
developer's side and are transferred at handover.

## 1. Accounts matrix

| Service                                                                 | Holder                                 | From day one or transferred                           | Admin                       | Developer access during support                                    |
| ----------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| GitHub repository `racines-en-partage`                                  | Marie, account `racinesenpartage`      | Transferred from `ngawang21` at handover              | Marie                       | Collaborator (write)                                               |
| GitHub OAuth App (CMS sign-in)                                          | Marie, account `racinesenpartage`      | Created under her account, or transferred at handover | Marie                       | None needed                                                        |
| Cloudflare (zone, Worker, secrets, Email Routing, Authenticator Worker) | Marie                                  | Day one                                               | Marie (super administrator) | Member, Administrator role (role names to verify)                  |
| OVHcloud (domain `racinesenpartage.fr`)                                 | Marie's business as registrant         | Day one                                               | Marie                       | Technical contact                                                  |
| Stripe                                                                  | Marie                                  | Day one (only she can activate it)                    | Marie (Owner)               | Developer role                                                     |
| Mondial Relay Offre Start                                               | Marie                                  | Day one                                               | Marie                       | None                                                               |
| Resend                                                                  | Marie (`racinesenpartage@outlook.com`) | Day one                                               | Marie                       | Team member if the free plan allows it (to verify), otherwise none |
| Outlook `racinesenpartage@outlook.com`                                  | Marie                                  | Already hers                                          | Marie                       | None                                                               |
| Google Search Console, Business Profile                                 | Marie                                  | Day one                                               | Marie (owner)               | User (full)                                                        |
| Bing Webmaster Tools                                                    | Marie                                  | Day one                                               | Marie                       | User                                                               |
| Instagram                                                               | Marie                                  | Already hers                                          | Marie                       | None                                                               |

Passwords are never shared. Each person signs in with their own account and
the access listed above. Marie turns on two-factor authentication on GitHub,
Cloudflare, OVHcloud, Stripe and Resend, with an authenticator app on her
phone.

## 2. Transfer steps, in order

1. Final payment received; both parties sign the rights assignment
   (section 3).
2. Marie creates the GitHub account `racinesenpartage` with
   `racinesenpartage@outlook.com` and enables two-factor authentication.
3. Developer: repository Settings, Danger Zone, Transfer ownership, new
   owner `racinesenpartage`. The repository stays private.
4. Marie accepts the transfer, then invites the developer back as a
   collaborator with write access.
5. Developer: update every reference to the old owner (`backend.repo` in
   `public/admin/config.yml`, `README.md`, `CLAUDE.md`, CI badges if any).
   Commit and push.
6. Cloudflare, Worker `racines-en-partage`, Settings, Builds: reconnect the
   Git repository to `racinesenpartage/racines-en-partage`, authorising the
   Cloudflare GitHub app on Marie's account. Whether the old connection keeps
   working through GitHub's redirect is to verify; reconnect anyway.
7. GitHub OAuth App: if it was created under `ngawang21`, open it, Transfer
   ownership to `racinesenpartage`. Or create a new one under her account and
   replace `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the Authenticator
   Worker.
8. Push a trivial commit and check that the build and deploy run.
9. Marie signs in to `/admin/` with her account, changes one product text,
   saves, and sees it online about 2 minutes later.
10. Check each row of the matrix: Marie is admin everywhere, auto-renewal of
    the domain is on with her payment method, Stripe payouts go to her IBAN.
11. Developer deletes local copies of secrets (`.dev.vars`) that hold live
    values.
12. Hand over the documents: `docs/guide-proprietaire.md`,
    `docs/client/presentation.md`, this file.
13. End of support: Marie removes the developer from GitHub, Cloudflare,
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

### What needs a developer

- A new delivery method or country, a new page type, any new feature
  (customer accounts, stock counters, newsletter: see spec section 11).
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
| Domain `racinesenpartage.fr`                    | About 8 EUR per year (7 to 10)                                                             | OVHcloud                            |
| Extra domains (optional)                        | About the same each, per year (to verify)                                                  | OVHcloud                            |
| Card payments                                   | 1.5 % + 0.25 EUR per EEA card payment (to verify on stripe.com/fr/pricing), no monthly fee | Stripe, deducted from payouts       |
| Mondial Relay labels                            | From about 3.09 EUR HT per parcel (to verify), prepaid                                     | Mondial Relay                       |
| Colissimo labels                                | Per parcel (to verify)                                                                     | La Poste                            |
| Consumer mediator                               | Depends on the mediator chosen (to verify)                                                 | Mediator                            |
| Hosting, CMS, e-mail sending, e-mail forwarding | 0 EUR at her scale                                                                         | Cloudflare, GitHub, Sveltia, Resend |

No monthly software fee. Shipping costs are charged to customers (4.90 EUR
relay, 6.90 EUR home, editable in the CMS).

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
