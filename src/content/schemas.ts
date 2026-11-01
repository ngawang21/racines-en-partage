// Content model of spec section 4. Pure zod, no Astro import: vitest validates
// the seed files with these schemas, and src/content.config.ts reuses them.
import { z } from 'zod';

export const STOCK = ['in_stock', 'low', 'out'] as const;
export type Stock = (typeof STOCK)[number];

/** Values of `free_from`; labels per locale live in the `product.freeFromLabels` strings. */
export const FREE_FROM = ['additifs', 'conservateurs', 'colorants', 'gluten'] as const;
export type FreeFrom = (typeof FREE_FROM)[number];

export const SHIPPING_METHODS = ['relay', 'home', 'pickup'] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

/** Icon keys a home reassurance item may use (all exist in Icon.astro). */
export const REASSURANCE_ICONS = ['leaf', 'truck', 'pin', 'lock', 'shield', 'flower'] as const;

export const PRODUCT_IMAGE_PATH = /^\/src\/assets\/products\/[\w.-]+\.(webp|png|jpe?g)$/;
export const ASSET_IMAGE_PATH = /^\/src\/assets\/[\w./-]+\.(webp|png|jpe?g|svg)$/;

const text = z.string().trim().min(1);
const textList = z.array(text);
/** Translation side: anything may be empty or missing, French fills the gap. */
const optText = z.string().nullish();
const optList = z.array(z.string()).nullish();

/** Two decimals at most, strictly positive. */
const euros = z
  .number()
  .positive()
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'at most 2 decimals');

// ---------------------------------------------------------------- products

export const nutritionSchema = z.object({
  energy: text,
  fat: text,
  saturates: text,
  carbs: text,
  sugars: text,
  fibre: text,
  protein: text,
  salt: text,
});
export type Nutrition = z.infer<typeof nutritionSchema>;

export const recipeSchema = z.object({
  title: text,
  ingredients: textList.optional(),
  steps: textList.min(1),
});
export type Recipe = z.infer<typeof recipeSchema>;

/** Shared fields: read from the French file only. */
export const productSharedSchema = z.object({
  sku: z.string().regex(/^[A-Z0-9][A-Z0-9-]*$/, 'upper case letters, digits and dashes'),
  category: text,
  price: euros,
  weightGrams: z.number().int().positive(),
  origin: text,
  originCountryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2')
    .optional(),
  images: z.array(z.string().regex(PRODUCT_IMAGE_PATH, '/src/assets/products/<file>')).min(1),
  stock: z.enum(STOCK),
  featured: z.boolean().default(false),
  nutritionVerified: z.boolean().default(false),
  nutrition: nutritionSchema.optional(),
  free_from: z.array(z.enum(FREE_FROM)).default([]),
  related: z.array(text).default([]),
});

/** Translated fields, complete (French file, or English after the fallback). */
export const productTranslatedSchema = z.object({
  name: text,
  tagline: text,
  description: text,
  ingredients: text,
  usage: textList.min(1),
  howMade: text.optional(),
  recipe: recipeSchema.optional(),
  benefits: textList.default([]),
  storage: text,
  seoTitle: text.optional(),
  seoDescription: text.optional(),
});

/** A French product file. */
export const productSchema = productSharedSchema
  .extend(productTranslatedSchema.shape)
  .refine((p) => !p.nutritionVerified || p.nutrition !== undefined, {
    message: 'nutritionVerified is true but no nutrition table is given',
    path: ['nutrition'],
  });
export type ProductFile = z.infer<typeof productSchema>;
/** A product as the site uses it: the file plus its slug (the file name). */
export type Product = ProductFile & { slug: string };

/** An English product file: translated fields only, each may be empty. */
export const productTranslationSchema = z.object({
  name: optText,
  tagline: optText,
  description: optText,
  ingredients: optText,
  usage: optList,
  howMade: optText,
  recipe: z.object({ title: optText, ingredients: optList, steps: optList }).nullish(),
  benefits: optList,
  storage: optText,
  seoTitle: optText,
  seoDescription: optText,
});

export const PRODUCT_TRANSLATED_KEYS = Object.keys(
  productTranslatedSchema.shape,
) as (keyof typeof productTranslatedSchema.shape)[];

// -------------------------------------------------------------- categories

export const categorySharedSchema = z.object({
  order: z.number().int().nonnegative(),
  image: z.string().regex(ASSET_IMAGE_PATH, '/src/assets/<path>'),
});
export const categoryTranslatedSchema = z.object({
  name: text,
  intro: text,
  seoTitle: text.optional(),
  seoDescription: text.optional(),
});
export const categorySchema = categorySharedSchema.extend(categoryTranslatedSchema.shape);
export type Category = z.infer<typeof categorySchema> & { slug: string };
export const categoryTranslationSchema = z.object({
  name: optText,
  intro: optText,
  seoTitle: optText,
  seoDescription: optText,
});
export const CATEGORY_TRANSLATED_KEYS = Object.keys(
  categoryTranslatedSchema.shape,
) as (keyof typeof categoryTranslatedSchema.shape)[];

// ------------------------------------------------------------------- pages

const seo = { seoTitle: text, seoDescription: text };

