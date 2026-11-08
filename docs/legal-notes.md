# Legal notes

For the developer and future maintainers. This is a working summary of the
French and EU rules that shape the shop, written on 2026-11-01 and updated
on 2026-11-08 (iteration 3: SIRET, price per kilo, reviews, newsletter,
forms, analytics). It is not
legal advice. The owner (Marie, Racines en Partage) is responsible for her
products, labels and legal texts. Anything marked "to verify" was not
confirmed against the official source; check it before relying on it.

## 1. Rules that apply

| Topic                          | Rule                                                                                                                                               | Official source to check                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Legal notice                   | A B2C site shows the publisher's identity, SIREN, address, e-mail, phone, and the host's identity                                                  | Loi n° 2004-575 du 21 juin 2004 (LCEN), on Légifrance (article numbering to verify)                                     |
| Terms of sale                  | A B2C shop publishes CGV: prices TTC, order steps, payment, delivery methods and delays, withdrawal, legal guarantees, mediator, applicable law    | Code de la consommation, pre-contractual information (to verify: art. L111-1 and L221-5)                                |
| Privacy                        | Privacy policy naming the processors and the purposes                                                                                              | Règlement (UE) 2016/679 (RGPD); CNIL guidance on cnil.fr                                                                |
| Right of withdrawal            | 14 days for distance sales                                                                                                                         | Code de la consommation (to verify: art. L221-18)                                                                       |
| Withdrawal exception           | No withdrawal for sealed goods that cannot be returned for hygiene reasons once unsealed after delivery                                            | Code de la consommation, art. L221-28                                                                                   |
| Consumer mediation             | The CGV must name a consumer mediator the customer can refer to for free                                                                           | Code de la consommation (to verify: art. L612-1); list of approved mediators published by the CECMC on economie.gouv.fr |
| Food supplements               | Food supplements are foodstuffs. Framework: directive 2002/46/CE, transposed by décret n° 2006-352                                                 | EUR-Lex for the directive, Légifrance for the décret                                                                    |
| Declaration                    | Marketing a food supplement in France requires a declaration to the DGCCRF, through the online procedure "Téléicare" (current procedure to verify) | economie.gouv.fr/dgccrf                                                                                                 |
| Claims                         | Nutrition and health claims are limited to the EU authorised list, each with its exact wording and conditions of use                               | Règlement (CE) n° 1924/2006; EU Register of nutrition and health claims (on the European Commission food safety site)   |
| General mention                | "À consommer dans le cadre d'une alimentation variée et équilibrée et d'un mode de vie sain. Tenir hors de portée des jeunes enfants."             | Applies to food supplements (décret 2006-352, to verify the exact wording required)                                     |
| Unit price                     | Pre-packaged food sold by weight shows the price per kilogram next to the selling price                                                            | Arrêté du 16 novembre 1999 (prix à l'unité de mesure); code de la consommation, art. L112-1                             |
| E-mail marketing               | Newsletters to individuals need their prior consent and an unsubscribe link in every message                                                       | Code des postes et des communications électroniques, art. L34-5; CNIL guidance on e-mail prospecting                    |
| Online reviews                 | A site that publishes consumer reviews tells readers, near the reviews, whether and how they are checked, their date, order and moderation rules   | Code de la consommation, art. L111-7-2; décret n° 2017-1436 du 29 septembre 2017 (art. D111-16 to D111-19, to verify)   |
| Trackers                       | Reading or writing on the visitor's device needs consent unless strictly necessary; tools that store nothing on the device need none               | Loi Informatique et Libertés, art. 82; CNIL cookies and trackers guidance                                               |
| Food information at a distance | Mandatory food information (ingredients, allergens, net quantity, operator) must be available before the purchase (to verify scope)                | Règlement (UE) n° 1169/2011 (INCO)                                                                                      |

Classification question: the products are sold as culinary powders,
infusions, seeds and cacao. Whether some of them are legally food
supplements (and need the DGCCRF declaration) depends on how they are
presented and dosed. This is an open item for the owner (section 4).

## 2. What the site implements

1. **Legal pages.** `/mentions-legales/`, `/cgv/`, `/confidentialite/` and
   their English twins, written in Markdown in `src/content/legal/` and
   editable in the CMS. Placeholders `{company}`, `{siren}`, `{siret}`,
   `{address}`, `{email}`, `{phone}`, `{host}`, `{vat}` are filled at build
   from the settings.
2. **Launch guard.** `pnpm launch-check` fails while `brand.siret` is not 14
   digits with a valid Luhn checksum, while `launch.pricesConfirmed` is
   false, or while a `TODO` remains in the legal texts (publication director,
   mediator).
3. **VAT wording.** `shop.vat.mode`: `franchise` prints "TVA non applicable,
   art. 293 B du CGI"; `included` shows the 5.5 % rate on documents. The
   owner's status decides; the default is `franchise` until she confirms.
4. **Terms acceptance.** The checkout requires the customer to tick "J'ai lu et j'accepte les CGV"; the API refuses a request
   without `acceptedTerms: true`.
5. **Withdrawal.** The CGV and the FAQ state the 14-day right, the
   exception for opened sealed food products (art. L221-28), and that
   damaged parcels are replaced.
6. **General mention.** Every product page carries the footnote "À
   consommer dans le cadre d'une alimentation variée et équilibrée et d'un
   mode de vie sain. Tenir hors de portée des jeunes enfants."
7. **No claims beyond the labels.** Product texts, translations and SEO
   descriptions add no benefit that is not printed on the label. The English
   translation keeps a culinary tone.
8. **Unverified nutrition hidden.** A product with
   `nutritionVerified: false` shows no nutrition table.
9. **Food information.** Each product page shows ingredients, net weight,
   origin as printed, storage, and the packer (ESAT Les Oliviers). Allergens
   must be emphasised in the ingredients text when present (barley, see
   section 3).
10. **Privacy.** The policy lists the processors: Stripe (payment),
    Cloudflare (hosting, Turnstile, Web Analytics), Resend (order, review
    invitation and newsletter e-mails, newsletter audience), Mondial Relay
    (relay point search and delivery), La Poste, GitHub (content, including
    the customer reviews waiting for moderation). It describes each purpose
    with its legal basis (order, review invitation, reviews, newsletter,
    contact form and stock alert) and its retention period. The cart is
    stored in the browser's localStorage. Whether the cart storage needs no
    consent as strictly necessary is to verify against CNIL guidance (it is
    generally treated as such). Stripe's hosted page sets its own cookies
    under Stripe's responsibility.
11. **SIRET.** The settings hold the SIRET (`brand.siret`, 14 digits,
    911 858 843 00020). The SIREN is derived (its first 9 digits): the legal
    notice prints "SIREN {siren}, SIRET {siret}", the CGV and the privacy
    policy print the SIREN. The SIRET passes the Luhn checksum.
12. **Price per kilo.** Every price on the product page, the product cards
    and the cart lines comes with the unit price ("60,00 €/kg"), computed
    from the price and the net weight. This meets the arrêté du 16 novembre
    1999 and article L112-1 of the code de la consommation, which the first
    version did not.
13. **Newsletter consent.** Signing up is a separate, unticked action in the
    footer (and on the recipes page) with a sentence linking to the privacy
    policy. The address is added to the Resend audience only after the
    person clicks the confirmation link (double opt-in, which also proves
    consent). Every campaign sent from Resend Broadcasts carries an
    unsubscribe link and the sender's identity. No consent is inferred from
    an order.
14. **Reviews.** Only customers who ordered can review: the invitation
    e-mail carries a signed link tied to the order, one review per product
    and per order, and those reviews are marked verified. The owner reads
    every review in the CMS before it is published; she may publish a review
    received another way, which then shows without the verified badge. The
    site states this next to the reviews (the storefront prints the
    moderation sentence of `reviews.moderation` under the review list), with
    the date of each review, newest first, and no reward for reviewing.
    Negative reviews follow the same rule as positive ones: refusing a review
    only because it is critical is a misleading practice (to verify against
    the decree's wording on refusal reasons).
15. **Cookieless analytics and anti-spam.** Cloudflare Web Analytics (when
    `analytics.cloudflareToken` is set) and Cloudflare Turnstile store
    nothing on the visitor's device for tracking, so they need no consent
    banner (to verify against Cloudflare's current documentation when they
    are switched on). The privacy policy names both.

## 3. Label observations

| Product                          | Observation                                                                                                                                                                                                                                                       | What the site does                                                                                                                                                                                                                                                        | Owner action                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Grués de cacao 100 g             | The nutrition table repeats the moringa values (for example 3.0 g fat, implausible for cacao nibs)                                                                                                                                                                | `nutritionVerified: false`, table hidden                                                                                                                                                                                                                                  | Get the correct table from the supplier; reprint the label                                                                             |
| Poudre d'orge grillée 100 g      | Labelled "sans gluten", but barley contains gluten and is a listed allergen                                                                                                                                                                                       | The site must not show "sans gluten": `free_from` for `poudre-d-orge-grillee-100g` must not list `gluten`, and the ingredient text must not repeat the claim (check the seed content before launch)                                                                       | Check with the supplier; correct the label                                                                                             |
| Tubercules de souchet 200 g      | Origin not printed                                                                                                                                                                                                                                                | Niger, given by the owner on 2026-11-08                                                                                                                                                                                                                                   | Print it on the next label                                                                                                             |
| Fleurs d'hibiscus (bissap) 100 g | Origin not printed                                                                                                                                                                                                                                                | Cameroun, given by the owner on 2026-11-08                                                                                                                                                                                                                                | Print it on the next label                                                                                                             |
| Several products                 | Benefit lines on labels ("antioxydant naturel", "contribue à la vitalité", "favorise le transit intestinal", "aide à la digestion", "contribue à maintenir un taux de cholestérol normal", and others) may not match authorised claims or their conditions of use | Removed from the site; only "source de protéines végétales" (moringa, roasted barley) and "riche en fibres" (where a displayed table shows at least 6 g per 100 g) remain. The owner's sheet of 2026-11-08 repeats several of these phrases; the client letter lists them | Review each line against the EU register with the supplier; remove or reword in the CMS (`benefits` field) and on the next label print |

## 4. Open items for the owner

1. Legal form and VAT status (the SIRET was given on 2026-11-08).
2. Choice of a consumer mediator; its name and contact go into the CGV.
3. Validation of the CGV, the legal notice and the privacy policy.
4. Whether the products were declared to the DGCCRF (Téléicare) as food
   supplements or are sold as ordinary foods.
5. Corrected nutrition table for the grués de cacao.
6. Gluten wording on the roasted barley powder.
7. Review of the benefit lines against the authorised claims.
8. Prices of the cacao powder and the cacao nibs (the other prices were
   given on 2026-11-08).

## 5. Sources

- Légifrance (legifrance.gouv.fr): code de la consommation, code de la
  propriété intellectuelle, LCEN, décret n° 2006-352.
- DGCCRF (economie.gouv.fr/dgccrf): food supplements, Téléicare declaration,
  online selling obligations.
- CECMC (economie.gouv.fr): list of approved consumer mediators.
- EUR-Lex (eur-lex.europa.eu): directive 2002/46/CE, règlement (CE)
  n° 1924/2006, règlement (UE) n° 1169/2011, règlement (UE) 2016/679.
- European Commission: EU Register of nutrition and health claims (exact
  URL to verify).
- CNIL (cnil.fr): cookies and trackers guidance.
