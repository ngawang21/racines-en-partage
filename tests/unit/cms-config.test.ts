// The Sveltia CMS configuration must describe exactly the content model of
// src/content/schemas.ts: same field names at every level, i18n modes that
// match the French shared fields of merge.ts, select options equal to the
// schema enums, and file paths that exist. A drift here means the CMS writes
// files the build refuses, or cannot edit a field the site needs.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  FREE_FROM,
  LEGAL_KEYS,
  PAGE_SCHEMAS,
  PRODUCT_IMAGE_PATH,
  REASSURANCE_ICONS,
  SHIPPING_METHODS,
  STOCK,
  categorySharedSchema,
  categoryTranslatedSchema,
  legalFrontmatterSchema,
  productSchema,
  productSharedSchema,
  productTranslatedSchema,
  reviewSchema,
  settingsSchema,
  type PageKey,
} from '../../src/content/schemas';
import { CONTENT, ROOT, readYaml, yamlFolder } from './helpers';

// ------------------------------------------------------------ CMS config types

interface Option {
  label: string;
  value: string;
}
interface Field {
  name: string;
  label?: string;
  widget: string;
  i18n?: boolean | 'duplicate';
  required?: boolean | string[];
  fields?: Field[];
  field?: Field;
  options?: Array<Option | string>;
  multiple?: boolean;
  collection?: string;
  value_field?: string;
  media_folder?: string;
  public_folder?: string;
  pattern?: [string, string];
  default?: unknown;
  [key: string]: unknown;
}
interface CmsFile {
  name: string;
  file: string;
  i18n?: boolean;
  fields: Field[];
}
interface Collection {
  name: string;
  folder?: string;
  files?: CmsFile[];
  fields?: Field[];
  i18n?: boolean;
  slug?: { template: string; pattern?: [string, string]; editable?: boolean | string[] };
  view_filters?: Array<{ label: string; field: string; pattern?: string | boolean }>;
  view_groups?: { groups: Array<{ name: string; field: string }> };
  reorder?: boolean | { key?: string; group?: string };
  [key: string]: unknown;
}
interface CmsConfig {
  backend: Record<string, string>;
  publish_mode: string;
  media_folder: string;
  public_folder: string;
  media_libraries: { default: { config: Record<string, any> } };
  output: { omit_empty_optional_fields: boolean };
  i18n: { structure: string; locales: string[]; default_locale: string; initial_locales?: string };
  collections: Array<Collection | { divider: true }>;
  singletons: CmsFile[];
  [key: string]: unknown;
}

const CONFIG_PATH = join(ROOT, 'public/admin/config.yml');
const configSource = readFileSync(CONFIG_PATH, 'utf8');
const config = parseYaml(configSource) as CmsConfig;
const collections = config.collections.filter((c): c is Collection => 'name' in c);
const collection = (name: string): Collection => {
  const found = collections.find((c) => c.name === name);
  if (!found) throw new Error(`no CMS collection "${name}"`);
  return found;
};
const fileOf = (c: Collection, name: string): CmsFile => {
  const found = c.files?.find((f) => f.name === name);
  if (!found) throw new Error(`no file "${name}" in CMS collection "${c.name}"`);
  return found;
};
const fieldAt = (fields: Field[], path: string): Field => {
  let list = fields;
  let found: Field | undefined;
  for (const part of path.split('.')) {
    found = list.find((f) => f.name === part);
    if (!found) throw new Error(`no CMS field "${path}"`);
    list = found.fields ?? [];
  }
  return found!;
};
const optionValues = (f: Field) =>
  (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));

const products = collection('products');
const reviews = collection('reviews');
const categories = collection('categories');
const pages = collection('pages');
const legal = collection('legal');
const shop = config.singletons.find((s) => s.name === 'shop')!;

// ------------------------------------------------------------ zod introspection

type Zod = z.ZodType;
const def = (s: Zod) => (s as any)._zod.def as { type: string; [k: string]: any };
const WRAPPERS = new Set(['optional', 'default', 'nullable', 'readonly', 'prefault']);

/** The schema under optional(), default(), nullable(). */
function unwrap(s: Zod): Zod {
  let cur = s;
  while (WRAPPERS.has(def(cur).type)) cur = def(cur).innerType;
  return cur;
}
/** A missing or empty value is accepted (optional, default or nullable at the top). */
const isOptional = (s: Zod) => WRAPPERS.has(def(s).type) && def(s).type !== 'readonly';
const shapeOf = (s: Zod): Record<string, Zod> | undefined => {
  const inner = unwrap(s);
  return def(inner).type === 'object' ? (inner as z.ZodObject).shape : undefined;
};
const elementOf = (s: Zod): Zod | undefined => {
  const inner = unwrap(s);
  return def(inner).type === 'array' ? def(inner).element : undefined;
};

/**
 * Compare CMS fields and a zod object shape recursively: same names at every
 * level, objects against objects, lists of objects against arrays of objects,
 * and the "required" flag against optional/default. `managed` lists schema
 * keys the CMS writes itself without a form field (the `reorder` order key).
 * Returns the problems.
 */
