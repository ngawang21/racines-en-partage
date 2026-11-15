# Iteration 4: recipes with their own pages, sharper photographs, Facebook

Date: 2026-11-15. Follows four independent reviews (6.5, 7.5, 7.8, 7.5 out
of 10; reports under `out/review/`, local). They agree on what is left: the
site is correct and fast, and still thin where a visitor decides to buy a
plant they do not know. This iteration adds what can be written and cut
from what already exists, without waiting for the owner's new photographs.

The owner's request (2026-11-15): link her Facebook page; write what can be
written from clear public knowledge (recipes, usage); use everything in
`thinking/rachines-en-partage` to raise the quality.

## 1. What changes

1. **Facebook** (done by the lead before this spec): `settings.brand.facebook`,
   round icon links in the footer, a card on the contact page, an entry in
   the phone menu, `sameAs` in the structured data.
2. **Recipes become content with their own pages.** One file per recipe,
   one page per recipe (`/recettes/<slug>/`, `/en/recipes/<slug>/`), with
   `Recipe` structured data. Every product gets at least one recipe. The
   five label recipes move out of the product files; new "house" recipes
   are written from public culinary knowledge and marked for the owner's
   validation.
3. **Photographs from the owner's originals.** The 16 originals are
   2000 x 3000; the site used 1067 x 1600. Re-export sharper, cut one
   close-up of the contents per product through the pouch window, add a
   larger view on the product page.
4. **FAQ and usage content** written where the facts are public and
   checkable: taste, how to use, names, storage, the difference between
   formats and between tubers and powder.

Out of scope: new photography (owner), reviews (customers), legal names,
the domain e-mail, English slugs.

## 2. Recipes

### 2.1 Content model

`src/content/recipes/{fr,en}/<slug>.yml`, the same split as products: the
French file is complete, the English file holds translated fields only and
falls back field by field. The slug is the file name, the same in both
locales (French words, like product slugs).

Schemas are in `src/content/schemas.ts` (already added):
`recipeSharedSchema` (`order`, `hidden`, `product`, `source`, `prepMinutes`,
`cookMinutes`, `restMinutes`, `image`), `recipeTranslatedSchema` (`title`,
`summary`, `yield`, `ingredients`, `steps`, `tips`, `imageAlt`, `seoTitle`,
`seoDescription`), `recipeEntrySchema`, `recipeTranslationSchema`, types
`RecipeEntry`.

- `source: label` means the recipe is printed on the pouch: its ingredients
  and steps keep the label's words. `source: house` means written for the
  site; the page says so ("Recette de la maison") and
  `docs/client/recettes-a-valider.md` lists each one with its references
  for the owner.
- `product` is the slug of the product the recipe uses. A product with two
  formats is referenced by its lightest format.
- No health or nutrition claim anywhere in a recipe (EU regulation
  1924/2006, the repository rule). Taste, texture, gesture, time, origin of
  the dish. Safety instructions that are plain cooking sense are allowed
  (psyllium is always taken with a large glass of water, as its label
  says).
- The five label recipes are already migrated by the lead
  (`infusion-de-bissap`, `boisson-fraiche-au-baobab`, `smoothie-au-moringa`,
  `horchata-de-souchet`, `chocolat-chaud-maison`). The `recipe` object
  leaves the product schema and the product files.

### 2.2 Loading and pure helpers

- `src/content.config.ts`: a `recipes` collection, loose schema like
  products.
- `src/i18n/locale.ts`: `loadRecipes(locale)` (visible recipes, typeset in
  French, sorted by `order` then title; a recipe whose product is unknown
  or hidden is dropped with one build warning), `loadRecipe(locale, slug)`.
- `src/content/merge.ts`: `mergeRecipe(slug, fr, en?)`, `recipesFor(productSlug,
  recipes, families)` (the recipes of a product, any of its formats; label
  recipes first), `publishedRecipes`.
- `src/content/schemas.ts` `validateCatalog`-style check: every recipe's
  product exists; unit tests parse every file strictly in both locales.

### 2.3 Routes and pages

- `src/i18n/routing.ts`: route key `recipe`, `/recettes/[slug]/` and
  `/en/recipes/[slug]/`, in `SLUG_ROUTES`, indexable, alternates in the
  sitemap.