export const homePageSchema = z.object({
  ...seo,
  hero: z.object({
    eyebrow: text,
    title: text,
    titleAccent: text,
    lead: text,
    cta: z.object({ primary: text, secondary: text }),
    imageAlt: text,
  }),
  reassurance: z
    .array(z.object({ icon: z.enum(REASSURANCE_ICONS), text }))
    .length(4, 'exactly 4 reassurance items'),
  featuredTitle: text,
  storyTitle: text,
  storyBody: text,
  storyLands: z.object({ from: textList.min(1), to: text }),
  categoriesTitle: text,
  recipesTitle: text,
  recipeProducts: z.array(text).length(3, 'exactly 3 recipe products'),
  commitmentTitle: text,
  commitmentBody: text,
});
export type HomePage = z.infer<typeof homePageSchema>;

export const aboutPageSchema = z.object({
  ...seo,
  title: text,
  lead: text,
  sections: z
    .array(
      z.object({
        title: text,
        body: text,
        image: z.string().regex(ASSET_IMAGE_PATH).optional(),
        imageAlt: text.optional(),
      }),
    )
    .min(1),
});
export type AboutPage = z.infer<typeof aboutPageSchema>;

export const faqPageSchema = z.object({
  ...seo,
  title: text,
  lead: text,
  items: z.array(z.object({ question: text, answer: text })).min(1),
});
export type FaqPage = z.infer<typeof faqPageSchema>;

export const contactPageSchema = z.object({
  ...seo,
  title: text,
  lead: text,
  hours: text,
  mapsLabel: text,
});
export type ContactPage = z.infer<typeof contactPageSchema>;

export const PAGE_SCHEMAS = {
  home: homePageSchema,
  about: aboutPageSchema,
  faq: faqPageSchema,
  contact: contactPageSchema,
} as const;
export type PageKey = keyof typeof PAGE_SCHEMAS;
export type PageContent<K extends PageKey> = z.infer<(typeof PAGE_SCHEMAS)[K]>;

// ------------------------------------------------------------------- legal

export const LEGAL_KEYS = ['legal', 'terms', 'privacy'] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

export const legalFrontmatterSchema = z.object({
  title: text,
  description: text,
  // YAML turns an unquoted date into a Date; keep the ISO day either way.
  updated: z
    .union([z.string(), z.date()])
    .transform((v) => (typeof v === 'string' ? v : v.toISOString().slice(0, 10))),
});

// ---------------------------------------------------------------- settings

/** A label per locale; an empty English label falls back to French. */
const label = z.object({ fr: text, en: z.string().default('') });
const optionalLabel = z.object({ fr: z.string().default(''), en: z.string().default('') });

export const shippingMethodSchema = z.object({
  id: z.enum(SHIPPING_METHODS),
  enabled: z.boolean(),
  price: z.number().nonnegative(),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  label,
  estimate: label,
});
export type ShippingMethodSettings = z.infer<typeof shippingMethodSchema>;

export const settingsSchema = z.object({
  brand: z.object({
    name: text,
    tagline: label,
    email: z.email(),
    phone: z.string().regex(/^0\d{9}$/, '10 digits starting with 0'),
    address: z.object({
      street: text,
      postcode: z.string().regex(/^\d{5}$/),
      city: text,
      country: z.string().regex(/^[A-Z]{2}$/),
    }),
    instagram: z.union([z.literal(''), z.url()]).default(''),
    siren: z
      .string()
      .regex(/^(\d{9}|\d{3} \d{3} \d{3})?$/, '9 digits or empty')
      .default(''),
    packagedBy: text,
  }),
  shop: z.object({
    open: z.boolean(),
    currency: z.literal('eur'),
    vat: z.object({ mode: z.enum(['franchise', 'included']), rate: z.number().nonnegative() }),
    freeShippingFrom: z.number().positive().nullable(),
    maxQuantityPerLine: z.number().int().min(1).max(99),
    announcement: optionalLabel,
  }),
  shipping: z
    .array(shippingMethodSchema)
    .min(1)
    .refine((list) => new Set(list.map((s) => s.id)).size === list.length, 'duplicate method id'),
  launch: z.object({ pricesConfirmed: z.boolean() }),
});
export type Settings = z.infer<typeof settingsSchema>;

// ------------------------------------------------------- cross-file checks

/**
 * Checks no single file can make: unique SKU and slug, existing category,
 * related slugs and image files. Returns the problems, empty when valid.
 */
export function validateCatalog(input: {
  products: Array<Pick<Product, 'slug' | 'sku' | 'category' | 'related' | 'images'>>;
  categorySlugs: string[];
  assetExists: (path: string) => boolean;
}): string[] {
  const { products, categorySlugs, assetExists } = input;
  const problems: string[] = [];
  const slugs = new Set(products.map((p) => p.slug));
  const seenSku = new Map<string, string>();
  for (const p of products) {
    const other = seenSku.get(p.sku);
    if (other) problems.push(`${p.slug}: sku ${p.sku} already used by ${other}`);
    seenSku.set(p.sku, p.slug);
    if (!categorySlugs.includes(p.category))
      problems.push(`${p.slug}: unknown category "${p.category}"`);
    for (const r of p.related) {
      if (r === p.slug) problems.push(`${p.slug}: related to itself`);
      else if (!slugs.has(r)) problems.push(`${p.slug}: unknown related product "${r}"`);
    }
    for (const img of p.images) {
      if (!assetExists(img)) problems.push(`${p.slug}: missing image ${img}`);
    }
  }
  if (slugs.size !== products.length) problems.push('duplicate product slug');
  return problems;
}