function compare(
  fields: Field[],
  shape: Record<string, Zod>,
  path: string,
  allowRequiredMismatch: readonly string[] = [],
  managed: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  const cmsNames = fields.map((f) => f.name).sort();
  const zodNames = Object.keys(shape).sort();
  for (const n of zodNames)
    if (!cmsNames.includes(n) && !managed.includes(`${path}${n}`))
      problems.push(`${path}${n}: in schemas.ts, missing in the CMS`);
  for (const n of cmsNames)
    if (!zodNames.includes(n)) problems.push(`${path}${n}: in the CMS, unknown to schemas.ts`);
  for (const f of fields) {
    const s = shape[f.name];
    if (!s) continue;
    const where = `${path}${f.name}`;
    // Required flag: the French file must satisfy the schema, so a required
    // schema field is required in French, and an optional one is optional
    // (the CMS then omits it when empty instead of writing '').
    const cmsRequired =
      f.required === undefined || f.required === true
        ? true
        : Array.isArray(f.required)
          ? f.required.includes('fr')
          : false;
    if (
      !['boolean', 'hidden'].includes(f.widget) &&
      !allowRequiredMismatch.includes(where) &&
      cmsRequired === isOptional(s)
    ) {
      problems.push(
        `${where}: required in the CMS is ${cmsRequired}, schema optional is ${isOptional(s)}`,
      );
    }
    const nested = shapeOf(s);
    if (nested) {
      if (f.widget !== 'object' || !f.fields)
        problems.push(`${where}: schema object, CMS ${f.widget}`);
      else problems.push(...compare(f.fields, nested, `${where}.`, allowRequiredMismatch));
      continue;
    }
    const element = elementOf(s);
    if (element) {
      const elementShape = shapeOf(element);
      if (elementShape) {
        if (f.widget !== 'list' || !f.fields)
          problems.push(`${where}: schema array of objects, CMS ${f.widget}`);
        else
          problems.push(...compare(f.fields, elementShape, `${where}[].`, allowRequiredMismatch));
      } else {
        const listOfStrings = f.widget === 'list' && f.field !== undefined;
        const multi = ['select', 'relation', 'image'].includes(f.widget) && f.multiple === true;
        if (!listOfStrings && !multi) problems.push(`${where}: schema array, CMS ${f.widget}`);
      }
      continue;
    }
    if (f.widget === 'list' || f.widget === 'object')
      problems.push(`${where}: CMS ${f.widget}, schema ${def(unwrap(s)).type}`);
  }
  return problems;
}

/** Every field and subfield, with its dotted path. */
function walk(fields: Field[], path = ''): Array<[string, Field]> {
  return fields.flatMap((f) => {
    const here = `${path}${f.name}`;
    const children = [...(f.fields ?? []), ...(f.field ? [f.field] : [])];
    return [[here, f] as [string, Field], ...walk(children, `${here}.`)];
  });
}

/**
 * A translated value the English file may leave empty: a leaf field (not an
 * object or list container, not the single item field of a list) must not be
 * required in English, or the CMS would refuse a partial translation.
 */
function requiredInEnglish(fields: Field[], path = ''): string[] {
  const listItems = new Set(walk(fields).flatMap(([, f]) => (f.field ? [f.field] : [])));
  return walk(fields, path)
    .filter(([, f]) => f.i18n === true && !['object', 'list'].includes(f.widget))
    .filter(([, f]) => !listItems.has(f))
    .filter(([, f]) => f.required === undefined || f.required === true)
    .map(([p]) => p);
}

// ------------------------------------------------------------------- tests

/** Every field and subfield except the single item field of a list, with its path. */
const visibleFields = (fields: Field[], path = '') => {
  const listItems = new Set(walk(fields).flatMap(([, f]) => (f.field ? [f.field] : [])));
  return walk(fields, path).filter(([, f]) => !listItems.has(f) && f.widget !== 'hidden');
};

/** The order key Sveltia writes itself when a collection has the `reorder` option. */
const orderKey = (c: Collection): string | undefined =>
  c.reorder ? (typeof c.reorder === 'object' && c.reorder.key) || 'order' : undefined;

const EM_DASH = String.fromCharCode(0x2014);

