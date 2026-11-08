# Reference study: four e-commerce sites for a West-African botanicals micro-shop

Date of capture: 2026-11-08. Client context: premium bilingual Astro static shop (Cloudflare Worker, Stripe Checkout, Mondial Relay, Sveltia CMS, no database), about 10 products (hibiscus, moringa, baobab, psyllium, tiger nuts, cacao).

Sites studied:

| Code | Site | What it is |
|---|---|---|
| K | kasana.bio | Brand site of KASANA (importer, WordPress) |
| NS | nature-snacks.bio/fr/produits/kasana | The webshop where KASANA products are sold (parent company Nature Snacks SRL, Belgium) |
| V | herboristerieduvalmont.com | Herboristerie du Valmont (PrestaShop, Belgian company, ships to France) |
| T | thes-traditions.com | Thés & Traditions (PrestaShop, French SAS, Provence) |

Labels used below: "seen" means observed in HTML, REA output or a downloaded image. "Guess" means inference not directly confirmed.

---

## 0. Method and what the tools actually delivered

### REA (step A): ran successfully, within budget (about 10 minutes)

- `pnpm dlx rea-agents@latest --help` worked (`npx` is not on PATH on this machine; `pnpm dlx` is).
- Playwright Chromium (`chromium-1234`, Chrome 151) first crashed with "No usable sandbox" (AppArmor user-namespace restriction). It started with `--no-sandbox` added (the same flag Playwright passes by default on Linux), headless, `--remote-debugging-port=9222`, fresh profile in the run directory.
- 8 tabs opened through the CDP HTTP endpoint: K home, NS product, V home, V product, V cart, T home, T product, T cart.
- `rea list-browser-targets` listed the 8 page targets: `rea-run/targets.json`.
- `rea inspect-web-page ... --observation-ms 1000 --include-accessibility-text --json` succeeded on all 8: `rea-run/inspect_*.json` (380 KB to 1.4 MB each).
- `rea analyze-web-bundle` succeeded on 4 home/product targets: `rea-run/bundle_*.json`.
- Browser killed at the end (CDP endpoint confirmed down).

What REA was good for:
- The accessibility tree gives the rendered text after JavaScript, so it caught things curl cannot see: the Axeptio consent dialog wording, V's chatbot ("Camille, Herbalist", "Powered by Synapse UP", microphone button), V's review badge "9.7/10 (25161 avis)", T's review carousel with reviewer names and dates, T's quantity stepper and format radios.

