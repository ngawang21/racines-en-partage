# Client feedback of 2026-11-23: master plan

Source: `thinking/rachines-en-partage/data/Retours - Site internet Racines en Partage.pdf`
(4 pages, text plus three annotated screenshots: the 200 g chip of the
baobab card circled, the contact address card with its Google Maps link
boxed, the cart notice "Point Relais, domicile ou retrait gratuit à
Arnouville").

## 0. What Marie keeps (no change, protect from regression)

Visuals and palette, the favicon flower, FR/EN, typography, featured
products on the home page, the origins map, the ritual band, the shop
filters and sort, the customer space.

## 1. Intent behind the feedback

1. **The address is not a place to visit.** 9 Rue du Marché, Arnouville is a
   registered address for paperwork. Nothing customer-facing may suggest a
   shop or a pickup there. "Arnouville" becomes "France" or "Val-d'Oise".
2. **Two ways to receive an order, no more.** Mondial Relay point relais
   (paid, free from 49 €) and hand delivery, free, on request, arranged on
   WhatsApp. No Colissimo, no home delivery, anywhere (site, FAQ, CGV,
   privacy, e-mails, docs).
3. **The range is Africa and Asia**, not only West Africa (roasted barley,
   psyllium from India).
4. **No newsletter for now**, to come back later: hide it, keep the code.
5. **Recipes are the house's own**, in Marie's words.
6. **Exact wording**: her sentences are used as written, with French
   typography (space before the colon, curly apostrophes, no em dash).

## 2. Inventory (every point of the PDF)

| # | Where | Change | Files |
| --- | --- | --- | --- |
| A1 | Home hero | « Des plantes d’Afrique et d’Asie, en sachet kraft. » (EN "Plants from Africa and Asia, in kraft pouches.") | `pages/{fr,en}/home.yml` |
| A2 | Home trust strip | « Livraison en point relais, offerte dès 49 € » (lower case p and r) | `home.yml` |
| A3 | Home trust strip | « Remise en mains propres sur demande » (icon stays) | `home.yml` |
| A4 | Featured | cacao powder (Côte d’Ivoire) featured, tiger nut tubers not | `products/fr/poudre-de-cacao-100g.yml`, `tubercules-de-souchet-200g.yml` |
| A5 | Product cards | clicking a format chip (100 g / 200 g) shows that format's price, price per kilo, and adds that format, without leaving the page; for every product with several formats | `ProductCard.astro`, new `src/scripts/card-formats.ts` (or in the existing shop script), e2e |
| A6 | Map / story | "Arnouville" becomes "France" (map label, lands chip) | `home.yml storyLands.to`, `scripts/origins-map.mjs`, regenerate `origins-map.{svg,json}` |
| A7 | Story text under the map | Marie's sentence: « Racines en Partage est née entre deux terres : naviguant entre zones tropicales et tempérées, pour vous faire découvrir des produits d’exception, qui vous accompagneront au quotidien. » | `home.yml storyBody` (+EN) |
| A8 | "Notre maison : Arnouville" | « Notre maison : France » | `StoryBand`/locales/`home.yml` |
| A9 | Nos engagements | Marie's ESAT paragraph, verbatim | `home.yml commitmentBody` (+EN) |
| A10 | Newsletter | removed from every page for now (`newsletter.enabled: false`): footer, recipes band; landing page stays reachable but unlinked | `settings/shop.yml`, tests that assume it on |
| R1 | Recipes page head | title « Nos petites recettes », lead « Chaque produit a droit à sa recette ! Retrouvez ici des idées de recettes, en plus de celles imprimées sur nos sachets, pour vous accompagner dans vos créations, de la boisson du matin au dessert. » | `locales` or recipes page content |
| R2 | Every recipe | heading « Astuces » becomes « Nos petites astuces pour varier les plaisirs » | locales |
| R3 | Boisson fraîche au baobab | becomes a house recipe: tiger nut milk or almond milk instead of water, plus mango purée; tips: pulp settles (stir), lime or mint, try jus de bouye | `recipes/{fr,en}/boisson-fraiche-au-baobab.yml` |
| R4 | Smoothie au moringa | house recipe: summary « Une cuillère de poudre de moringa, un fruit : le smoothie de la maison pour le matin ou le goûter. »; kaki instead of banana; no apple, no pineapple; 200 ml coconut milk; a little cinnamon; tip « La framboise et la mangue fonctionnent aussi très bien, testez ! » replaces the banana tip | `smoothie-au-moringa.yml` |
| R5 | Jus de bissap | summary verbatim (« La célèbre boisson rouge… à la menthe et à la vanille. ») | `jus-de-bissap.yml` |
| R6 | Yaourt baobab miel | summary verbatim | `yaourt-au-baobab-et-au-miel.yml` |
| R7 | Chocolat chaud | « Ajoutez une pincée de cannelle… » | `chocolat-chaud-maison.yml` |
| R8 | Granola | the three tips verbatim | granola recipe file |
| C1 | Contact lead | « …ou une demande de remise en mains propres ? » replaces « ou un retrait à Arnouville ? » | `pages/{fr,en}/contact.yml` |
| C2 | Contact | « Nous répondons en général sous 72 heures. » (everywhere 48 h is promised for a reply) | locales, contact.yml, FAQ, e-mails |
| C3 | Address | removed from every customer-facing place: contact card and its Google Maps link, footer, checkout, thanks page, e-mail footer, vCard, JSON-LD street. Kept only where the law requires the seller's address: legal notice, CGV (seller identity, withdrawal returns), privacy (controller). | `ContactBlock`, `Footer`, `CheckoutView`, `OrderDetails`, `worker/email/templates.ts`, `seo/graph.ts`, `Base.astro`, `public/racines-en-partage.vcf` |
| S1 | Notre histoire | « Racines en Partage est une petite maison située dans le Val-d’Oise » | `pages/{fr,en}/about.yml` |
| S2 | Rituel paragraph | the sentence starting « Chaque sachet » becomes « Chaque sachet vous guide : une idée d’utilisation et une petite recette maison issue de notre quotidien. » | `about.yml` |
| S3 | ESAT paragraph | same text as A9 | `about.yml` |
| S4 | Ingredients paragraph | « Nos produits sont 100 % végétaux et garantis sans additif, conservateur ou colorant. Avec un seul ingrédient par sachet, pas de surprise : ce qui est écrit sur l’étiquette est ce que vous trouvez à l’intérieur. » | `about.yml` |
| F1 | FAQ storage | serve with a dry wooden spoon; the date sentence reworded (see 3.3) | `faq.yml` |
| F2 | FAQ delivery times | Mondial Relay only, no Colissimo; shipping cost answer without the 6,90 € home price | `faq.yml` |
| F3 | FAQ pickup | hand delivery on request, free, arranged on WhatsApp; no Arnouville | `faq.yml` |
| F4 | FAQ intro | no « retrait à Arnouville » | `faq.yml` |
| L1 | CGV delivery | no Colissimo; hand delivery on request instead of the Arnouville pickup | `legal/{fr,en}/terms.md` |
| L2 | `rep_session` larger than the text | inline `code` in legal pages at the text size (font-size 0.9em of a monospace that looks the same size, or inherit) | `LegalPage.astro` / global css |
| L3 | Providers | no La Poste / Colissimo | `legal/{fr,en}/privacy.md` |
| P1 | Cart notice | « Point relais ou remise en mains propres gratuite sur demande : vous choisirez à l’étape suivante. » | locales `cart.deliveryNote` |
| P2 | Next step (delivery choice) | the hand-delivery option says the request goes through WhatsApp, with a WhatsApp button (wa.me link, prefilled message) | `CheckoutView`, locales, settings |

## 3. Decisions

### 3.1 Shipping methods

- `home` gets `enabled: false` in settings (the code path stays, tested by
  the unit tests that toggle it, so it can come back). Nothing in content
  mentions it.
- `pickup` keeps its id (orders, KV, metadata, tests rely on it) and changes
  its words: label « Remise en mains propres, sur demande », estimate « à
  convenir sur WhatsApp ». Price 0, France only.
- Checkout, pickup card: no address. Title « Remise en mains propres », text
  « Gratuite, sur demande : écrivez‑nous sur WhatsApp pour convenir du lieu
  et du moment. Vous pouvez payer maintenant ou nous écrire avant. », a
  WhatsApp button (`https://wa.me/33775689108?text=…`, opens in a new tab,
  `rel="noopener"`), the phone number in plain text beside it.
- Stripe submit message (Worker `submitMessage`), thanks page, customer
  e-mail: the same instruction with the WhatsApp number, no address. Owner
  e-mail: « Contactez la cliente ou le client sur WhatsApp pour convenir de
  la remise en mains propres. »
- New setting `brand.whatsapp: '33775689108'` (international digits, empty
  hides the button and falls back to the phone and e-mail). Same in
  `worker/shop.ts` with the parity test. The number is the shop's mobile; to
  confirm with Marie.

### 3.2 Address

Legal minimum stays (LCEN art. 6 III for the publisher, Code de la
consommation L221-5 and R221-1 for the seller's geographic address, the
withdrawal returns). Everything else drops the street: JSON-LD keeps
`addressRegion: Val-d'Oise`, `addressCountry: FR` (no street, no
postcode); the footer and contact card show e-mail, phone, WhatsApp,
Facebook; the e-mail footer shows the name, SIRET, e-mail, terms.

### 3.3 FAQ date wording

Marie asks for « date de durabilité maximale ». The legal term is « date de
durabilité minimale » and the pouch prints « À consommer de préférence avant
le ». Writing « maximale » would be wrong. Her intent is a sentence that does
not sound like the product is only good until a minimum date: use the words
printed on the pouch, « La date “à consommer de préférence avant” est
indiquée sur chaque sachet. » Reported to her.

### 3.4 Format chips on cards

The chip becomes a radio-like toggle (`button` with `aria-pressed`) when
JavaScript runs; without JavaScript it stays the link to the format page
(progressive enhancement, CSP `script-src 'self'`). Selecting a chip swaps
in place, with no layout shift: the price (the « dès » prefix goes away once a
format is chosen), the price per kilo, the add button's `data-sku`, its
`data-stock` and disabled state, its screen-reader suffix, the title link's
`href` (so a click on the card opens the chosen format) and the card's
`data-price`, `data-weight` (sort stays coherent with what is shown). The
photo stays (same pouch for both formats today). A polite live region
announces « 200 g, 11,00 € ». Data comes from `data-*` on each chip, built
at compile time.

### 3.5 Newsletter

`newsletter.enabled: false`. The Worker endpoint and the landing page stay
(noindex, no link to them). Privacy keeps its newsletter paragraph? No: the
paragraph and the Resend mention of subscribers are removed while the
newsletter is off, so the policy says only what is true; the git history
keeps the text for later (the owner guide says how to turn it back on).

### 3.6 Amendments after the advisor's audit and the designer's spec

- The disabled `home` method keeps its code but its words become
  carrier-neutral (« Livraison à domicile », no Colissimo), since
  `dist/catalog.json` is public.
- Format chips keep their `<a href>` (no-JS fallback, build test
  `storefront.test.ts:116`); the script intercepts plain left clicks and
  Enter/Space, sets `role="button"` and `aria-pressed`. The article's
  `data-price`/`data-weight` stay on the lead format so a filter click
  never makes a card jump. The stock badge and the add button label/icon
  also follow the chosen format. Selected chip filled forest on cream.
- Contact card: the address card becomes a WhatsApp card; the footer pin row
  becomes a WhatsApp row. `mapsLabel` is removed from content and made
  optional, the CMS field dropped.
- CGV withdrawal: the return address is sent by e-mail on request.
- `a11y.originsMapAlt`, `shop.landsTo`, shop metaTitle, categories,
  `site.webmanifest`, `scripts/business-card.mjs` and the vCard follow.
- Legal reference: R221-2 (not R221-1) with L221-5 and L111-1.
- Mango purée quantity: chosen by us, to confirm with Marie. Cacao price is
  still a placeholder and now sits in the shop window (launch-check item).

## 4. Work split (file ownership, no overlap)

| Worker | Owns |
| --- | --- |
| W1 cards | `src/components/ProductCard.astro`, the card script, its registration in the layout or shop scripts, `tests/e2e/card-formats.spec.ts` (new), unit test if helpers |
| W2 delivery and address | `settings/shop.yml`, `schemas.ts` (whatsapp field), `public/admin/config.yml`, `worker/**`, `tests/worker/**`, `src/cart/**`, `ContactBlock`, `Footer`, `Base.astro`, `seo/graph.ts`, `public/racines-en-partage.vcf`, `scripts/launch-check.mjs`, `scripts/origins-map.mjs` + regenerated map, `StoryBand`, `OriginsMap`, `locales/{fr,en}.json`, `locale-schema.ts`, `LegalPage`/css for `code`, `legal/**`, `tests/unit/**`, `tests/build/**`, `tests/e2e/**` except W1's spec |
| W3 content | `pages/{fr,en}/{home,about,contact,faq}.yml`, `products/fr/*.yml` featured flags, `recipes/{fr,en}/*.yml`, `docs/client/recettes-a-valider.md`, `docs/client/presentation.md`, `docs/guide-proprietaire.md` |

Lead: this plan, the merge, the gates, docs (`CLAUDE.md`, runbook,
handover), the commit.

## 5. Not breaking anything

- Grep gate at the end, in `src/`, `worker/`, `public/` (docs excluded):
  no `Colissimo`, no `Arnouville` outside `legal/` and `settings`/`worker/shop.ts`
  address data, no `48 heures` / `48 hours` for replies (the newsletter link
  validity of 48 h is a different fact and stays), no `Afrique de l’Ouest`
  in the hero.
- Gates: `pnpm check`, `pnpm test`, `pnpm test:worker`, `pnpm build`,
  `pnpm test:build`, `E2E_SKIP_BUILD=1 pnpm e2e`, crawl of every page.
- No em dash in content (unit test). No health claim in the recipes.

## 6. Progress log

- 2026-11-25: all items done (W1 cards, W2 delivery/address/newsletter/legal/tests,
  W3 content). Gates: check clean, unit 378, Worker 396, build tests 60 (1
  skipped), e2e 247 (5 skipped: the footer newsletter tests while it is off).
  Visual check of the cards, checkout, cart, contact, story band and privacy
  page; one regression found and fixed (list markers on the format chips
  once the script swaps the list role).
- Open with Marie: the WhatsApp number (shop mobile assumed), the mango purée
  quantity (2 tablespoons for 250 ml), the cacao price now in the shop
  window, the English recipe page title.
