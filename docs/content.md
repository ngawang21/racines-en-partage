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
| `settings/shop.yml`        | `settingsSchema`                                                    | none                           | `loadSettings`                |
| `locales/{fr,en}.json`     | `localeSchema` (`src/content/locale-schema.ts`)                     | `deepFallback`                 | `loadLocale`                  |

Always read content through the loaders of `src/i18n/locale.ts`, never with
`getCollection`: the loaders apply the strict schemas, the French fallback and
the cross-file checks (`validateCatalog`: unique SKU and slug, known category,
existing related slugs and image files).

## 2. The French shared-field merge

The French file is complete and authoritative. The English file holds
translations only.

- **Shared fields** (products: `sku`, `category`, `price`, `weightGrams`,
  `origin`, `originCountryCode`, `images`, `stock`, `featured`,
  `nutritionVerified`, `nutrition`, `free_from`, `related`; categories:
  `order`, `image`) are read from the French file only. Whatever the English
  file says about them is ignored, so the two locales can never disagree on a
  price or a stock status.
- **Translated fields** (`PRODUCT_TRANSLATED_KEYS`, `CATEGORY_TRANSLATED_KEYS`,
  derived from the translated schemas) come from the English file, and every
  gap is filled from French by `deepFallback` (`src/i18n/fallback.ts`): a
  missing key, `null`, an empty or blank string and an empty array all fall
  back. Arrays of objects fall back item by item, by index.
- **Pages** have no shared/translated split: the whole English page is
  `deepFallback(en, fr)`. Fields that are not text (`recipeProducts`, the
  reassurance `icon`, the about `image`) may simply be left out of the English
  file.
- The merged English value is validated again with the strict schema
  (`... (after French fallback)` in the error message).

Nutrition values are shared and written as printed on the French label
("3,0 g"); English pages pass them through `localiseNutrition`.

## 3. How the CMS maps to the model

`public/admin/config.yml`, loaded by `public/admin/index.html` (Sveltia from
unpkg, unpinned; the config's first line points at the JSON schema for editor
completion).

| Model                              | CMS                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{fr,en}` folders                  | Global `i18n.structure: multiple_folders`, `default_locale: fr`. Entry collections use `folder: src/content/<name>`; file collections use `{{locale}}` in `file:` and need `i18n: true` on the collection and on each file.                                 |
| Shared field                       | `i18n: duplicate`: editable in French, read-only copy in English. The copy is written into the English file, where the build ignores it (tested in `content.test.ts`, "ignores shared fields written in the English file").                                 |
| Translated field                   | `i18n: true` and `required: [fr]` (or `false` when optional): required in French only, so a blank English value is allowed and falls back. Subfields of a translated object or list need their own `i18n: true` (Sveltia defaults them to `false`).         |
| Optional field (`.optional()`)     | `required: false`. The global `output.omit_empty_optional_fields: true` leaves it out of the file when empty. Without it the CMS would write `''`, which `text.optional()` refuses in the French file.                                                      |
| Slug = file name = URL             | Products: `slug.template: '{{name}}-{{weightGrams}}g'` with `editable: [create]`, so a new product gets `poudre-de-moringa-100g` and the slug can never change afterwards (no broken URL, no broken `related`). Categories: `{{name}}`, editable on create. |
| References                         | `category`, `related` and the home `recipeProducts` are `relation` fields with `value_field: '{{slug}}'` (the file name; `slug` without braces would mean a field called `slug`, which does not exist).                                                     |
| Enums                              | `select` options with French labels and the schema values (`STOCK`, `FREE_FROM`, `REASSURANCE_ICONS`, `SHIPPING_METHODS`, VAT modes).                                                                                                                       |
| Settings labels `{ fr, en }`       | `object` with two `string` subfields, `en` optional (empty falls back to `fr` through `pickLabel`). The singleton has no i18n.                                                                                                                              |
| `shop.currency` (`literal('eur')`) | `hidden` field with `default: eur`.                                                                                                                                                                                                                         |
| Legal Markdown                     | File collection, `format: frontmatter`, `body` as `richtext` with the full toolbar; `updated` is a `datetime` (`YYYY-MM-DD`, `auto_now`).                                                                                                                   |

Other choices in the config:

- `publish_mode: simple`: no drafts, every save commits to `main`.
- `commit_messages` produce one-line conventional commits
  (`content: update products poudre-de-moringa-100g`).
- `categories` has `delete: false`: a category with products cannot go, and an
  empty one is rare enough to be a developer task.
- `shipping` has `allow_add` and `allow_remove` off and a read-only `id`: a new
  method needs Worker and checkout code, not just content.
- `editor.preview: false`: a YAML preview is useless, and the second pane can
  show the other locale side by side.
- A CMS save rewrites the whole file: YAML comments (for example the
  `# placeholder` notes on prices) are lost, keys follow the field order of the
  config, and `8.90` becomes `8.9`. Sveltia writes YAML with `lineWidth: 0`,
  plain scalars and single quotes; a simulation over every seed file passes
  `prettier --check` unchanged.

### Known limits

- `shop.freeShippingFrom` is `nullable()` in the schema ("null disables"), but
  an empty number field is left out of the file, not written as `null`, so the
  CMS keeps it required. To offer free shipping never, set `null` by hand or
  make the schema `.nullish()`.
