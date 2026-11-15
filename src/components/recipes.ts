// Build-time helpers of the recipe pages, cards and the home ritual: which
// picture a recipe shows, and the absolute image URLs of its `Recipe` node.
import { getImage } from 'astro:assets';
import { SITE, type Locale } from '../consts';
import type { Product, RecipeEntry } from '../content/schemas';
import { formatMinutes } from '../i18n/format';
import { detailAsset, resolveAsset } from '../images';

/**
 * The picture of a recipe: its own photo (the dish once made), else the
 * close-up of its product's contents (a 2:1 strip cut through the pouch
 * window) when that file exists, else none.
 */
export function recipePicture(
  recipe: Pick<RecipeEntry, 'image'>,
  product: Pick<Product, 'images'> | undefined,
): { src: string; kind: 'photo' | 'detail' } | undefined {
  if (recipe.image) return { src: recipe.image, kind: 'photo' };
  const detail = product?.images[0] ? detailAsset(product.images[0]) : undefined;
  return detail ? { src: detail, kind: 'detail' } : undefined;
}

/** Preparation, cooking and rest together, as the cards print it ("20 min"). */
export function totalTime(recipe: RecipeEntry, locale: Locale): string {
  return formatMinutes(
    recipe.prepMinutes + (recipe.cookMinutes ?? 0) + (recipe.restMinutes ?? 0),
    locale,
  );
}

/**
 * Absolute 1200 px WebP URL of the recipe photo, else of the product's main
 * photo: Google requires an image on a Recipe, and the pouch is the truth
 * until the owner photographs the dish.
 */
export async function recipeImageUrls(
  recipe: Pick<RecipeEntry, 'image'>,
  product: Pick<Product, 'images'>,
): Promise<string[]> {
  const src = resolveAsset(recipe.image ?? product.images[0]!);
  const image = await getImage({ src, width: Math.min(1200, src.width), format: 'webp' });
  return [new URL(image.src, SITE.url).href];
}
