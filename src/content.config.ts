import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';
import { localeSchema } from './content/locale-schema';
import { legalFrontmatterSchema, settingsSchema } from './content/schemas';

// Products, categories and pages hold a complete French file and a possibly
// partial English one in the same collection, so their collection schema only
// asserts "a YAML mapping". The strict schemas of src/content/schemas.ts are
// applied by src/i18n/locale.ts, which knows the locale of each file and
// merges the English translation over the French shared fields.
const yamlMapping = z.looseObject({});

const products = defineCollection({
  loader: glob({ pattern: '{fr,en}/*.yml', base: './src/content/products' }),
  schema: yamlMapping,
});

const categories = defineCollection({
  loader: glob({ pattern: '{fr,en}/*.yml', base: './src/content/categories' }),
  schema: yamlMapping,
});

const pages = defineCollection({
  loader: glob({ pattern: '{fr,en}/*.yml', base: './src/content/pages' }),
  schema: yamlMapping,
});

const legal = defineCollection({
  loader: glob({ pattern: '{fr,en}/*.md', base: './src/content/legal' }),
  schema: legalFrontmatterSchema,
});

const settings = defineCollection({
  loader: glob({ pattern: 'shop.yml', base: './src/content/settings' }),
  schema: settingsSchema,
});

const locales = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/locales' }),
  schema: localeSchema,
});

export const collections = { products, categories, pages, legal, settings, locales };