describe('CMS config: global options', () => {
  it('starts with the Sveltia schema line and targets the repository on main', () => {
    expect(configSource.split('\n')[0]).toBe(
      '# yaml-language-server: $schema=https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json',
    );
    expect(config.backend).toMatchObject({
      name: 'github',
      repo: 'ngawang21/racines-en-partage',
      branch: 'main',
    });
    expect(config.backend.base_url).toMatch(/^https:\/\/[\w.-]+\.workers\.dev$/);
    expect(config.publish_mode).toBe('simple');
    expect(config.site_url).toBe('https://racinesenpartage.fr');
    expect(existsSync(join(ROOT, 'public', (config.logo as { src: string }).src))).toBe(true);
  });

  it('deploys on every save: no skip_ci, so the editor shows a single "Enregistrer" button', () => {
    // With skip_ci (or the deprecated automatic_deployments) set, Sveltia adds a
    // "save without publishing" choice that would leave the site out of date.
    expect(config.backend).not.toHaveProperty('skip_ci');
    expect(config.backend).not.toHaveProperty('automatic_deployments');
  });

  it('leaves empty optional fields out of the files (the French schemas refuse "")', () => {
    expect(config.output.omit_empty_optional_fields).toBe(true);
  });

  it('stores product photos where the build resolves them, as small WebP files', () => {
    expect(config.media_folder).toBe('/src/assets/products');
    expect(config.public_folder).toBe('/src/assets/products');
    expect(PRODUCT_IMAGE_PATH.test(`${config.public_folder}/moringa-100.webp`)).toBe(true);
    const media = config.media_libraries.default.config;
    // 1600 px is the largest width of the gallery preset (src/components/Picture.astro).
    expect(media.transformations.raster_image).toEqual({
      format: 'webp',
      quality: 82,
      width: 1600,
      height: 1600,
    });
    expect(media.slugify_filename).toBe(true);
    expect(media.max_file_size).toBe(2 * 1024 * 1024);
    // An uploaded photo is named after the product: <slug>-<random>.webp.
    expect(media.filename_template).toBe('{{slug}}-{{uuid_shorter}}');
    const sample = `${config.public_folder}/poudre-de-baobab-250g-x7k2.webp`;
    expect(PRODUCT_IMAGE_PATH.test(sample)).toBe(true);
  });

  it('uses multiple_folders with French as the default locale and optional English', () => {
    expect(config.i18n).toMatchObject({
      structure: 'multiple_folders',
      locales: ['fr', 'en'],
      default_locale: 'fr',
      // Defined at all, it lets the owner switch English off for an entry.
      initial_locales: 'all',
    });
  });

  it('lists the content collections, a divider, then the legal texts', () => {
    expect(config.collections.map((c) => ('name' in c ? c.name : '---'))).toEqual([
      'products',
      'reviews',
      'categories',
      'pages',
      '---',
      'legal',
    ]);
  });

  it('never stores an external image URL where the build expects a file', () => {
    const fieldLists: Field[][] = [
      ...collections.flatMap((c) => [c.fields ?? [], ...(c.files ?? []).map((f) => f.fields)]),
      ...config.singletons.map((s) => s.fields),
    ];
    const imageFields = fieldLists
      .flatMap((list) => walk(list))
      .filter(([, f]) => f.widget === 'image');
    expect(imageFields.length).toBeGreaterThan(0);
    for (const [path, f] of imageFields) expect(f.choose_url, path).toBe(false);
  });

  it('has no em dash', () => {
    expect(configSource).not.toContain(EM_DASH);
  });
});

