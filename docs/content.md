# Content model and CMS

Every piece of text, price, photo path and setting the owner can change lives
in `src/content/` as YAML or Markdown. Sveltia CMS (`/admin/`) reads and writes
the same files through the GitHub API; each save is a commit on `main`, which
Workers Builds turns into a deploy in about two minutes. The build validates
everything with zod: a content mistake fails the build with the file named,
and the previous deploy stays online.

Spec reference: section 4 of
`docs/superpowers/specs/2026-11-01-racines-en-partage-shop-design.md`. Owner
guide (French): `docs/guide-proprietaire.md`.

## 1. Layout

```text
src/content/
  products/{fr,en}/<slug>.yml      one product per file, same file name in both locales
  categories/{fr,en}/<slug>.yml    poudres, infusions, graines, cacao
  pages/{fr,en}/<key>.yml          home, about, faq, contact
  legal/{fr,en}/<key>.md           legal, terms, privacy (frontmatter + Markdown)
  reviews/<product>--<order>.yml   one customer review per file, no locale folder (section 8)
  settings/shop.yml                singleton, not translated (labels are { fr, en })
  locales/{fr,en}.json             UI strings, not in the CMS
src/assets/products/               product photos (CMS uploads land here)
src/assets/brand/                  category and page photos, logo medallion
```

The file name is the slug and the URL: `products/fr/poudre-de-moringa-100g.yml`
is `/produits/poudre-de-moringa-100g/` and `/en/products/poudre-de-moringa-100g/`.
Category slugs give `/boutique/<slug>/` and `/en/shop/<slug>/`.

| File                       | Schema (`src/content/schemas.ts`)                                   | Merge (`src/content/merge.ts`) | Loader (`src/i18n/locale.ts`) |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| `products/fr/*.yml`        | `productSchema` (`productSharedSchema` + `productTranslatedSchema`) | `mergeProduct`                 | `loadProducts`, `loadProduct` |
| `products/en/*.yml`        | `productTranslationSchema` (translated keys only, each nullish)     | `mergeProduct`                 | same                          |
| `categories/{fr,en}/*.yml` | `categorySchema`, `categoryTranslationSchema`                       | `mergeCategory`                | `loadCategories`              |
| `pages/{fr,en}/<key>.yml`  | `PAGE_SCHEMAS[key]`                                                 | `mergePage`                    | `loadPage`                    |
| `legal/{fr,en}/<key>.md`   | `legalFrontmatterSchema` (body is Markdown)                         | none (EN missing: FR file)     | `loadLegal`                   |
| `reviews/*.yml`            | `reviewSchema` (complete file, carries its own `locale`)            | none                           | `loadReviews`, `reviewsFor`   |
| `settings/shop.yml`        | `settingsSchema`                                                    | none                           | `loadSettings`                |
| `locales/{fr,en}.json`     | `localeSchema` (`src/content/locale-schema.ts`)                     | `deepFallback`                 | `loadLocale`                  |

Always read content through the loaders of `src/i18n/locale.ts`, never with
`getCollection`: the loaders apply the strict schemas, the French fallback and
the cross-file checks (`validateCatalog`: unique SKU and slug, known category,
existing related slugs and image files).

## 2. The French shared-field merge

The French file is complete and authoritative. The English file holds
translations only.

- **Shared fields** (products: `order`, `hidden`, `sku`, `category`, `price`,
  `weightGrams`, `originCountryCode`, `images`, `stock`,
  `featured`, `nutritionVerified`, `nutrition`, `free_from`, `related`;
  categories: `order`, `image`) are read from the French file only. Whatever
  the English file says about them is ignored, so the two locales can never
  disagree on a price or a stock status.
- **Translated fields** (`PRODUCT_TRANSLATED_KEYS`, `CATEGORY_TRANSLATED_KEYS`,
  derived from the translated schemas) come from the English file, and every
  gap is filled from French by `deepFallback` (`src/i18n/fallback.ts`): a
  missing key, `null`, an empty or blank string and an empty array all fall
  back. Arrays of objects fall back item by item, by index. A missing English
  file is the same as an empty one.
- **Pages** have no shared/translated split: the whole English page is
  `deepFallback(en, fr)`. Fields that are not text (`recipeProducts`, the
  reassurance `icon`, the about `image`) may simply be left out of the English
  file.
- The merged English value is validated again with the strict schema
  (`... (after French fallback)` in the error message).

