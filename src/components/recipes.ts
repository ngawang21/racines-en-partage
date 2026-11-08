// Build-time list of the recipes printed on the labels (spec 2.8): the
// recipes page renders it and Seo.astro turns it into `Recipe` JSON-LD.
import { getImage } from 'astro:assets';
import { SITE, type Locale } from '../consts';
import type { Product, Recipe } from '../content/schemas';
import { loadProducts } from '../i18n/locale';
import { routeUrl } from '../i18n/routing';
import { resolveAsset } from '../images';
import type { RecipeGraph } from '../seo/graph';

export interface RecipeEntry {
  product: Product;
  recipe: Recipe;
}

/** Every shown product that carries a recipe, in catalogue order. */
export async function loadRecipes(locale: Locale): Promise<RecipeEntry[]> {
  return (await loadProducts(locale))
    .filter((p): p is Product & { recipe: Recipe } => p.recipe !== undefined)
    .map((product) => ({ product, recipe: product.recipe }));
}

/** The `Recipe` graph input of the recipes page, images as absolute 1200 px WebP URLs. */
export async function recipeGraphInputs(locale: Locale): Promise<RecipeGraph[]> {
  const entries = await loadRecipes(locale);
  return Promise.all(
    entries.map(async ({ product, recipe }) => {
      const src = resolveAsset(product.images[0]!);
      const image = await getImage({ src, width: Math.min(1200, src.width), format: 'webp' });
      return {
        name: recipe.title,
        url: `${routeUrl('product', locale, product.slug)}#recipe`,
        images: [new URL(image.src, SITE.url).href],
        ingredients: recipe.ingredients ?? [],
        steps: recipe.steps,
        productName: product.name,
      };
    }),
  );
}