describe('CMS config: products', () => {
  const fields = products.fields!;

  it('has exactly the fields of the product schema, at every level', () => {
    const shape = { ...productSharedSchema.shape, ...productTranslatedSchema.shape };
    expect(compare(fields, shape, '', [], [orderKey(products)!])).toEqual([]);
  });

  it('keeps shared fields French only and translates exactly the others', () => {
    // i18n false: stored in the French file only and hidden in the English
    // pane, which then holds just what is to translate (merge.ts ignores any
    // shared key an English file would carry anyway).
    const top = Object.fromEntries(fields.map((f) => [f.name, f.i18n]));
    const shared = Object.keys(top).filter((k) => top[k] === false);
    const translated = Object.keys(top).filter((k) => top[k] === true);
    const sharedKeys = Object.keys(productSharedSchema.shape).filter(
      (k) => k !== orderKey(products),
    );
    expect(shared.sort()).toEqual(sharedKeys.sort());
    expect(translated.sort()).toEqual(Object.keys(productTranslatedSchema.shape).sort());
    expect(fields.every((f) => f.i18n === false || f.i18n === true)).toBe(true);
    // A subfield of a shared object inherits i18n: false.
    for (const [path, f] of walk(fields))
      if (path.includes('.') && top[path.split('.')[0]!] === false)
        expect(f.i18n === undefined || f.i18n === false, path).toBe(true);
  });

  it('never requires a translated field in English (the build falls back to French)', () => {
    expect(requiredInEnglish(fields)).toEqual([]);
  });

  it('marks every subfield of a translated object or list as translated', () => {
    for (const [path, f] of walk(fields)) {
      if (f.i18n !== true) continue;
      for (const child of [...(f.fields ?? []), ...(f.field ? [f.field] : [])])
        expect(child.i18n, `${path}.${child.name}`).toBe(true);
    }
  });

  it('asks for a product the way the owner thinks about it', () => {
    const names = fields.map((f) => f.name);
    expect(names.slice(0, 7)).toEqual([
      'name',
      'images',
      'price',
      'weightGrams',
      'stock',
      'hidden',
      'category',
    ]);
    const at = (n: string) => names.indexOf(n);
    // Descriptions, then label details, then cross-selling and Google.
    expect(at('description')).toBeLessThan(at('origin'));
    expect(at('storage')).toBeLessThan(at('nutrition'));
    expect(at('nutrition')).toBeLessThan(at('related'));
    expect(at('related')).toBeLessThan(at('seoTitle'));
  });

  it('gives every visible field a French label and a one-line hint', () => {
    for (const [path, f] of visibleFields(fields)) {
      expect(f.label, path).toBeTruthy();
      expect(typeof f.hint === 'string' && f.hint.length > 10, `${path} hint`).toBe(true);
    }
  });

  it('fills a new product with defaults the schema accepts', () => {
    const defaults = Object.fromEntries(
      fields
        .map((f) => [
          f.name,
          (f.default_localized as Record<string, unknown> | undefined)?.fr ?? f.default,
        ])
        .filter(([, v]) => v !== undefined),
    );
    expect(defaults).toMatchObject({
      stock: 'in_stock',
      hidden: false,
      featured: false,
      nutritionVerified: false,
    });
    // What the owner still types in: the rest of a minimal product.
    const typed = {
      sku: 'REP-BAO-250',
      category: 'poudres',
      price: 12.5,
      origin: 'Sénégal',
      images: ['/src/assets/products/poudre-de-baobab-250g-x7k2.webp'],
      name: 'Poudre de baobab',
      tagline: 'Une phrase.',
      description: 'Deux phrases.',
      ingredients: '100 % pulpe de baobab.',
      usage: ['Dans un yaourt.'],
    };
    expect(productSchema.safeParse({ ...defaults, ...typed }).success).toBe(true);
    const storage = fieldAt(fields, 'storage').default_localized as Record<string, string>;
    expect(Object.keys(storage).sort()).toEqual([...config.i18n.locales].sort());
  });

  it('accepts prices the schema accepts and refuses a third decimal', () => {
    const pattern = new RegExp(fieldAt(fields, 'price').pattern![0]);
    // Sveltia tests a number field against the pattern as a string.
    for (const ok of [8.9, 12.5, 10, 0.5, 7.95]) {
      expect(pattern.test(String(ok)), String(ok)).toBe(true);
      expect(productSharedSchema.shape.price.safeParse(ok).success).toBe(true);
    }
    expect(pattern.test(String(8.999))).toBe(false);
    expect(productSharedSchema.shape.price.safeParse(8.999).success).toBe(false);
  });

  it('offers search keywords as an optional translated list of words', () => {
    // Regional names the product name does not carry (bissap, karkadé); the
    // English file may leave the list empty and falls back to French.
    expect(fieldAt(fields, 'keywords')).toMatchObject({
      widget: 'list',
      i18n: true,
      required: false,
      field: { widget: 'string', i18n: true },
    });
    expect(fieldAt(fields, 'keywords').hint).toContain('bissap');
    const names = fields.map((f) => f.name);
    expect(names.indexOf('keywords')).toBeLessThan(names.indexOf('seoTitle'));
  });

  it('stores the description as plain text, as the product page prints it', () => {
    // ProductView splits the description on blank lines and prints text, so
    // Markdown from a rich text editor would show its asterisks.
    expect(fieldAt(fields, 'description').widget).toBe('text');
  });

  it('offers the schema enums as options', () => {
    expect(optionValues(fieldAt(fields, 'stock'))).toEqual([...STOCK]);
    expect(optionValues(fieldAt(fields, 'free_from'))).toEqual([...FREE_FROM]);
    expect(fieldAt(fields, 'free_from').multiple).toBe(true);
  });

  it('offers every country code used by the seed products', () => {
    const options = optionValues(fieldAt(fields, 'originCountryCode'));
    for (const o of options) expect(o).toMatch(/^[A-Z]{2}$/);
    for (const [slug, raw] of yamlFolder('products', 'fr')) {
      const code = (raw as { originCountryCode?: string }).originCountryCode;
      if (code) expect(options, slug).toContain(code);
    }
  });

  it('links category and related products by file name, never to itself or a hidden one', () => {
    expect(fieldAt(fields, 'category')).toMatchObject({
      widget: 'relation',
      collection: 'categories',
      value_field: '{{slug}}',
    });
    expect(fieldAt(fields, 'related')).toMatchObject({
      widget: 'relation',
      collection: 'products',
      value_field: '{{slug}}',
      multiple: true,
    });
    expect(fieldAt(fields, 'related').filters).toEqual([
      { field: 'sku', values: ['{{fields.sku}}'], exclude: true },
      { field: 'hidden', values: [true], exclude: true },
    ]);
    expect(fieldAt(fields, 'images')).toMatchObject({ widget: 'image', multiple: true, min: 1 });
  });

  it('lets the owner reorder products within their category', () => {
    expect(products.reorder).toEqual({ group: 'category' });
    const groups = products.view_groups!.groups;
    expect(groups.find((g) => g.name === 'category')).toMatchObject({ field: 'category' });
    // The order key is a schema field, so the build sorts by it.
    expect(Object.keys(productSharedSchema.shape)).toContain(orderKey(products));
    // A collection thumbnail of `images` would match nothing (the content is
    // flattened to images.0): leave it out and Sveltia infers images.*.
    expect(products.thumbnail).toBeUndefined();
  });

  it('filters by stock, hidden products and existing categories', () => {
    const filters = products.view_filters!;
    expect(filters).toContainEqual(expect.objectContaining({ field: 'stock', pattern: '^out$' }));
    expect(filters).toContainEqual(expect.objectContaining({ field: 'hidden', pattern: true }));
    const categorySlugs = [...yamlFolder('categories', 'fr').keys()];
    const byCategory = filters.filter((f) => f.field === 'category');
    expect(byCategory.map((f) => String(f.pattern).replace(/^\^|\$$/g, '')).sort()).toEqual(
      categorySlugs.sort(),
    );
    const stockPatterns = filters.filter((f) => f.field === 'stock').map((f) => f.pattern);
    for (const value of STOCK)
      expect(
        stockPatterns.filter((p) => new RegExp(String(p)).test(value)),
        value,
      ).toHaveLength(1);
    for (const f of filters) expect(fieldAt(fields, f.field), f.label).toBeDefined();
  });

  it('flags hidden products in the list summary', () => {
    expect(products.summary).toContain("{{hidden | ternary(' (masqué)', '')}}");
  });

  it('names new files the way the seed files are named', () => {
    // Sveltia fills the slug template, then slugifies it (ascii, no accents).
    const slugify = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    expect(products.slug!.template).toBe('{{name}}-{{weightGrams}}g');
    const pattern = new RegExp(products.slug!.pattern![0]);
    for (const [slug, raw] of yamlFolder('products', 'fr')) {
      const { name, weightGrams } = raw as { name: string; weightGrams: number };
      expect(slugify(`${name}-${weightGrams}g`), slug).toBe(slug);
      expect(pattern.test(slug), slug).toBe(true);
    }
  });

  it('reads and writes src/content/products/{fr,en}/*.yml', () => {
    expect(products).toMatchObject({
      folder: 'src/content/products',
      format: 'yml',
      extension: 'yml',
      i18n: true,
    });
    for (const locale of config.i18n.locales)
      expect(readdirSync(join(ROOT, products.folder!, locale)).length, locale).toBeGreaterThan(0);
  });
});