- `/recettes/` (existing page): every recipe as a card (kicker: the
  product name; title; summary; time; "Recette de l’étiquette" or "Recette
  de la maison"), the card linking to the recipe page. The picture of a
  card is the recipe `image` when set, else the product's contents
  close-up (section 3) when it exists, else none.
- Recipe page: breadcrumb, title, summary, a facts row (preparation,
  cooking, rest, yield), ingredients, numbered steps, tips, then "Le
  produit de cette recette" (the product card with its add button) and up
  to three other recipes. One picture at the top: recipe `image`, else the
  contents close-up as a wide band. `Recipe` JSON-LD: `name`,
  `description`, `recipeIngredient`, `recipeInstructions` (`HowToStep`),
  `prepTime`, `cookTime`, `totalTime` (ISO 8601), `recipeYield`, `image`
  (recipe image, else the product image), `author` (the shop), `inLanguage`,
  `keywords`, plus the breadcrumb list.
- Product page: the "Petite recette" accordion (`id="recipe"` stays) shows
  the product's first recipe (label first) with its ingredients and steps
  and a link to its page; the product's other recipes follow as links.
- Home: the ritual band's three moments link to recipe pages
  (`ritual[].recipe`, a recipe slug, replaces `ritual[].product`); each
  moment shows the contents close-up of its product when it exists.
- Search: recipes are searchable (title, product name); results list them
  under the products, at most three.
- CMS: a `recipes` folder collection in Sveltia with the products'
  i18n structure, French labels and hints; the parity test covers it.
  `ritual.recipe` is a relation to it. The product `recipe` object and its
  CMS field are removed.

### 2.4 The recipes to write

At least one per product, about fourteen in all. The label ones exist;
the house ones are written by the content writer from public culinary
knowledge, with proportions cross-checked on at least two sources each,
listed in `docs/client/recettes-a-valider.md`:

| Product | Label recipe | House recipes to write |
| --- | --- | --- |
| Fleurs d’hibiscus | Infusion de bissap | Jus de bissap (the cold West-African drink, with mint and vanilla or orange blossom) |
| Poudre de baobab | Boisson fraîche au baobab | Jus de bouye (the Senegalese baobab drink, with milk), yaourt au baobab et au miel |
| Poudre de moringa | Smoothie au moringa | One savoury use (a sauce, an omelette or a dip) |
| Tubercules de souchet | Horchata de souchet | (none needed) |
| Poudre de souchet | none | Porridge or pancakes with tiger nut powder |
| Poudre de cacao | Chocolat chaud maison | One baking or breakfast use |
| Grués de cacao | none | Granola or a topping |
| Poudre d’orge grillée | none | Tsampa the Tibetan way (with hot tea or milk), one more |
| Téguments de psyllium | none | One baking use (binder), with the water instruction |

## 3. Photographs

Source: `thinking/rachines-en-partage/shared product photos/` (outside the
repository; the derived files are committed, the originals are not).

- Re-export every product, duo and trio photograph from its original at
  1600 px wide (WebP, quality 82), same file names, same framing, so the
  content files and `POUCH_BOXES` stay valid (verify the boxes).
- One contents close-up per product photograph: a 2:1 strip cut inside the
  pouch window (the flowers, the nibs, the powder), no label text in the
  frame, at `src/assets/products/detail/<same file name>`.
  `detailAsset(productImage)` in `src/images.ts` (already added) returns
  its path when the file exists.
- No label close-up: the printed labels still carry claims and an e-mail
  address the site does not repeat (`docs/client/presentation.md`).
- Product gallery: a larger view. Activating the main photograph opens a
  dialog with the photograph at up to its exported size, keyboard and
  touch friendly, Escape closes, focus returns, no dependency, CSP safe.
- The 200 g baobab still shows the 100 g pouch: an optional translated
  product field `imageNote`, printed under the gallery ("Photo du sachet
  de 100 g ; le 200 g est le même, en plus grand."), set on that product
  only.
- `pnpm og` after the photographs change.

## 4. FAQ and usage

New questions in `src/content/pages/{fr,en}/faq.yml`, grouped after the
delivery and payment ones: what each product tastes like and how to start;
the names of bissap; tubers versus powder; cacao powder versus nibs; what
tsampa is; how to store; the allergen facts that are simply true (barley
contains gluten; tiger nut is a tuber). No health claim, no advice that
belongs to a doctor.

## 5. Work split (file ownership)

| Worker | Owns |
| --- | --- |
| Lead | this spec, `schemas.ts` recipe schemas, `images.ts`, the five label recipe files, Facebook, merge, gates, reviews |
| J, recipes feature | `content.config.ts`, `i18n/locale.ts`, `i18n/routing.ts`, `content/merge.ts`, `content/schemas.ts` (removal of the product `recipe`, `imageNote`, `ritual.recipe`), `seo/graph.ts`, `pages/recettes/**`, `pages/en/recipes/**`, `views/RecipesView`, new `views/RecipeView`, `RecipeCards`, `views/ProductView`, `views/HomeView`, `RitualBand`, `search/**`, `scripts/search.ts`, `SearchDialog`, `catalog/build.ts` if the search needs it, product YAML files (removing `recipe`, adding `imageNote`), `pages/{fr,en}/home.yml` (ritual), `public/admin/config.yml`, locale strings, `tests/unit/**`, `tests/build/**`, `tests/e2e/a11y.spec.ts`, `docs/content.md`, `CLAUDE.md` |
| K, content | `src/content/recipes/{fr,en}/*.yml` (new files and the summaries of the five label ones), `src/content/pages/{fr,en}/faq.yml`, `docs/client/recettes-a-valider.md` |
| L, photographs | `src/assets/products/**`, `src/assets/brand/*.webp` (photographs only), `components/Gallery.astro`, `GalleryScript.astro`, `components/Picture.astro`, `components/storefront.ts` (`POUCH_BOXES` only), `tests/e2e/gallery.spec.ts` (new), `src/assets/brand/README.md` |

Gates at the end, run by the lead: `pnpm check`, `pnpm test`,
`pnpm test:worker`, `pnpm build`, `pnpm test:build`, `pnpm e2e`.