Nutrition values are shared and written as printed on the French label
("3,0 g"); English pages pass them through `localiseNutrition`.

### Hidden, deleted and reordered products

`loadProducts` (`src/i18n/locale.ts`) runs three pure helpers of
`src/content/merge.ts` after merging:

1. `dropDanglingRelated`: a `related` slug that matches no product file (the
   product was deleted in the CMS while another file still lists it) is
   dropped, with one build warning per link ("Ignoring related links to
   deleted products"). Deleting a product therefore never fails the build.
   The home `recipeProducts` list is already tolerant (`HomeView` filters
   unknown slugs).
2. `validateCatalog` then checks the whole catalogue, hidden products
   included (unique SKU and slug, known category, images, no self link).
3. `publishedProducts`: products with `hidden: true` are left out, along with
   the `related` links that point to them. A hidden product has no page, no
   entry in `dist/catalog.json` (so the Worker refuses it at checkout), no
   sitemap URL, and no card anywhere.

The result is sorted by `compareProducts`: category `order`, then the
product `order` (written by the CMS "Réorganiser" mode; a product without
one comes last), then name and weight. The seed files carry `order` 1 to 10
in the order the shop showed before the field existed (a unit test checks).
`ShopView` still puts featured products first in its default sort; within
each group the CMS order applies.

## 3. How the CMS maps to the model

`public/admin/config.yml`, loaded by `public/admin/index.html` (Sveltia
0.256.1 from unpkg, pinned with Subresource Integrity, see section 7; the
config's first line points at the JSON schema for editor completion).

| Model                              | CMS                                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{fr,en}` folders                  | Global `i18n.structure: multiple_folders`, `default_locale: fr`, `initial_locales: all`. Entry collections use `folder: src/content/<name>`; file collections use `{{locale}}` in `file:` and need `i18n: true` on the collection and on each file.                               |
| Optional English                   | `initial_locales` being set lets the owner switch English off per entry (entry menu, "Désactiver anglais"): the English file is then deleted on save and the site shows French. No translated field is required in English, so a half-done translation saves too.                 |
| Shared product or category field   | `i18n: false`: edited in French only, hidden in the English pane, stored in the French file only (Sveltia leaves a non-localised field out of the other locales' files). Subfields inherit it.                                                                                    |
| Shared page field                  | `i18n: duplicate` on `recipeProducts`, the reassurance `icon` and the about `image`: read-only copy in English, written into the English file, where `deepFallback` makes it harmless.                                                                                            |
| Translated field                   | `i18n: true` and `required: [fr]` (or `false` when optional): required in French only, so a blank English value is allowed and falls back. Subfields of a translated object or list need their own `i18n: true`.                                                                  |
| Optional field (`.optional()`)     | `required: false`. The global `output.omit_empty_optional_fields: true` leaves it out of the file when empty. Without it the CMS would write `''`, which `text.optional()` refuses in the French file.                                                                            |
| Slug = file name = URL             | Products: `slug.template: '{{name}}-{{weightGrams}}g'` with `editable: [create]`, so a new product gets `poudre-de-moringa-100g` and the slug can never change afterwards (no broken URL, no broken `related`). Categories: `{{name}}`, editable on create.                       |
| `order` (products, categories)     | Collection option `reorder` (products: `{ group: category }`, a named view group). Not a form field: Sveltia writes `order` at the top of every locale's file of each moved entry, and gives a new entry the next number. The English copy is stripped by the translation schema. |
| `hidden`                           | Boolean "Masquer ce produit du site", default `false`; list filter "Masqués du site"; the list summary appends " (masqué)" with `{{hidden \| ternary(...)}}`.                                                                                                                     |
| References                         | `category`, `related` and the home `recipeProducts` are `relation` fields with `value_field: '{{slug}}'` (the file name). `related` filters out the product itself (`sku` equal to `{{fields.sku}}`) and hidden products; `recipeProducts` filters out hidden products.           |
| Enums                              | `select` options with French labels and the schema values (`STOCK`, `FREE_FROM`, `REASSURANCE_ICONS`, `SHIPPING_METHODS`, VAT modes). Up to five options render as radio buttons or checkboxes, which suits a phone.                                                              |
| Prices                             | `number`, `value_type: float`, `step: 0.01`, and `pattern` `^\d+(\.\d{1,2})?$` (Sveltia tests numbers as strings) mirroring the two-decimal refine of `euros`. Sveltia's number input accepts both "8,90" and "8.90" in a French UI.                                              |
| Product description                | `text`, not `richtext`: `ProductView` prints the description as plain paragraphs split on blank lines, so Markdown emphasis would show its asterisks.                                                                                                                             |
| Product `keywords`                 | Translated `list` of `string` items, `required: false`: search words the name does not carry (bissap, karkadé, tsampa, chufa). An empty English list falls back to French. Placed after `related`, before the Google texts.                                                       |
| Settings groups with a default     | `forms`, `newsletter`, `analytics` and `reviews` are `.default(...)` objects in `settingsSchema` (an older `shop.yml` still parses) but plain, always shown objects in the CMS, so the owner never meets an "add" toggle. The unit test allows that one required mismatch.        |
| `brand.siret`                      | `string`, `required: false`, `pattern` `^(\d{14}\|\d{3} \d{3} \d{3} \d{5})?$` mirroring the schema (14 digits, plain or grouped 3 3 3 5, or empty). The legal tokens `{siren}` (first 9 digits) and `{siret}` derive from it.                                                     |
| Reviews                            | Entry collection `reviews`, `i18n: false`, see section 8.                                                                                                                                                                                                                         |
| Settings labels `{ fr, en }`       | `object` with two `string` subfields, `en` optional (empty falls back to `fr` through `pickLabel`). The singleton has no i18n.                                                                                                                                                    |
| `shop.freeShippingFrom`            | `required: false`: emptied, it is left out of the file, which the schema (`nullish`) and every consumer read as "never free".                                                                                                                                                     |
| `shop.currency` (`literal('eur')`) | `hidden` field with `default: eur`.                                                                                                                                                                                                                                               |
| Legal Markdown                     | File collection, `format: frontmatter`, `body` as `richtext` limited to headings 2 and 3, bold, italic, links and lists, no editor component; `updated` is a `datetime` (`YYYY-MM-DD`, `auto_now`). A warning sits in the collection description and the body hint.               |

Other choices in the config:

- Field order follows how the owner thinks: name, photos, price, weight,
  stock, hidden, category, SKU, featured; then the texts; then the label
  details (origin, "sans" claims, nutrition); then related products and
  Google texts. Sveltia writes keys in field order; the build does not care.
- Every visible field has a French label and a one-sentence hint with an
  example (unit test). Hints accept bold and italic Markdown.
- New product defaults: `stock: in_stock`, `hidden`, `featured` and
  `nutritionVerified` false, `weightGrams: 100`, and the usual storage
  sentence in both languages (`default_localized`). A unit test parses those
  defaults plus a minimal typed product with `productSchema`.
- `publish_mode: simple` and no `skip_ci` (formerly `automatic_deployments`):
  every save commits to `main` and deploys, and the editor shows one
  "Enregistrer" button. Setting `skip_ci` would rename it "Publier" and add a
  "Enregistrer sans publier" choice that leaves the site out of date.
- `commit_messages` produce one-line conventional commits
  (`content: update products poudre-de-moringa-100g`).
- `categories` has `delete: false` and `duplicate: false`: a category with
  products cannot go, and an empty one is rare enough to be a developer task.
- `shipping` has `allow_add`, `allow_remove`, `allow_duplicate` and
  `allow_reorder` off and a read-only `id`: a new method needs Worker and
  checkout code, not just content.
- The settings singleton keeps the YAML structure the cart, the Worker and
  the components read, but orders it for the owner: `shop` (open, banner,
  VAT, quantity, free shipping threshold), `shipping`, `reviews`,
  `newsletter`, `launch`, `brand` (collapsed), then the technical `forms`
  and `analytics` (collapsed).
- New settings of iteration 3, all with a French hint and an example:

  | Key                         | CMS label                      | Empty or false means                                               |
  | --------------------------- | ------------------------------ | ------------------------------------------------------------------ |
  | `brand.siret`               | Numéro SIRET                   | legal pages print "en cours d'immatriculation", launch-check fails |
  | `forms.turnstileSiteKey`    | Clé Turnstile (anti-robots)    | forms render without the widget (public site key, never secret)    |
  | `newsletter.enabled`        | Newsletter active              | no signup block, newsletter endpoints answer 404                   |
  | `newsletter.welcomeCode`    | Code de bienvenue              | the confirmation e-mail prints no code (Stripe promotion code)     |
  | `analytics.cloudflareToken` | Jeton Cloudflare Web Analytics | no beacon script                                                   |
  | `reviews.enabled`           | Afficher les avis sur le site  | no review section, summary, home band or JSON-LD rating            |

- `editor.preview: false`: a YAML preview is useless, and the second pane can
  show the other locale side by side.
- A collection divider separates the legal texts from the everyday content.
- A CMS save rewrites the whole file: YAML comments (for example the
  `# placeholder` notes on prices) are lost, keys follow the field order of the
  config (`order` first), and `8.90` becomes `8.9`.

### Options checked and left out

- No top-level `locale`: Sveltia 0.256.1 has none (the JSON schema rejects
  it). The UI language follows the browser, or Settings, Langue in the CMS.
- No `divider` field type in 0.256.1 (only collection and singleton
  dividers): product sections are conveyed by the field order and the hints.
- No `bulk_edit`: it exists in 0.256.1 but its table strings are not
  translated into French yet.
- No `table_columns`: the list view with thumbnails reads better on a phone.
- `save_all_locales` and `omit_default_locale_from_filename` are deprecated
  (`initial_locales`, `omit_default_locale_from_file_path`), and the latter
  does not apply: both locales have their folder.
- `output.yaml.quote`, `output.encode_file_path`: defaults kept (plain
  scalars; file names are slugified, so nothing to encode).

### Known limits

- The legal texts go through Sveltia's rich text editor: on the first save it
  may restyle the Markdown (list markers, emphasis). The rendered page is the
  same. The `{company}`-style tokens are plain text to the editor and survive.
- The FAQ answers quote the shipping prices and the free shipping threshold
  in words; they do not follow the settings (hint in the FAQ list).
- `nutritionVerified: true` without a nutrition table fails the build (a
  cross-field rule the CMS cannot express); the hint says so.

### Tests

`tests/unit/cms-config.test.ts` parses `public/admin/config.yml` and checks:

- the CMS field names equal the zod schema keys for products, categories,
  every page, legal frontmatter (plus `body`) and settings, recursively
  through objects and lists of objects; the `reorder` key (`order`) is the
  only schema key allowed without a form field;
- the `required` flag matches the schema (required in French, optional when
  the schema says `optional()`, `default()` or `nullish()`);
- shared product and category fields are `i18n: false`, translated ones
  `i18n: true`, translated leaf fields are never required in English, and
  translated subfields declare `i18n: true`;
- the product field order, a label and a hint on every visible field, the
  new-product defaults against `productSchema`, the price and shipping price
  patterns against the schema, plain-text descriptions;
- select options equal the schema enums and contain every seeded value; the
  stock, hidden and category view filters; the reorder group; the relation
  filters; no product `thumbnail` key;
- the product slug template reproduces every existing file name;
- media: WebP at 1600 px, 2 MB, slugified names with the
  `{{slug}}-{{uuid_shorter}}` template, no external image URL;
- the settings section order, the optional free shipping threshold, the
  legal warning, the SIRET pattern against the schema (empty, plain,
  grouped; refuses 9 digits) and a hint with an example on every new
  setting;
- the `keywords` field (optional translated list of strings);
- the `reviews` collection: fields equal `reviewSchema` keys with matching
  `required` flags, no i18n, `published` and `verified` default `false`
  (`verified` read-only), relation to `products` by `{{slug}}`, limits and
  enums mirrored, defaults plus a minimal review parse with `reviewSchema`,
  the slug template and the Worker file name share the
  `<product slug>--<suffix>` shape, view filters and groups name existing
  fields;
- the `reviews` collection and its fields use only option names of the
  Sveltia 0.256.1 JSON schema (an offline allow-list; Sveltia silently
  ignores a misspelt option);
- every `file:` path exists for `fr` and `en`, media folders match the seeded
  image paths, and the config has no em dash;
- `public/admin/index.html` carries `noindex` and the pinned Sveltia script
  with `integrity` and `crossorigin`, and `public/_headers` has the
  `/admin/*` block.

`tests/unit/content.test.ts` covers `hidden`, `order`,
`dropDanglingRelated`, `publishedProducts` and `compareProducts`.

The config was validated against the JSON schema shipped in the
`@sveltia/cms@0.256.1` npm package (`schema/sveltia-cms.json`) with ajv
(strict: an unknown option is rejected), last on 2026-11-08 after adding
the reviews collection and the iteration 3 settings; the unit test stays
offline and does not fetch it (it keeps an allow-list of option names for
the reviews collection instead). To repeat that check after a Sveltia upgrade:

```sh
mkdir -p /tmp/sveltia && cd /tmp/sveltia
curl -sSfL https://registry.npmjs.org/@sveltia/cms/-/cms-<version>.tgz | tar xz
```

then validate `public/admin/config.yml` against
`/tmp/sveltia/package/schema/sveltia-cms.json` with the repository's ajv
(`node_modules/.pnpm/ajv@*/node_modules/ajv`). `package/types/public.d.ts`
documents every option of that version; `package/locales/fr.json` holds the
French button names quoted in the owner guide.

## 4. Images

- Product photos: `src/assets/products/<file>.webp`, referenced in the French
  product file as `/src/assets/products/<file>.webp` (`PRODUCT_IMAGE_PATH`).
  `src/images.ts` resolves them with `import.meta.glob`, and `<Picture>`
  renders AVIF and WebP at responsive widths. The first image is the main one.
- CMS uploads: global `media_folder` and `public_folder` are both
  `/src/assets/products`, so the stored value is exactly the path the build
  resolves. The default media library converts every raster upload (JPEG,
  PNG, WebP, AVIF, HEIC) to WebP, quality 82, at most 1600 by 1600 px (the
  largest width of the `gallery` preset), then refuses a result over 2 MB:
  the limit applies after the conversion, so a 6 MB phone photo goes
  through. Files are named `{{slug}}-{{uuid_shorter}}` and slugified (ASCII,
  no accents), which keeps names inside `PRODUCT_IMAGE_PATH`.
- `choose_url: false` on every image field: an external URL would not
  resolve at build time.
- HEIC (iPhone): Safari decodes it natively. Other browsers decode it with a
  WebAssembly build of libheif that Sveltia imports from unpkg in a worker,
  and Sveltia's WebP encoder also falls back to WebAssembly. The admin CSP
  therefore allows `'wasm-unsafe-eval'` (WebAssembly compilation only, not
  `eval`). The owner guide still suggests the "Le plus compatible" camera
  format, which gives JPEG files every browser handles.
- Category images and the about-page section images live in
  `src/assets/brand/`; their CMS fields override `media_folder`,
  `public_folder` and the size (2000 px).
- A path to a missing file fails the build (`validateCatalog`, `hasAsset`).

## 5. Adding a field, end to end

Example: a translated `allergens` text on products.

1. **Schema.** Add it to `productTranslatedSchema` in `src/content/schemas.ts`
   (`text.optional()` if optional) and to `productTranslationSchema` as
   `optText`. `PRODUCT_TRANSLATED_KEYS` follows automatically, so
   `mergeProduct` merges it. A shared field goes into `productSharedSchema`
   instead and nowhere in the translation schema.
2. **Seed.** Fill it in every `products/fr/*.yml` (required fields must be
   present) and, translated, in `products/en/*.yml`.
3. **CMS.** Add the field to the `products` collection of
   `public/admin/config.yml` with a French `label` and a one-sentence `hint`
   with an example, at the place the owner would look for it:
   - translated: `i18n: true`, `required: [fr]` or `required: false`;
   - shared: `i18n: false`, `required: false` if the schema is optional;
   - nested object or list: the same rules for each subfield.
4. **Tests.** `pnpm test` fails in `cms-config.test.ts` until steps 1 and 3
   agree, and in `content.test.ts` until the seed files validate. Add a
   content assertion if the value matters (as for the barley gluten rule).
5. **Rendering.** Read it from the `Product` returned by `loadProduct` in the
   component; English pages already receive the French fallback.
6. **Owner guide.** If Marie edits it, add a line to
   `docs/guide-proprietaire.md`.

For pages, extend the page schema in `PAGE_SCHEMAS`, both page files, and the
matching `files:` entry of the `pages` collection. For settings, extend
`settingsSchema`, `shop.yml` and the `shop` singleton.

## 6. Launch-check placeholders

`pnpm launch-check` (`scripts/launch-check.mjs`) fails until:

- `brand.siret` is 14 digits with a valid Luhn checksum (CMS: Réglages de
  la boutique, Entreprise et coordonnées, Numéro SIRET). While empty, the
  legal pages print "en cours d'immatriculation". The legal tokens `{siren}`
  (first 9 digits, grouped by 3) and `{siret}` (grouped 3 3 3 5) come from
  it.
- `launch.pricesConfirmed` is `true` (CMS: Réglages de la boutique,
  Lancement, Prix confirmés). The seed prices are placeholders from the spec appendix.
- no line of a legal text contains `TODO` (publication director in the legal
  notice, consumer mediator in the terms of sale).

Other owner inputs are visible in the content but not gated: origins marked
"owner to confirm" (hibiscus, souchet tubercules), `nutritionVerified: false`
on four products, the about and home story texts. The CMS editor shows none of
the YAML comments, so `docs/client/presentation.md` lists them for Marie.

Home page fields (`pages/{fr,en}/home.yml`): `hero.eyebrow` is the brand
slogan, printed as the small italic line above the H1 and reused as the
title of the "Notre histoire" closing band; `hero.title` is the H1 and names
what the shop sells, in one colour; `hero.cta.secondary` is a plain text link
to "Notre histoire", not a second button. `storyLands.from` lists the
countries of the product `origin` fields (the part before any comma), each
named in `storyBody` too: a unit test fails when a product origin is missing
in either locale, so a new origin means a new land and a sentence in the
story.

## 7. Admin page and CSP

`public/_headers` keeps the strict global policy and appends an `/admin/*`
block that first detaches the global `Content-Security-Policy` (`!` line),
then sets its own, and adds `X-Robots-Tag: noindex`. Hosts and why:

| Directive     | Host                                                  | Why                                                                                                                               |
| ------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `script-src`  | `https://unpkg.com`, `'wasm-unsafe-eval'`             | The pinned `sveltia-cms.js` (integrity checked), the helper packages it imports after sign-in, and their WebAssembly image codecs |
| `connect-src` | `https://unpkg.com`                                   | Sveltia's French locale file and version check                                                                                    |
| `connect-src` | `https://api.github.com`, `https://github.com`        | Content, commits, uploads                                                                                                         |
| `connect-src` | `https://www.githubstatus.com`                        | GitHub status banner                                                                                                              |
| `connect-src` | `https://*.workers.dev`                               | Sveltia Authenticator Worker                                                                                                      |
| `connect-src` | `https://api.openai.com`, `https://api.anthropic.com` | Optional machine translation, unused unless a key is entered                                                                      |
| `connect-src` | `data:`, `blob:`                                      | Sveltia fetches its own inline logo and local file previews                                                                       |
| `font-src`    | `https://cdn.jsdelivr.net`                            | Sveltia's interface fonts and icon font                                                                                           |
| `img-src`     | `data:`, `blob:`, `*.githubusercontent.com`           | Thumbnails of repository images, user avatar                                                                                      |
| `frame-src`   | `https://*.workers.dev`                               | Authenticator                                                                                                                     |

Verified on 2026-11-01 with `node scripts/relay-capture.mjs admin`
(`docs/deployment.md`, section 11.2), which serves `dist/` with the
`/admin/*` headers applied (`astro preview` ignores `_headers`): the page
reaches the Sveltia sign-in screen with no CSP violation, the pinned script
passing its integrity check. After a "Refused to ..." message in the browser
console on `/admin/`, run it again and update the block.

`script-src` allows the whole `https://unpkg.com` host on purpose: after
sign-in Sveltia imports optional libraries from other unpkg packages (a dayjs
locale, `exifr`, the `@jsquash` image encoders used for the WebP conversion
when the browser cannot encode WebP itself, `pdfjs-dist`, `svgo`, `turndown`,
a HEIC decoder). Restricting the directive to the Sveltia folder made those
imports fail silently (English date formatting, image conversion falling back
to the browser encoder), so the host stays allowed; the main script itself is
pinned by version and integrity in `public/admin/index.html`, and the admin
page is only ever opened by the owner. Not verified after sign-in yet (the
Authenticator is not deployed).

Two of those helpers are WebAssembly: the HEIC decoder (`@discourse/heic`,
run in a `blob:` module worker) and the `@jsquash` WebP encoder fallback.
Compiling WebAssembly needs `'wasm-unsafe-eval'` in `script-src`, which the
block does not grant. Consequences: a HEIC photo uploaded from a browser
other than Safari is refused as invalid (Safari decodes HEIC natively), and a
browser without a native WebP encoder (none of the current ones) could not
convert. Adding `'wasm-unsafe-eval'` to the admin `script-src` would lift
both; it was left out pending a decision, as the owner guide routes iPhone
photos through Safari or the "Le plus compatible" format.

### Upgrading Sveltia

1. Pick the version on https://www.npmjs.com/package/@sveltia/cms and read
   its release notes.
2. Download it and compute its hash:
   `curl -sSfL https://unpkg.com/@sveltia/cms@<version>/dist/sveltia-cms.js | openssl dgst -sha384 -binary | openssl base64 -A`.
3. In `public/admin/index.html`, set the version in `src` and the new value
   in `integrity="sha384-..."`. In `public/_headers`, `/admin/*` block, set
   the same version in `script-src https://unpkg.com/@sveltia/cms@<version>/`.
   `pnpm test` and `pnpm test:build` fail when the two disagree.
4. `pnpm build`, then `node scripts/relay-capture.mjs admin`: `/admin/`
   must reach the sign-in screen with zero CSP violation (a wrong hash shows
   up as a blank page and an integrity error in the report). Sign in once on
   a preview deploy and open a product before merging.

## 8. Customer reviews

Spec: section 2.1 of
`docs/superpowers/specs/2026-11-08-iteration-3-features-design.md`.

**Files.** One YAML file per review in `src/content/reviews/`, no locale
folder: each review carries its own `locale`. The Astro collection globs
`*.yml` there, so the file name only matters to humans and to uniqueness.
The folder always holds `exemple--modele.yml`, a model review that shows the
shape of a file and keeps Astro from warning about an empty collection on
every page. It cannot appear on the site: its `product` is `exemple`, not a
catalogue slug, and only reviews of a catalogue product are published. In
the CMS it shows as the entry "Exemple"; leave it as it is.

- Written by the Worker (`POST /api/reviews`, GitHub Contents API, commit
  `content: avis client sur <product slug>`):
  `<product slug>--<order number>.yml`, with `verified: true`,
  `published: false` and the order number in `order`. One review per product
  per order, so the name is unique.
- Created by the owner in the CMS (a review received on Instagram or at a
  market): the slug template `{{product}}--{{year}}-{{month}}-{{day}}-{{author}}`
  gives `fleurs-d-hibiscus-100g--2026-11-08-aissatou.yml`. The order number
  is usually empty, and Sveltia replaces an empty tag with a random ID, so
  the date and the author name the file instead. Sveltia slugifies each tag
  value and keeps the literal `--`. Two reviews of one product by the same
  author on the same day get the same base name: write the second author
  slightly differently (for example "Awa D.").
- `slug.editable: false`: no slug editor, and saving an existing review
  keeps its file name whatever it is (Sveltia lists every `.yml` of the
  folder and never renames on save).

**Fields** (`reviewSchema`, CMS order):

| Key         | CMS widget                                | Notes                                                                        |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `product`   | `relation` to `products`, `{{slug}}`      | French product file name; display `{{name}} ({{weightGrams}} g)`             |
| `rating`    | `number`, int, 1 to 5                     |                                                                              |
| `author`    | `string`, 2 to 40 characters              | first name or pseudonym                                                      |
| `title`     | `string`, optional, 80 characters at most | omitted when empty, the schema defaults it to `''`                           |
| `text`      | `text`, 20 to 1200 characters             |                                                                              |
| `published` | `boolean`, default `false`                | the moderation switch: nothing is shown before the owner ticks it            |
| `reply`     | `text`, optional                          | public answer, shown under the review                                        |
| `date`      | `datetime`, `type: date`, `YYYY-MM-DD`    | default `{{now}}` for a review created in the CMS                            |
| `locale`    | `select` fr / en, default fr              | the language the review is written in                                        |
| `order`     | `string`, optional                        | order number from the invitation, empty otherwise                            |
| `verified`  | `boolean`, default `false`, read-only     | set by the Worker only; a review typed in the CMS can never claim a purchase |

**Moderation.** The list summary is `{{author}}, {{rating}}/5, {{product}}`
plus " (à relire)" while unpublished; it sorts newest first by `date` and
filters "À relire (non publiés)", "Publiés" and "Achats vérifiés"; it groups
by product. Publishing is a save, so a published review is online about two
minutes later, like any content change. `settings.reviews.enabled: false`
hides every review section of the site without touching the files. Reviews
of a hidden product are not shown. Deleting a review in the CMS deletes the
file; the Stripe session keeps its `reviewed_<sku>` mark, so the customer
cannot post the same review again.
