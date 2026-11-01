// Locale merging of spec section 4: shared fields from the French file only,
// translated fields from the locale file with French filling every gap.
// Pure (no Astro import) so vitest covers it.
import { z } from 'zod';
import { deepFallback } from '../i18n/fallback';
import {
  CATEGORY_TRANSLATED_KEYS,
  PAGE_SCHEMAS,
  PRODUCT_TRANSLATED_KEYS,
  categorySchema,
  categoryTranslatedSchema,
  categoryTranslationSchema,
  productSchema,
  productTranslatedSchema,
  productTranslationSchema,
  type Category,
  type PageContent,
  type PageKey,
  type Product,
} from './schemas';

/** schema.parse with the file named in the error, readable in a build log. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown, where: string) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid content in ${where}:\n${z.prettifyError(result.error)}`);
  }
  return result.data as z.output<S>;
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** French product, or the English one when `enRaw` is given (it may be partial). */
export function mergeProduct(slug: string, frRaw: unknown, enRaw?: unknown): Product {
  const fr = parseOrThrow(productSchema, frRaw, `products/fr/${slug}.yml`);
  if (enRaw === undefined) return { ...fr, slug };
  const en = parseOrThrow(productTranslationSchema, enRaw ?? {}, `products/en/${slug}.yml`);
  const merged = deepFallback(en as unknown, pick(fr, PRODUCT_TRANSLATED_KEYS) as unknown);
  const translated = parseOrThrow(
    productTranslatedSchema,
    merged,
    `products/en/${slug}.yml (after French fallback)`,
  );
  return { ...fr, ...translated, slug };
}

export function mergeCategory(slug: string, frRaw: unknown, enRaw?: unknown): Category {
  const fr = parseOrThrow(categorySchema, frRaw, `categories/fr/${slug}.yml`);
  if (enRaw === undefined) return { ...fr, slug };
  const en = parseOrThrow(categoryTranslationSchema, enRaw ?? {}, `categories/en/${slug}.yml`);
  const merged = deepFallback(en as unknown, pick(fr, CATEGORY_TRANSLATED_KEYS) as unknown);
  const translated = parseOrThrow(
    categoryTranslatedSchema,
    merged,
    `categories/en/${slug}.yml (after French fallback)`,
  );
  return { ...fr, ...translated, slug };
}

export function mergePage<K extends PageKey>(
  key: K,
  frRaw: unknown,
  enRaw?: unknown,
): PageContent<K> {
  const schema = PAGE_SCHEMAS[key];
  const fr = parseOrThrow(schema, frRaw, `pages/fr/${key}.yml`);
  if (enRaw === undefined) return fr as PageContent<K>;
  return parseOrThrow(
    schema,
    deepFallback(enRaw ?? {}, fr as unknown),
    `pages/en/${key}.yml (after French fallback)`,
  ) as PageContent<K>;
}