Limits observed in REA output:
- Scripts and resources are restricted to the page's own origin by default, so all third-party vendor scripts (Brevo, Axeptio, GTM, Facebook pixel, review widgets) were policy-filtered and absent. Vendor fingerprinting therefore came from curl HTML, not REA.
- DOM nodes carry no text values (privacy design); text only comes through the accessibility tree, whose order is not visual order.
- `analyze-web-bundle` produced only one useful inference (webpack runtime on V's theme bundle) plus low-confidence "endpoint candidates". It does not extract JSON-LD.

### curl (step B): complement

Downloaded into `rea-run/html/` (Chrome UA, 40 s timeout): product, category and cart pages for each site, plus delivery, CGV, legal notice, FAQ, payment, loyalty, quiz, pro and login pages. A powder product on V (Ashwagandha Poudre Bio, closest analogue to the client's range). One item was added to the cart on T and on V through PrestaShop's standard cart endpoint to see a non-empty cart. Visible text extracts are in `rea-run/txt/`. Five images were downloaded to `rea-run/img/` to judge photography.

### Corrections to the earlier quick grep

- "Alma": false positive. The match was the word "calmante" on V. No Alma integration found on any site. V advertises "Paypal en 4x" in its reassurance text.
- "Crisp chat": false positive. It is a WordPress CSS preset name (`--wp--preset--shadow--crisp`) on K.
- "WhatsApp": only an entry in an Elementor share-buttons config on K. No WhatsApp chat or `wa.me` link on any site.
- "Avis Vérifiés": V's badge is served by Société des Avis Garantis (module `steavisgarantis`, iframe from societe-des-avis-garantis.fr, with a fallback `data-src` on cl.avis-verifies.com). T also uses Société des Avis Garantis.
- "Brevo/Sendinblue": T loads the Brevo SDK and a `brevo_subscribe` endpoint; V loads the older Sendinblue tracker.

---

## 1. Per-site study

### 1.1 KASANA brand site (kasana.bio)

**Platform (seen):** WordPress, Elementor and Elementor Pro, theme Hello Elementor, GDPR Cookie Compliance plugin, Google Tag Manager (2 containers), Adobe Typekit fonts, Elementor background video and background slideshow chunks, Lottie, Swiper. Languages FR, NL, EN. JSON-LD graph of the Yoast style (guess on the plugin: WebPage, ReadAction, ImageObject, BreadcrumbList, WebSite with SearchAction, Organization).

**It is not a shop.** It sells nothing directly; "WEBSHOP" links to nature-snacks.bio. The audience is mainly professionals.

**Home page, in order (seen):**
1. Header: product categories (Fruits séchés, Noix nature, Noix grillées, Mix, Purées d'oléagineux, Aides culinaires), À propos, Filières, Engagement, Pour les professionnels, Contact, Webshop, FR/NL/EN.
2. Hero: H1 "Fruits séchés, noix, graines & épices bio en direct du producteur", short paragraph, two buttons ("Découvrir nos filières", "Voir nos produits"). Background video or slideshow (scripts loaded; exact media not verified).
3. "Du producteur à votre assiette": origin story, then four sourcing cards: mango, peanut and cashew from Burkina Faso; vanilla from Uganda; pineapple from Uganda; other partner chains.
4. "Pour qui travaillons-nous ?": three audiences (organic shops and wholesalers, artisans and restaurants, engaged consumers) with "Webshop" and "Parlons de votre projet".
5. "Pourquoi choisir KASANA ?": four pillars (Filières durables, Valeur ajoutée, Impact environnemental, Transparence).
6. "Notre gamme de produits bio": six category tiles.
7. "Envie de travailler avec nous ?": B2B call to action.
8. Footer: Contact, Professionnels, Blog, CGV (a PDF of B2B conditions, "Conditions générales NATURE SNACKS Entreprises"), social (Facebook, Instagram, LinkedIn, YouTube), address "Nature Snacks SRL, Avenue Konrad Adenauer 49, 1401 Nivelles, Belgique".

**Category page** (`/nos-produits/fruits-seches/`): H1, one-line promise ("100% naturels et sans sucres ajoutés"), product tiles by name only (Abricots, Ananas, Bananes, Dattes, Figues, Mangues, Raisins). No prices, filters or sort.

**Legal and compliance:** cookie banner with "Accepter / Rejeter" and a settings panel with per-service toggles (Google Tag Manager, Google Analytics). No SIRET (Belgian company). CGV are B2B.

**Premium feel:** the og:image is a real photo of three smiling people at a Burkina Faso production site holding bags of dried mango (seen). Authentic origin photography is the strongest asset of this site and is directly relevant to the client.

### 1.2 Nature Snacks webshop (nature-snacks.bio)

**Platform (seen):** custom ASP.NET MVC shop by the Belgian agency Anacom (a Razor template string `Html.Partial("_Search/anashop_Sort")` leaks into the category page; scripts named `selljs`, `jsanashop`). Google Analytics (gtag), Facebook pixel. Typekit and Google Fonts (Playfair Display). Languages FR, NL, EN. No JSON-LD on any page; 13 microdata `itemprop` on the product page; partial Open Graph.

**Global:** top bar "Livraison gratuite au Benelux, en France et en Allemagne dès 40€ d'achat." Menu: À propos, Notre entreprise, Nos métiers, Nos marques, Nos engagements, Espace pro (Tarifs professionnels, Private label), Contact, Webshop, Se connecter.

**Product page anatomy** (Kasana creamy peanut butter 280 g, seen):
- Back link "< Retour au webshop", a brand intro block ("KASANA, du producteur à votre assiette"), then title and weight (280 g).
- Three paragraphs: taste and use, composition (peanuts and salt, no oil, no added sugar), sourcing (cooperative in Burkina Faso). Link "Plus d'infos sur kasana.bio".
- Price "€ 5,50". Sizes are separate products shown as linked pills with their own price: 500 g €9,75, 3 kg €32,00.
- Price per kilo: not shown. Stock: not shown.
- Add to cart. Tabs: "Informations nutritionnelles" (ingredients with %, allergen traces, organic certifier "CERTISYS BE-BIO-01", nutrition table per 100 g) and "Avis" (empty).
- Cross-sell: "Produits dans la même catégorie" (5 nut butters with their size options).
- Cart drawer (seen in REA): "Plus que 40,00€ pour profiter de la livraison gratuite au Benelux, en France et en Allemagne", total, "*Prix TTC. Les frais de livraison sont calculés à l'étape suivante. Vous pourrez ajouter votre code promo à l'étape de paiement.", button "Valider et payer". No cart page (`/fr/panier` returns 404).

**Category page** (`/fr/produits`): category list in a sidebar (Beurres de noix, Fruits séchés, Noix, Vanille, etc.), sort by price ascending or descending, brand filter (Blooom, Drive Me Nuts, Jua, Kasana, Smooth). Cards: brand, name, weight, price. No badges.

**Account:** login and registration with a "Je suis un professionnel" option and a country list. No social login seen. No wishlist UI seen (one "wishlist" string in code only).

**Trust and legal:** no reviews provider, no newsletter form seen, cookie notice is only "En poursuivant, vous acceptez l'utilisation des cookies. En savoir plus" (implied consent, which does not meet the CNIL standard for a French shop). CGV page exists but its content is not in the HTML (guess: loaded from a file or script).

**Premium feel:** low on the shop side. Functional catalogue, plain cards.

### 1.3 Herboristerie du Valmont (herboristerieduvalmont.com)

**Platform (seen):** PrestaShop 1.7 with `child_classic` theme, modules: blockwishlist, ps_emailalerts, ps_emailsubscription, ps_shoppingcart, ps_imageslider, ets_sociallogin, steavisgarantis. Google Tag Manager, gtag (GA4), Google Ads remarketing comment, Facebook pixel, Sendinblue tracker, reCAPTCHA, Axeptio. Fonts Open Sans and Oswald (Google Fonts). Languages FR, DE, NL. Operator per CGV: "I Next", Belgian law, courts of Nivelles; VAT BE0898612255.

**Home page, in order (seen in DOM order):**
1. Notice bar: "Vous avez peut-être entendu parler de la faille PHP ... Notre boutique a été mise à jour et vérifiée le 22 octobre, vous pouvez commander tranquillement." (topical trust message).
2. Header: logo, links "Recettes de tisanes", "Nos actifs", two phone numbers (France and Belgium), review badge "9.7/10 (25161 avis) ★★★★★", search, "Mes listes" (wishlist), "Connexion" dropdown with "Se connecter avec Google" plus email login, language selector, cart.
3. Mega menu: Herboristerie, Thé tisane infusion, Épices et aromates, Ethno-herboristerie, Phytothérapie, Fleur de Bach, Huile essentielle, Complément alimentaire, Santé & bien-être (long list by health concern: sommeil, stress, digestion...), Beauté & hygiène. Seasonal shortcuts ("Notre sélection pour la détox du foie", "... pour le sommeil").
4. Image slider (Bootstrap carousel, fade) with category banners (Tisanes plaisir, Encens, Épices, Huiles essentielles, Tisanes santé, Teintures mère, Thés, Plantes en vrac, Gélules, Bourgeons).
5. Tabbed product carousel "Herboristerie : Sélection du moment / Les nouveautés du Valmont": cards with concern tags (Difficultés à s'endormir, Stress), short text, price, "-7%" badges, add to cart.
6. Founder text block: H1 "Herboristerie bio en ligne", signed "Virginie Missiaen, Herboriste diplômée".
7. Long SEO text: history of herbalism in France and Belgium, five plants to know, how to become a herbalist, where to buy herbal teas.
8. Blog teaser: four articles with "Lire la suite", "Vers le blog".
9. "Nos recettes de tisanes": four recipe cards (menopause, constipation, cystitis, hypertension).
10. Reassurance strip: "Expédition sous 24h", "Certification bio (FoodChain ID)", "Contactez-nous", "Programme de fidélité", "Paiements sécurisés: CB, Visa, MasterCard, Paypal, Paypal en 4x, Bancontact, Sofort, chèque, virement bancaire".
11. Newsletter signup (email field, "S'abonner"; no incentive text seen).
12. Footer: social (Facebook, Instagram), product links, info links (Livraison, Mentions légales, Conditions d'utilisation, Qui sommes-nous, Paiements sécurisés, FAQ, Utilisation de cookies, Rappel de produits, Contact), "Votre compte" links, organic certification line "BE-BIO-03", phones.
13. Floating chatbot "Je suis là pour vous aider", agent "Camille, Herbalist", "Powered by Synapse UP", text and microphone input (seen in REA; guess: AI assistant).

**Product page anatomy** (Ashwagandha Poudre Bio, a powder, and a valerian tincture, seen):
- Breadcrumb, H1, available sizes in subtitle ("100g, 250g, 500g"), reference number.
- Short benefit text, "en savoir plus", a short MP4 video captioned "L'Ashwagandha en moins de 60 secondes ?".
- Concern tags as links (Stress, Mémoire, Surmenage...).
- Price "10,99 €" with "TTC". Variant select "Conditionnement 100g / 250g / 500g". Review count link "(89 avis)". Add to cart, wishlist heart.
- Free-shipping message on the product page itself: "Montant restant pour la livraison gratuite en Points Retraits : 85,00 €".
- Price per kilo: not shown (the PrestaShop `unit_price` field is empty). Stock: not shown to the shopper (stock is in the page data, quantity 14).
- Tabs: Description, Mode d'emploi, Composition, Qualité & expertise, Avis clients, Fiche technique, Recettes - Articles.
- "L'avis des utilisateurs ⭐️⭐️⭐️⭐️⭐️" paragraph summarising reviews, followed by a disclaimer that reviews are personal experiences and not therapeutic claims (guess: machine-generated summary).
- Monograph sections: benefits, contraindications, botany, active compounds, three preparation methods.
- Downloadable PDFs on the tincture page (usage guide, catalogue).
- Reviews block (Société des Avis Garantis): star histogram (5★ 99, 4★ 21, 3★ 4), "9.6/10 basé sur 124 avis", "Avis soumis à un contrôle", "Voir l'attestation".
- Cross-sell "Nous avons d'autres produits à vous proposer": same plant in other forms (tea, tincture 50 ml, powder) with review counts and prices.

**Category page** (Poudres de plantes médicinales, seen): long intro, sub-category tiles by alphabet range (A-B-C, D-E-F...), "Il y a 74 produits", sort (Pertinence, Nom A à Z, Nom Z à A, Prix croissant, Prix décroissant), 21 per page, faceted filter "Nom commun - Actif naturel" with counts (includes "Moringa - Shigru (1)"), "Effacer les filtres". Cards: name, concern tags, two-line claim, price, size chips (100g, 250g), add to cart.

**Cart and checkout (seen with one item):** line with variant, delete, subtotal, shipping 4,75 €, total, "Montant restant pour la livraison gratuite en Points Retraits : 74,01 €", "Vous avez un code promo ? Ajouter", "Commander". Payment (payment page): cards through Mollie (CB, Visa, MasterCard, Bancontact, Sofort), PayPal, cheque and bank transfer. Delivery (delivery page): France Colissimo home or "Mon commerçant" relay (6,95 € / 4,75 € under 85 €, relay free from 85 €), Bpost for Belgium, Luxembourg, Netherlands, Germany, Deutsche Post for Switzerland, Colissimo Expert overseas. Shipped within 24 h, tracking link emailed.

**Account (seen in footer and module list):** personal info, order history (`/historique-des-commandes`), credit slips, addresses, vouchers, "Mes alertes produits" (back-in-stock), wishlists ("Mes listes", login required), Google sign-in, loyalty programme mentioned.

**Trust and marketing:** Société des Avis Garantis (9.7/10, 25 161 reviews), Sendinblue newsletter (no incentive seen), Facebook and Instagram, blog, recipes, FAQ page (8 questions: account needed, cash on delivery, same-day dispatch, damaged parcel, order tracking...), chatbot, product recall page.

**Legal:** Axeptio banner ("Bonjour c'est nous... les Cookies !", "Continuer sans accepter", "Je choisis", "OK pour moi"). Disputes: CGV point to the EU online dispute platform with a dedicated email (`odr@...`); no French consumer mediator named (it is a Belgian company). No SIRET (Belgian). Legal notice gives the Belgian VAT number.

**Structured data:** home: Organization, WebPage, WebSite with SearchAction. Product: Organization, WebPage, BreadcrumbList, Product (gtin13, sku, Brand, Offer), about 130 Review objects, AggregateRating, plus 261 microdata attributes. Category: BreadcrumbList, ItemList.

**Premium feel:** low to medium. Dense, text-heavy, classic PrestaShop look. Packshot style (seen): kraft bag with a white black-and-white label, organic logos, a heap of powder beside the bag, on pure white. Credible and clean, not luxurious.

### 1.4 Thés & Traditions (thes-traditions.com)

**Platform (seen):** PrestaShop 1.7 with a heavily customised `sp_furnicom17` theme, custom modules (`ttsearch` search, `/dev/chat-widget.js`), blockwishlist, mailalert (back-in-stock), ps_emailsubscription, PrestaShop Checkout (PayPal, with configuration keys for Apple Pay, Google Pay, hosted card fields and "pay later"), Payplug module markers, Brevo SDK and subscribe endpoint, Axeptio, gtag, Facebook pixel, reCAPTCHA, lazysizes. Languages FR, EN, IT, NL, DE.

**Design tokens (seen in inline CSS):** `--navy #091230`, `--blue #203781`, `--cream #fdf9ee` / `#fdfaf3`, `--beige #fcf3df`, `--gold #f2c205`, `--red #ed324e`. Fonts: a display serif "Cosmetic" (fallback Georgia) with "Roboto Condensed" for UI. Keyframes: `tt-marquee` (75 s linear loop), `ttCountPop` (springy cubic-bezier), `tt-toast-in`, `ttAvisIn`, `pcard-spin`; a `prefers-reduced-motion` rule is present.

**Home page, in order (seen):**
1. Scrolling announcement bar (marquee): "Maison française depuis 2016 · ★★★★★ + 2300 avis clients vérifiés · Livraison rapide, offerte dès 45€ en France · Une question ? +33 (0)4 22 91 35 75".
2. Header: logo with tagline "Maison française depuis 2016", search, Compte, Panier with count.
3. Mega menu with editorial intros ("La collection: L'art du thé. Plus de 300 thés et infusions choisis avec cœur"), columns by type, flavour, origin and collection, an "En ce moment" feature; Accessoires menu shows best sellers with prices. Top items: Thés, Rooibos, Tisanes, Grands crus, Accessoires, Coffrets de thé, Noël, "Programme de fidélité" with a "Nouveau" tag, Notre maison.
4. Hero: H1 "Le plaisir se transmet, comme une tradition.", one sentence, two buttons ("Découvrir la collection", "Notre histoire"), three counters (300+ références, 2016 année de fondation, 2300+ avis clients vérifiés).
5. "Nos familles: explorez nos familles, trouvez votre thé.": slider of numbered family cards ("N° 01 Thés verts, 84 réfs", "N° 02 Thés noirs, 50 réfs" ... "N° 09 Pu erh").
6. "Une histoire de passion et de partage": two paragraphs and three values (Le goût vrai, Le geste juste, Le plaisir partagé), "Découvrir notre histoire".
7. "De saison: les thés et infusions de l'automne": product cards (category label, review count, name, one-line description, format chips Boîte / Vrac 1kg / Sachet, price "7,50 € / 100g", "Ajouter", badges "Bio" and "COUP DE ❤", wishlist heart), "Tout voir".
8. Shop reviews: "Vous en parlez mieux que nous.", "9,8 /10, 2299 avis vérifiés", carousel of recent reviews with first name and initial, date, "Acheteur authentifié", link to the Société des Avis Garantis certificate.
9. Instagram: "Notre quotidien en images", @thestraditions, six posts with captions.
10. Reassurance: Maison française (indépendante depuis 2016), Livraison rapide (chez vous ou en point relais), Préparé avec le cœur (dans le sud de la France), Service client ("Une vraie voix au bout du fil, du lundi au vendredi" plus phone).
11. Newsletter "Lettre de la maison: Ne perdez pas une goutte." with consent line "En vous inscrivant, vous acceptez de recevoir nos e-mails. Désinscription en un clic." No incentive.
12. Footer: brand blurb, rating, languages, "Nos services" (Guide du thé, Trouver mon thé, Nous contacter, Espace pro, Programme fidélité, "Parrainage : offrez 5 €, recevez 5 €"), "Informations" (Notre histoire, Le journal du thé, Livraison et retour, CGV, Protection des données, Mentions légales, Droit de rétractation), address, phone, email, Instagram, Facebook. Payment icons: Apple Pay, Bancontact, Cartes Bancaires, Mastercard, PayPal, Visa.
13. Floating "UN CONSEIL ?" widget (custom script), "Retour en haut".

**Product page anatomy** (Rooibos Pomme Grillée Cannelle, seen):
- Breadcrumb. Gallery of 5 images: a macro shot of the blend filling the frame, a kraft pouch packshot with a navy label on a cream background (the label repeats the brewing pictos), and three more.
- H1, family and "Note principale : Cannelle, Pomme", rating link "23 avis", short sensory description ("évoque une tarte tatin tout juste sortie du four").
- Format radios: "Sachet zip 100g", "Boite metal 100g", "Sachet Vrac 1kg" with a "-16%" badge.
- Bulk saving line: "Le vrac, c'est -16 % : 62,70 € le kilo au lieu de 75,00 € en sachet zip 100 g. Vous économisez 12,30 € par kilo".
- Quantity: minus/plus stepper, select 1 to 10 and "Autre quantité...".
- Add-to-cart button with the price inside ("AJOUTER AU PANIER 7,50 €"), then "Soit 75,00 € le kilo".
- Loyalty preview: "Programme Fidélité ❤️ 38 points à gagner ! 1€ dépensé = 5 points. En savoir plus".
- "Notre expertise: Conseils de préparation" with four pictos: infusion time 7-10 min, temperature 100°C, moment "Journée & Soirée", dosage 15-20 g/L.
- "Des ingrédients généreux et soigneusement sélectionnés": grid of each ingredient with a one-line descriptor (Cannelle: "Épice chaude au caractère profond"...), then full composition with percentages.
- Three brand promises (Conditionné en France, Des ingrédients d'exception, Un goût unique & généreux).
- Long-form "En savoir plus" behind "LIRE PLUS": summary box, aromatic profile in top, heart and base notes, preparation (hot, iced, latte), benefits with references to EFSA and ANSES, the owner named as blender, storage (18 to 24 months), FAQ (4 questions), sources.
- Product reviews widget (loaded asynchronously).
- "On vous suggère aussi": 4 related rooibos.
- The product name and add-to-cart repeat at the end of the DOM (guess: sticky add-to-cart bar on scroll).
- Stock: not shown (JSON-LD says InStock).

**Category page** (Tisanes et infusions, seen): H1, "93 produits", intro with "Lire la suite / Lire moins", horizontal chip carousel of intents (Infusion gourmande, Tisane digestion, Tisane sommeil, Infusion pomme cannelle, Infusion gingembre citron), filter drawer (Bio / Conventionnel with counts, Note principale by flavour, Famille), sort (Pertinence, Nom, Prix croissant, Prix décroissant, Nouveautés), 19 per page with numbered pagination. Cards show price per pack size ("5,90 € / 50g", "5,50 € / 100g") and badges Bio and COUP DE ❤. An editorial banner sits inside the grid ("Noël s'infuse à la maison" with flavour tags). Below: long SEO guide (benefits, preparation, when to drink, sources) and an FAQ. Note: they sell "Fleurs d'hibiscus" at 5,90 € / 100g, a useful price benchmark for the client.

**Cart and checkout (seen with one item):** line item with format and delete, "Vous avez un code avantage ? Ajouter", total, "Valider ma commande", "Paiement sécurisé", and a delivery table inside the cart: "Point relais Mondial Relay, 2 à 6 jours, 4,50 €, offerte dès 45 €", "Domicile UPS, 2 à 5 jours, 5,90 €, offerte dès 45 €", "Domicile Colissimo, 2 à 5 jours, 6,90 € (4,90 € dès 45 €)", "Retrait à Bouc-Bel-Air, gratuit". Customer service phone, email and hours. No free-shipping progress bar in the server HTML. Empty-cart state offers "Découvrir nos thés / ou nos tisanes & infusions". The delivery page repeats this as a table per zone with carrier logos (Mondial Relay, Colissimo, UPS), 24-48 h preparation, free from 45 € France and 59 € Europe.

**Account (seen):** login page in two columns: left "Bienvenue à la maison." with benefits ("Suivez vos commandes en un clin d'œil", "Gardez vos thés préférés à portée de main", "Cumulez vos points de fidélité") and the rating; right the form with a "Montrer" password toggle, "Connexion chiffrée et sécurisée", "Créer un compte". No social login seen. Wishlists require login.

**Loyalty and referral (seen on /pages/fidel):** 1 € = 5 points, 500 points = 5 € voucher; vouchers of 5, 10 or 15 € valid one year, no minimum; bonus missions (newsletter +30, follow on Instagram +50, story +100, photo +200, video +350); referral: the friend gets 5 € on a first order, the referrer gets 500 points; points expire after 18 months without an order.

**Quiz (seen):** "Trouvez votre thé idéal: six petites questions, une minute", then six recommended teas. The quiz itself is rendered by JavaScript and was not inspected.

**B2B (seen):** "Espace revendeurs" page: kit request, pro prices visible after login, three formats, argument list for delis and tea rooms.

**Legal (seen):** Axeptio banner ("Salut c'est nous... les Cookies !", "Non merci / Je choisis / OK pour moi"). Legal notice: SAS, RCS Aix-en-Provence B 822 607 040, VAT FR94822607040, host OVH, publication director named. CGV: 14-day withdrawal right; no consumer mediator found in the CGV text (searched for "médiat"; zero hits). SIRET is not in the footer (it is on the legal notice page as RCS). Footer legal links are `<span>` elements with base64-encoded URLs (SEO link obfuscation), not real links: an accessibility problem not to copy.

**Structured data (seen):** home: Organization (with PostalAddress, ContactPoint), WebPage, WebSite with SearchAction. Product: Organization, ItemPage, BreadcrumbList, Product (gtin13, sku, Brand, AggregateOffer from 7.50 to 62.70 with 3 offers, `hasMerchantReturnPolicy` 14 days, `shippingDetails` 4.50 EUR with handling and transit times), 23 Review, AggregateRating 4.96, FAQPage. Category: CollectionPage, BreadcrumbList, a "Product" representing the whole collection with AggregateRating 4.9 / 869 (a practice Google discourages), ItemList, FAQPage. Full Open Graph set.

**Premium feel:** the strongest of the four. Navy, cream and gold palette, a serif display face with condensed sans, editorial copy in the first person plural ("Notre maison"), numbered collection cards, macro ingredient photography plus consistent packshots, small purposeful motion (marquee, count pop, toast), real phone number everywhere.

---

## 2. Consolidated feature table

Sites: K = Kasana brand site, NS = Nature Snacks shop, V = Valmont, T = Thés & Traditions. Value is for a 10-product micro-shop. Cost is on our static stack (Astro, Worker, Stripe Checkout, Mondial Relay, Sveltia, no database).

| Feature | Sites that have it | Value | Cost | Recommendation | Note for our build |
|---|---|---|---|---|---|
| Variants (100 g / 200 g) | V, T, NS (as separate products) | high | low | must | Variant radios as in T; each variant a Stripe Price. |
| Price per kilo | T only ("Soit 75,00 € le kilo", bulk saving line) | high | low | must | Computed at build time from weight. We believe unit price display is expected in France for goods sold by weight; confirm with the client's advisor. |
| Customer reviews | V, T (Société des Avis Garantis); NS tab empty | high | medium (paid widget) / low (curated in CMS) | should | Start with real reviews collected by email and entered in Sveltia; French law requires saying whether reviews are verified and how. Emit AggregateRating only from genuine reviews. |
| Order tracking or lookup | V, T (account order history), V and T email tracking links | medium | low (email with Mondial Relay link) / medium (lookup page via Worker and Stripe API) | must (email link), later (lookup page) | No database needed: Stripe session plus Mondial Relay tracking number. |
| Customer account with Google sign-in | V (Google sign-in), T and NS (email accounts) | low | high | skip | Needs auth and storage; Stripe Checkout and Link already remember buyers. |
| Wishlist | V, T (login required) | low | low (localStorage) | skip | 10 products do not need it. |
| Newsletter | V (Sendinblue), T (Brevo) | high | low | must | Brevo form posted through the Worker, double opt-in. Neither site shows an incentive; a small welcome code is optional. |
| Loyalty | T (points), V (mentioned) | low | high | skip (later at most) | Requires a ledger per customer. |
| Referral | T ("offrez 5 €, recevez 5 €") | medium | medium to high | later | Cheap variant: personal Stripe promotion codes for a few ambassadors. |
| Quiz or product finder | T ("Trouver mon thé", 6 questions) | low | low (static client-side) | later | A simple "Pour quel usage ?" guide (infusion, smoothie, pâtisserie) does the job. |
| Search | V, T, NS | low | low (Pagefind) | skip | Navigation is enough at 10 products. |
| Filters and sort | V, T, NS | low | low | skip | Use intent chips instead (see wow list). |
| Blog or recipes | K (blog), V (blog, recipes), T (journal, guide) | high | low (Sveltia collection) | should | Recipes per product (baobab smoothie, bissap, psyllium use) drive SEO and teach usage. |
| Promo codes | V, T (cart field), NS (at payment) | medium | low | should | Stripe Checkout `allow_promotion_codes` covers it. |
| Gift cards | none (T sells gift boxes, not cards) | low | high | skip | Offer a gift box or gift message later instead. |
| Cookie banner | K (GDPR Cookie Compliance), V and T (Axeptio), NS (implied consent notice) | must if trackers | low | must (design to avoid needing one) | Use cookieless analytics (Cloudflare Web Analytics) and no ad pixels, then only a short notice is needed. |
| Live chat | V (Synapse UP chatbot), T (custom "Un conseil ?" widget) | low | low (link) to medium | skip | A visible phone, email or WhatsApp link is enough for a micro-business. |
| Back-in-stock alert | V (ps_emailalerts), T (mailalert) | medium | low to medium | should | Small batches will sell out; a form adding the email to a Brevo list tagged with the product. |
| Contact form | K, V, T, NS | high | low | must | Worker to email, with Turnstile. |
| Instagram feed | T (6 posts) | medium | medium (API token, rebuild) | later | Curated images in Sveltia give the same look at no cost. |
| Trust badges and reassurance strip | V (5 items incl. bio certification, payments), T (4 items, rating badge) | high | low | must | Only show the organic logo if certified; show origin, packing in France, delivery, real contact. |
| FAQ | V (FAQ page), T (FAQ per product and category, FAQPage JSON-LD) | high | low | must | Per product: dosage, storage, origin, allergens. |
| B2B page | K (professionnels), NS (espace pro, private label), T (espace revendeurs) | medium | low | should | Static page plus a form; épiceries fines and restaurants are plausible buyers of hibiscus and baobab. |
| Free-shipping threshold message | NS (cart drawer), V (product and cart), T (bar and cart table) | high | low | must | Computed client-side in the cart; Stripe shipping rates can mirror it. |
| Delivery options shown before checkout | T (table in cart), V (delivery page) | high | low | must | Mondial Relay point relais and price/delay shown in the cart. |
| Preparation pictos | T (time, temperature, moment, dosage) | high | low | must | For powders: dose, mixing medium, moment, storage. |
| Product JSON-LD with shipping and return policy | T (full), V (partial), NS (none) | high | low | must | Product, Offer, MerchantReturnPolicy, OfferShippingDetails, BreadcrumbList, FAQPage. |
| Multilingual | K (3), NS (3), V (3), T (5) | high | low | must | FR and EN as planned. |
| Add-to-cart feedback (toast, count pop, drawer) | T (toast, count pop), NS (drawer) | medium | low | should | Small, respects reduced motion. |
| Product recall page | V | low | low | later | Not legally required as a page; keep a process. |
| Product video (short) | V (MP4 "en moins de 60 secondes") | medium | low (if the client films) | later | A 20-second preparation clip per product. |

---

## 3. "Wow" details worth copying

1. **Bulk saving line in euros per kilo (T).** "Le vrac, c'est -16 % : 62,70 € le kilo au lieu de 75,00 € ... Vous économisez 12,30 € par kilo". For us: when 200 g is selected, show the per-kilo price and the saving versus 100 g.
2. **Price inside the add-to-cart button (T)**, updating with the selected format, plus "Soit XX € le kilo" right under it.
3. **Preparation pictos row (T)** with four icons, the same icons printed on the pouch label (seen on the packshot). For powders: "1 c. à café", "eau, jus ou yaourt", "le matin", "à l'abri de l'humidité".
4. **Ingredient or origin grid with one-line poetic descriptors (T).** For single-ingredient products, use it for origin, plant part, harvest and taste notes instead.
5. **Numbered collection cards (T)** "N° 01 Thés verts, 84 réfs". For us: "N° 01 Hibiscus, Burkina Faso" style cards give a catalogue-of-a-house feel even with 10 products.
6. **Hero with three honest counters (T)** with a springy count-up. For us: origin countries, year founded, number of partner producers (only true numbers).
7. **Slow marquee announcement bar (T)** at 75 s per loop with a reduced-motion fallback: free delivery threshold, origin, phone.
8. **Delivery table inside the cart (T)** listing carrier, delay, price and the free threshold before checkout. Mondial Relay first, as T does.
9. **Free-shipping remainder on the product page (V)**, not only in the cart.
10. **Reviews carousel with first name, initial, date and "Acheteur authentifié" (T).** Calm, credible, no stars overload.
11. **Intent chips above the grid (T)** "Tisane digestion, Tisane sommeil...". For us: "En infusion, En smoothie, En pâtisserie, Sans sucre ajouté".
12. **Real origin photography (K)**: people at the Burkina Faso production site holding the product. The client's West-African sourcing story deserves the same, ideally her own producers.
13. **Macro ingredient shot as the first gallery image, packshot second (T)**: texture first, then the product.
14. **Login page with a benefits column (T)**: "Bienvenue à la maison." We have no accounts, but the same tone fits the order confirmation page.
15. **Long-form product guide behind "Lire plus" (T)** with aromatic notes, preparation variants (hot, iced, latte), storage, FAQ and sources (EFSA, ANSES). Good SEO without cluttering the page.

Things not to copy:
- Base64-obfuscated footer links on spans (T): bad for accessibility.
- Collection-level AggregateRating on category pages (T): risk with Google's structured data policy.
- Implied-consent cookie notice (NS): not compliant in France.
- Navigation and product tags by disease or symptom (V: hypertension, cystitis, depression): health-claim risk under EU Regulation 1924/2006 for food products; T's approach of citing "traditionnellement utilisé" and EFSA is safer.
- Missing consumer mediator: none of the French-facing CGV studied names a mediator (T is French and should). Our CGV must name one.

---

## Files

- Run directory: `/tmp/claude-1005/-home-ngawang-dempa-tsang-projects-ai-dungeons/055c315f-5635-42ae-8e1f-0db830c2fecf/scratchpad/rea-run/`
  - `targets.json`, `inspect_*.json` (8), `bundle_*.json` (4): REA outputs
  - `html/`: curl downloads, including filled carts `tt_cart_full.html`, `val_cart_full.html`
  - `txt/`: visible-text extracts
  - `img/`: 5 sample images