- Deleting a product that another product lists in `related`, or that the home
  page lists in `recipeProducts`, fails the build (unknown related product).
  The owner guide tells Marie to remove those references first, or to mark the
  product out of stock instead.
- The legal texts go through Sveltia's rich text editor: on the first save it
  may restyle the Markdown (list markers, emphasis). The rendered page is the
  same. The `{company}`-style tokens are plain text to the editor and survive.
- The CMS UI language follows the browser; French is available.

### Tests

`tests/unit/cms-config.test.ts` parses `public/admin/config.yml` and checks:

- the CMS field names equal the zod schema keys for products, categories,
  every page, legal frontmatter (plus `body`) and settings, recursively
  through objects and lists of objects;
- the `required` flag matches the schema (required in French, optional when the
  schema says `optional()` or `default()`), with one documented exception
  (`shop.freeShippingFrom`);
- `i18n: duplicate` is set on exactly the shared fields and `i18n: true` on
  exactly the translated ones, translated leaf fields are never required in
  English, and translated subfields declare `i18n: true`;
- select options equal the schema enums and contain every seeded value; the
  category view filters match the seeded categories;
- the product slug template reproduces every existing file name;
- every `file:` path exists for `fr` and `en`, media folders match the seeded
  image paths;
- `public/admin/index.html` carries `noindex` and the Sveltia script, and
  `public/_headers` has the `/admin/*` block.

The config was also validated once against the published Sveltia JSON schema
(`https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json`, version 0.256.1)
with ajv; the unit test stays offline and does not fetch it. To repeat that
check after a Sveltia upgrade, point the `yaml-language-server` line at the
schema in an editor, or run ajv against it.

## 4. Images

- Product photos: `src/assets/products/<file>.webp`, referenced in the French
  product file as `/src/assets/products/<file>.webp` (`PRODUCT_IMAGE_PATH`).
  `src/images.ts` resolves them with `import.meta.glob`, and `<Picture>`
  renders AVIF and WebP at responsive widths. The first image is the main one.
- CMS uploads: global `media_folder` and `public_folder` are both
  `/src/assets/products`, so the stored value is exactly the path the build
  resolves. The default media library converts every raster upload to WebP,
  quality 85, at most 2048 by 2048 px, refuses files over 2 MB, and slugifies
  the file name (ASCII, no accents), which keeps names inside
  `PRODUCT_IMAGE_PATH`.
- Category images and the about-page section images live in
  `src/assets/brand/`; their CMS fields override `media_folder` and
  `public_folder` with `/src/assets/brand`.
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
   `public/admin/config.yml` with a French `label` and a `hint`:
   - translated: `i18n: true`, `required: [fr]` or `required: false`;
   - shared: `i18n: duplicate`, `required: false` if the schema is optional;
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

- `brand.siren` is 9 digits (CMS: Réglages, Entreprise, Numéro SIREN). While
  empty, the legal pages print "en cours d'immatriculation".
- `launch.pricesConfirmed` is `true` (CMS: Réglages, Lancement, Prix
  confirmés). The seed prices are placeholders from the spec appendix.
- no line of a legal text contains `TODO` (publication director in the legal
  notice, consumer mediator in the terms of sale).

Other owner inputs are visible in the content but not gated: origins marked
"owner to confirm" (hibiscus, souchet tubercules), `nutritionVerified: false`
on four products, the about and home story texts. The CMS editor shows none of
the YAML comments, so `docs/client/presentation.md` lists them for Marie.

## 7. Admin page and CSP

`public/_headers` keeps the strict global policy and appends an `/admin/*`
block that first detaches the global `Content-Security-Policy` (`!` line),
then sets its own, and adds `X-Robots-Tag: noindex`. Hosts and why:

| Directive     | Host                                                  | Why                                                          |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `script-src`  | `https://unpkg.com`                                   | `sveltia-cms.js` (redirects to the current version)          |
| `connect-src` | `https://unpkg.com`                                   | Sveltia's French locale file and version check               |
| `connect-src` | `https://api.github.com`, `https://github.com`        | Content, commits, uploads                                    |
| `connect-src` | `https://www.githubstatus.com`                        | GitHub status banner                                         |
| `connect-src` | `https://*.workers.dev`                               | Sveltia Authenticator Worker                                 |
| `connect-src` | `https://api.openai.com`, `https://api.anthropic.com` | Optional machine translation, unused unless a key is entered |
| `connect-src` | `data:`, `blob:`                                      | Sveltia fetches its own inline logo and local file previews  |
| `font-src`    | `https://cdn.jsdelivr.net`                            | Sveltia's interface fonts and icon font                      |
| `img-src`     | `data:`, `blob:`, `*.githubusercontent.com`           | Thumbnails of repository images, user avatar                 |
| `frame-src`   | `https://*.workers.dev`                               | Authenticator                                                |

Verified on 2026-11-01 in headless Chromium with the `/admin/*` headers
applied by a small local server (`astro preview` ignores `_headers`): the
page reaches the Sveltia sign-in screen in French ("Se connecter avec
GitHub") with no CSP violation and no configuration error in the console.
After a Sveltia upgrade or a "Refused to ..." message in the browser console
on `/admin/`, repeat that check and update the block.