describe('CMS config: categories', () => {
  const fields = categories.fields!;
  it('has exactly the fields of the category schema, shared ones French only', () => {
    const key = orderKey(categories)!;
    expect(key).toBe('order');
    expect(
      compare(
        fields,
        { ...categorySharedSchema.shape, ...categoryTranslatedSchema.shape },
        '',
        [],
        [key],
      ),
    ).toEqual([]);
    const shared = fields.filter((f) => f.i18n === false).map((f) => f.name);
    expect([...shared, key].sort()).toEqual(Object.keys(categorySharedSchema.shape).sort());
    expect(requiredInEnglish(fields)).toEqual([]);
    for (const [path, f] of visibleFields(fields)) expect(f.hint, path).toBeTruthy();
  });
  it('orders categories with "Réorganiser" (a new one gets the next number)', () => {
    expect(categories.reorder).toBe(true);
    for (const [slug, raw] of yamlFolder('categories', 'fr'))
      expect(Number.isInteger((raw as { order: number }).order), slug).toBe(true);
  });
  it('stores category images in the brand folder, where the seed images are', () => {
    const image = fieldAt(fields, 'image');
    expect(image.media_folder).toBe('/src/assets/brand');
    for (const [slug, raw] of yamlFolder('categories', 'fr'))
      expect((raw as { image: string }).image.startsWith(`${image.public_folder}/`), slug).toBe(
        true,
      );
  });
  it('reads src/content/categories/{fr,en}/*.yml', () => {
    expect(categories.folder).toBe('src/content/categories');
    for (const locale of config.i18n.locales)
      expect(existsSync(join(ROOT, categories.folder!, locale)), locale).toBe(true);
  });
});

describe('CMS config: pages', () => {
  const keys = Object.keys(PAGE_SCHEMAS) as PageKey[];
  it('has one file per page of the schema, localised by folder', () => {
    expect(pages.files!.map((f) => f.name).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const file = fileOf(pages, key);
      expect(file.file).toBe(`src/content/pages/{{locale}}/${key}.yml`);
      expect(file.i18n).toBe(true);
    }
  });
  it('has exactly the fields of each page schema, at every level', () => {
    for (const key of keys) {
      const shape = (PAGE_SCHEMAS[key] as unknown as z.ZodObject).shape;
      expect(compare(fileOf(pages, key).fields, shape, `${key}.`), key).toEqual([]);
    }
  });
  it('translates every text field and subfield, and never requires English', () => {
    for (const key of keys) {
      const fields = fileOf(pages, key).fields;
      for (const [path, f] of walk(fields, `${key}.`))
        expect(f.i18n === true || f.i18n === 'duplicate', path).toBe(true);
      expect(requiredInEnglish(fields, `${key}.`), key).toEqual([]);
    }
  });
  it('offers the icon enum and links the recipes to products', () => {
    const home = fileOf(pages, 'home').fields;
    expect(optionValues(fieldAt(home, 'reassurance.icon'))).toEqual([...REASSURANCE_ICONS]);
    expect(fieldAt(home, 'recipeProducts')).toMatchObject({
      widget: 'relation',
      collection: 'products',
      value_field: '{{slug}}',
      multiple: true,
      min: 3,
      max: 3,
    });
    const about = fileOf(pages, 'about').fields;
    const image = fieldAt(about, 'sections.image');
    for (const s of (readYaml(join(CONTENT, 'pages/fr/about.yml')) as any).sections)
      if (s.image) expect(s.image.startsWith(`${image.public_folder}/`), s.image).toBe(true);
  });
});

describe('CMS config: legal texts', () => {
  it('has the three Markdown files, localised by folder, with the frontmatter and a body', () => {
    expect(legal.format).toBe('frontmatter');
    expect(legal.files!.map((f) => f.name).sort()).toEqual([...LEGAL_KEYS].sort());
    for (const key of LEGAL_KEYS) {
      const file = fileOf(legal, key);
      expect(file.file).toBe(`src/content/legal/{{locale}}/${key}.md`);
      expect(file.i18n).toBe(true);
      const names = file.fields.map((f) => f.name).sort();
      expect(names).toEqual([...Object.keys(legalFrontmatterSchema.shape), 'body'].sort());
      expect(fieldAt(file.fields, 'body').widget).toBe('richtext');
    }
  });
  it('warns before editing and keeps the editor to headings, emphasis, links and lists', () => {
    expect(legal.description).toMatch(/^Attention/);
    expect(legal.description).toContain('{company}');
    const body = fieldAt(fileOf(legal, 'terms').fields, 'body');
    expect(body.hint).toMatch(/juridique/);
    // No image, code block or table component: the legal pages render plain Markdown.
    expect(body.editor_components).toEqual([]);
    for (const key of LEGAL_KEYS)
      expect(fileOf(legal, key).fields).toBe(fileOf(legal, 'legal').fields);
  });
});

describe('CMS config: settings', () => {
  it('edits src/content/settings/shop.yml without translation', () => {
    expect(shop.file).toBe('src/content/settings/shop.yml');
    expect(walk(shop.fields).filter(([, f]) => f.i18n !== undefined)).toEqual([]);
  });
  it('has exactly the fields of the settings schema, at every level', () => {
    // freeShippingFrom is optional in the CMS: emptied, it is left out of the
    // file, which the schema (nullish) reads as "never free". The groups added
    // in iteration 3 have a schema default so that an older shop.yml still
    // parses, but the CMS always shows and writes them: no "add" toggle.
    const alwaysShown = ['forms', 'newsletter', 'analytics', 'reviews'];
    expect(compare(shop.fields, settingsSchema.shape, '', alwaysShown)).toEqual([]);
    for (const name of alwaysShown)
      expect(fieldAt(shop.fields, name).required, name).toBeUndefined();
    const raw = readYaml(join(CONTENT, 'settings/shop.yml')) as any;
    delete raw.shop.freeShippingFrom;
    expect(settingsSchema.parse(raw).shop.freeShippingFrom).toBeUndefined();
  });
  it('shows the sections the owner uses most first', () => {
    expect(shop.fields.map((f) => f.name)).toEqual([
      'shop',
      'shipping',
      'reviews',
      'newsletter',
      'launch',
      'brand',
      'forms',
      'analytics',
    ]);
    expect(fieldAt(shop.fields, 'shop').fields!.map((f) => f.name)).toEqual([
      'open',
      'announcement',
      'vat',
      'maxQuantityPerLine',
      'freeShippingFrom',
      'currency',
    ]);
    expect(fieldAt(shop.fields, 'shop.open').label).toBe('Boutique ouverte');
    expect(fieldAt(shop.fields, 'shop.announcement').label).toBe("Bandeau d'annonce");
    expect(fieldAt(shop.fields, 'shop.vat').label).toBe('TVA');
    expect(fieldAt(shop.fields, 'shipping').label).toMatch(/^Livraison/);
    expect(fieldAt(shop.fields, 'launch').label).toBe('Lancement');
    expect(fieldAt(shop.fields, 'brand.siret').label).toBe('Numéro SIRET');
    expect(fieldAt(shop.fields, 'forms.turnstileSiteKey').label).toBe(
      'Clé Turnstile (anti-robots)',
    );
    expect(fieldAt(shop.fields, 'newsletter.enabled').label).toBe('Newsletter active');
    expect(fieldAt(shop.fields, 'newsletter.welcomeCode').label).toBe('Code de bienvenue');
    for (const [path, f] of visibleFields(shop.fields))
      if (!['shipping.id'].includes(path)) expect(f.label, path).toBeTruthy();
  });
  it('accepts shipping prices with two decimals at most, as Stripe needs cents', () => {
    const pattern = new RegExp(fieldAt(shop.fields, 'shipping.price').pattern![0]);
    for (const ok of [0, 4.9, 6.9, 12]) expect(pattern.test(String(ok)), String(ok)).toBe(true);
    expect(pattern.test('4.999')).toBe(false);
  });
  it('offers the schema enums and every seeded value as options', () => {
    const raw = readYaml(join(CONTENT, 'settings/shop.yml')) as any;
    expect(optionValues(fieldAt(shop.fields, 'shipping.id'))).toEqual([...SHIPPING_METHODS]);
    expect(optionValues(fieldAt(shop.fields, 'shop.vat.mode'))).toEqual(
      (unwrap(settingsSchema.shape.shop.shape.vat.shape.mode) as z.ZodEnum).options,
    );
    const countries = optionValues(fieldAt(shop.fields, 'shipping.countries'));
    for (const method of raw.shipping)
      for (const c of method.countries) expect(countries, method.id).toContain(c);
    expect(optionValues(fieldAt(shop.fields, 'brand.address.country'))).toContain(
      raw.brand.address.country,
    );
    expect(fieldAt(shop.fields, 'shop.currency')).toMatchObject({
      widget: 'hidden',
      default: 'eur',
    });
  });
  it('mirrors the schema patterns on phone, postcode and SIRET', () => {
    const accepts = (path: string, value: string) =>
      new RegExp(fieldAt(shop.fields, path).pattern![0]).test(value);
    expect(accepts('brand.phone', '0775689108')).toBe(true);
    expect(accepts('brand.phone', '+33775689108')).toBe(false);
    expect(accepts('brand.address.postcode', '95400')).toBe(true);
    const siret = settingsSchema.shape.brand.shape.siret;
    for (const ok of ['', '91185884300020', '911 858 843 00020']) {
      expect(accepts('brand.siret', ok), ok).toBe(true);
      expect(siret.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['12345', '911 858 843', '911858843 00020']) {
      expect(accepts('brand.siret', bad), bad).toBe(false);
      expect(siret.safeParse(bad).success, bad).toBe(false);
    }
  });
  it('explains every new setting with an example, and where an empty value leads', () => {
    for (const path of [
      'brand.siret',
      'forms.turnstileSiteKey',
      'newsletter.enabled',
      'newsletter.welcomeCode',
      'analytics.cloudflareToken',
      'reviews.enabled',
    ]) {
      const f = fieldAt(shop.fields, path);
      expect(typeof f.hint === 'string' && f.hint.length > 20, path).toBe(true);
    }
    expect(fieldAt(shop.fields, 'brand.siret').hint).toMatch(/SIREN/);
    expect(fieldAt(shop.fields, 'forms.turnstileSiteKey').hint).toMatch(/Cloudflare/);
    expect(fieldAt(shop.fields, 'forms.turnstileSiteKey').hint).toMatch(/[Vv]ide/);
    expect(fieldAt(shop.fields, 'newsletter.welcomeCode').hint).toMatch(/Stripe/);
    // Booleans default to the schema defaults, so a first save changes nothing.
    expect(fieldAt(shop.fields, 'newsletter.enabled').default).toBe(true);
    expect(fieldAt(shop.fields, 'reviews.enabled').default).toBe(true);
  });
});

describe('CMS config: reviews', () => {
  const fields = reviews.fields!;

  it('reads and writes src/content/reviews/*.yml, one language per review, no locale folder', () => {
    expect(reviews).toMatchObject({
      folder: 'src/content/reviews',
      format: 'yaml',
      extension: 'yml',
      i18n: false,
      create: true,
      delete: true,
    });
    expect(existsSync(join(ROOT, reviews.folder!))).toBe(true);
    for (const [path, f] of walk(fields)) expect(f.i18n, path).toBeUndefined();
  });

  it('has exactly the fields of the review schema', () => {
    expect(compare(fields, reviewSchema.shape, '')).toEqual([]);
    expect(fields.map((f) => f.name).sort()).toEqual(Object.keys(reviewSchema.shape).sort());
  });

  it('uses only options of the pinned Sveltia version (0.256.1 JSON schema)', () => {
    // Option names of the Sveltia CMS JSON schema (schema/sveltia-cms.json of
    // the pinned version) for an entry collection and each widget used here.
    // A misspelt option is silently ignored by Sveltia, so it fails here.
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    const common =
      'name label label_localized widget default default_localized hint hint_localized ' +
      'preview required readonly i18n comment unique pattern ';
    const OPTIONS: Record<string, string[]> = {
      relation: words(
        common +
          'multiple min max dropdown_threshold collection file value_field display_fields ' +
          'search_fields filters sort_by',
      ),
      number: words(common + 'before_input after_input value_type min max step auto_increment'),
      string: words(
        common +
          'minlength maxlength before_input after_input type prefix suffix use_emoji_autocomplete',
      ),
      text: words(common + 'minlength maxlength use_emoji_autocomplete'),
      boolean: words(
        'name label label_localized widget default default_localized hint hint_localized ' +
          'preview required readonly i18n comment before_input after_input',
      ),
      datetime: words(
        common +
          'type min max step format date_format time_format localize_format picker_utc ' +
          'input_timezone output_utc auto_now',
      ),
      select: words(common + 'multiple min max dropdown_threshold options'),
    };
    const COLLECTION = words(
      'folder file fields path filter create delete duplicate reorder table_columns ' +
        'summary_fields bulk_edit extension identifier_field slug slug_length summary ' +
        'sortable_fields view_filters view_groups nested meta index_file thumbnail limit ' +
        'aliases_field label_singular description media_folder public_folder hide publish_mode ' +
        'publish format frontmatter_delimiter body_field i18n preview_path ' +
        'preview_path_date_field editor yaml_quote name label icon readonly',
    );
    const SLUG = words('template editable i18n auto_increment hint pattern');
    const VIEW = words('eq ne lt lte gt gte in not_in empty name label field pattern');
    const unknown = (obj: object, allowed: string[]) =>
      Object.keys(obj).filter((k) => !allowed.includes(k));
    expect(unknown(reviews, COLLECTION)).toEqual([]);
    expect(unknown(reviews.slug!, SLUG)).toEqual([]);
    for (const f of fields) {
      expect(OPTIONS[f.widget], `${f.name}: widget ${f.widget}`).toBeDefined();
      expect(unknown(f, OPTIONS[f.widget]!), f.name).toEqual([]);
    }
    for (const v of reviews.view_filters!) expect(unknown(v, VIEW), v.label).toEqual([]);
    for (const g of reviews.view_groups!.groups) expect(unknown(g, VIEW), g.name).toEqual([]);
    // The object form of sortable_fields takes plain field names.
    const sortable = reviews.sortable_fields as {
      fields: unknown[];
      default: { field: string; direction: string };
    };
    expect(sortable.fields.every((f) => typeof f === 'string')).toBe(true);
    expect(sortable.default).toEqual({ field: 'date', direction: 'descending' });
    for (const name of [...(sortable.fields as string[]), sortable.default.field])
      expect(fieldAt(fields, name), name).toBeDefined();
  });

  it('links the review to a product of the French products collection, by file name', () => {
    expect(fieldAt(fields, 'product')).toMatchObject({
      widget: 'relation',
      collection: products.name,
      value_field: '{{slug}}',
    });
    expect(fieldAt(fields, 'product').multiple).toBeUndefined();
    // The products collection is localised; a relation reads its default (French) locale.
    expect(config.i18n.default_locale).toBe('fr');
  });

  it('publishes nothing by default, and keeps "verified" for the Worker', () => {
    expect(fieldAt(fields, 'published')).toMatchObject({ widget: 'boolean', default: false });
    expect(fieldAt(fields, 'published').hint).toContain("rien n'est publié sans vous");
    // A review added here (Instagram, market) is never marked as a verified purchase.
    expect(fieldAt(fields, 'verified')).toMatchObject({
      widget: 'boolean',
      default: false,
      readonly: true,
    });
    expect(fieldAt(fields, 'reply').hint).toContain('Votre réponse publique, affichée sous l');
  });

  it('fills a new review with defaults the schema accepts', () => {
    const today = '2026-11-08';
    const defaults = Object.fromEntries(
      fields
        .filter((f) => f.default !== undefined)
        .map((f) => [f.name, f.default === '{{now}}' ? today : f.default]),
    );
    expect(defaults).toEqual({ published: false, verified: false, locale: 'fr', date: today });
    const typed = {
      product: 'poudre-de-moringa-100g',
      rating: 5,
      author: 'Awa',
      text: 'Un goût franc, je le mets dans mon smoothie.',
    };
    const parsed = reviewSchema.parse({ ...defaults, ...typed });
    expect(parsed).toMatchObject({ order: '', title: '', reply: '', published: false });
  });

  it('mirrors the schema limits and enums', () => {
    expect(fieldAt(fields, 'rating')).toMatchObject({
      widget: 'number',
      value_type: 'int',
      min: 1,
      max: 5,
      step: 1,
    });
    expect(optionValues(fieldAt(fields, 'locale'))).toEqual(
      (unwrap(reviewSchema.shape.locale) as z.ZodEnum).options,
    );
    expect(fieldAt(fields, 'author')).toMatchObject({ minlength: 2, maxlength: 40 });
    expect(fieldAt(fields, 'title')).toMatchObject({ maxlength: 80 });
    expect(fieldAt(fields, 'text')).toMatchObject({
      widget: 'text',
      minlength: 20,
      maxlength: 1200,
    });
    expect(fieldAt(fields, 'date')).toMatchObject({
      widget: 'datetime',
      type: 'date',
      format: 'YYYY-MM-DD',
    });
  });

  it('names a review created here like the Worker does: <product slug>--<suffix>.yml', () => {
    // The Worker writes <product slug>--<order number>; a review added here has
    // no order number, so the template uses the day and the author instead.
    // Sveltia slugifies each tag value and keeps the literal "--".
    const slug = reviews.slug!;
    expect(slug.template).toBe('{{product}}--{{year}}-{{month}}-{{day}}-{{author}}');
    expect(slug.editable).toBe(false);
    expect(slug.template).not.toContain('/');
    const slugify = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const values: Record<string, string> = {
      product: 'fleurs-d-hibiscus-100g',
      year: '2026',
      month: '11',
      day: '08',
      author: 'Aïssatou D.',
    };
    const filled = slug.template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => slugify(values[k]!));
    expect(filled).toBe('fleurs-d-hibiscus-100g--2026-11-08-aissatou-d');
    const name = /^([a-z0-9]+(?:-[a-z0-9]+)*)--([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/;
    for (const n of [filled, 'fleurs-d-hibiscus-100g--X9Y8Z7W6'])
      expect(name.exec(n)?.[1], n).toBe('fleurs-d-hibiscus-100g');
    expect(reviews.aliases_field).toBe(false);
  });

  it('lists reviews to moderate first, with the author, the rating and the product', () => {
    expect(reviews.summary).toMatch(/^\{\{author\}\}, \{\{rating\}\}\/5, \{\{product\}\}/);
    const filters = reviews.view_filters!;
    expect(filters).toContainEqual(expect.objectContaining({ field: 'published', pattern: true }));
    expect(filters).toContainEqual(expect.objectContaining({ field: 'published', ne: true }));
    for (const f of filters) expect(fieldAt(fields, f.field), f.label).toBeDefined();
    for (const g of reviews.view_groups!.groups)
      expect(fieldAt(fields, g.field), g.name).toBeDefined();
  });

  it('gives every field a French label and a hint with an example', () => {
    for (const [path, f] of visibleFields(fields)) {
      expect(f.label, path).toBeTruthy();
      expect(typeof f.hint === 'string' && f.hint.length > 10, `${path} hint`).toBe(true);
    }
  });
});

describe('CMS config: files on disk', () => {
  it('every file path resolves for fr and en', () => {
    const paths = [
      ...[pages, legal].flatMap((c) => c.files!.map((f) => f.file)),
      ...config.singletons.map((s) => s.file),
    ];
    for (const pattern of paths) {
      const resolved = pattern.includes('{{locale}}')
        ? config.i18n.locales.map((l) => pattern.replace('{{locale}}', l))
        : [pattern];
      for (const p of resolved) expect(existsSync(join(ROOT, p)), p).toBe(true);
    }
  });
});

describe('admin page', () => {
  const html = readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8');
  it('is noindex and loads a pinned Sveltia CMS as a classic script with SRI', () => {
    expect(html).toMatch(/<meta name="robots" content="noindex"\s*\/?>/);
    expect(html).toMatch(
      /<script\s+src="https:\/\/unpkg\.com\/@sveltia\/cms@\d+\.\d+\.\d+\/dist\/sveltia-cms\.js"\s+integrity="sha384-[A-Za-z0-9+/=]{64}"\s+crossorigin="anonymous"\s*><\/script>/,
    );
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain('<link rel="stylesheet"');
  });
  it('has its own CSP and X-Robots-Tag in public/_headers', () => {
    const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8');
    const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith('/admin/*'));
    expect(block).toBeDefined();
    expect(block).toContain('! Content-Security-Policy');
    const pinned = /src="(https:\/\/unpkg\.com\/@sveltia\/cms@[\d.]+\/)dist\//.exec(html)?.[1];
    expect(pinned).toBeDefined();
    // The whole host: Sveltia imports helper packages from unpkg after sign-in.
    expect(block).toContain("script-src 'self' 'wasm-unsafe-eval' https://unpkg.com;");
    expect(block).toMatch(/connect-src [^;]*https:\/\/api\.github\.com/);
    expect(block).toContain('X-Robots-Tag: noindex');
  });
});
