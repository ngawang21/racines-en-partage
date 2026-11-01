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
  productSharedSchema,
  productTranslatedSchema,
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
  slug?: { template: string; pattern?: [string, string] };
  view_filters?: Array<{ field: string; pattern: string | boolean }>;
  [key: string]: unknown;
}
interface CmsConfig {
  backend: Record<string, string>;
  publish_mode: string;
  media_folder: string;
  public_folder: string;
  media_libraries: { default: { config: Record<string, any> } };
  output: { omit_empty_optional_fields: boolean };
  i18n: { structure: string; locales: string[]; default_locale: string };
  collections: Collection[];
  singletons: CmsFile[];
  [key: string]: unknown;
}

const CONFIG_PATH = join(ROOT, 'public/admin/config.yml');
const configSource = readFileSync(CONFIG_PATH, 'utf8');
const config = parseYaml(configSource) as CmsConfig;
const collection = (name: string): Collection => {
  const found = config.collections.find((c) => c.name === name);
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
 * and the "required" flag against optional/default. Returns the problems.
 */
function compare(
  fields: Field[],
  shape: Record<string, Zod>,
  path: string,
  allowRequiredMismatch: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  const cmsNames = fields.map((f) => f.name).sort();
  const zodNames = Object.keys(shape).sort();
  for (const n of zodNames)
    if (!cmsNames.includes(n)) problems.push(`${path}${n}: in schemas.ts, missing in the CMS`);
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

  it('leaves empty optional fields out of the files (the French schemas refuse "")', () => {
    expect(config.output.omit_empty_optional_fields).toBe(true);
  });

  it('stores product photos where the build resolves them, as WebP under 2 MB', () => {
    expect(config.media_folder).toBe('/src/assets/products');
    expect(config.public_folder).toBe('/src/assets/products');
    expect(PRODUCT_IMAGE_PATH.test(`${config.public_folder}/moringa-100.webp`)).toBe(true);
    const media = config.media_libraries.default.config;
    expect(media.transformations.raster_image).toEqual({
      format: 'webp',
      quality: 85,
      width: 2048,
      height: 2048,
    });
    expect(media.slugify_filename).toBe(true);
    expect(media.max_file_size).toBe(2 * 1024 * 1024);
  });

  it('uses multiple_folders with French as the default locale', () => {
    expect(config.i18n).toMatchObject({
      structure: 'multiple_folders',
      locales: ['fr', 'en'],
      default_locale: 'fr',
    });
  });
});

describe('CMS config: products', () => {
  const fields = products.fields!;

  it('has exactly the fields of the product schema, at every level', () => {
    const shape = { ...productSharedSchema.shape, ...productTranslatedSchema.shape };
    expect(compare(fields, shape, '')).toEqual([]);
  });

  it('duplicates exactly the shared fields and translates exactly the others', () => {
    const top = Object.fromEntries(fields.map((f) => [f.name, f.i18n]));
    const duplicated = Object.keys(top).filter((k) => top[k] === 'duplicate');
    const translated = Object.keys(top).filter((k) => top[k] === true);
    expect(duplicated.sort()).toEqual(Object.keys(productSharedSchema.shape).sort());
    expect(translated.sort()).toEqual(Object.keys(productTranslatedSchema.shape).sort());
    expect(fields.every((f) => f.i18n === 'duplicate' || f.i18n === true)).toBe(true);
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

  it('links category and related products by file name', () => {
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
    expect(fieldAt(fields, 'images')).toMatchObject({ widget: 'image', multiple: true, min: 1 });
  });

  it('filters by stock and by existing categories', () => {
    const filters = products.view_filters!;
    expect(filters).toContainEqual(expect.objectContaining({ field: 'stock', pattern: 'out' }));
    const categorySlugs = [...yamlFolder('categories', 'fr').keys()];
    const byCategory = filters.filter((f) => f.field === 'category');
    expect(byCategory.map((f) => String(f.pattern).replace(/^\^|\$$/g, '')).sort()).toEqual(
      categorySlugs.sort(),
    );
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
  it('has exactly the fields of the category schema, shared ones duplicated', () => {
    expect(
      compare(fields, { ...categorySharedSchema.shape, ...categoryTranslatedSchema.shape }, ''),
    ).toEqual([]);
    const duplicated = fields.filter((f) => f.i18n === 'duplicate').map((f) => f.name);
    expect(duplicated.sort()).toEqual(Object.keys(categorySharedSchema.shape).sort());
    expect(requiredInEnglish(fields)).toEqual([]);
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
});

describe('CMS config: settings', () => {
  it('edits src/content/settings/shop.yml without translation', () => {
    expect(shop.file).toBe('src/content/settings/shop.yml');
    expect(walk(shop.fields).filter(([, f]) => f.i18n !== undefined)).toEqual([]);
  });
  it('has exactly the fields of the settings schema, at every level', () => {
    // freeShippingFrom is nullable in the schema, but an empty number field
    // would be left out of the file, not written as null: keep it required.
    expect(compare(shop.fields, settingsSchema.shape, '', ['shop.freeShippingFrom'])).toEqual([]);
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
  it('mirrors the schema patterns on phone, postcode and SIREN', () => {
    const accepts = (path: string, value: string) =>
      new RegExp(fieldAt(shop.fields, path).pattern![0]).test(value);
    expect(accepts('brand.phone', '0775689108')).toBe(true);
    expect(accepts('brand.phone', '+33775689108')).toBe(false);
    expect(accepts('brand.address.postcode', '95400')).toBe(true);
    expect(accepts('brand.siren', '')).toBe(true);
    expect(accepts('brand.siren', '123 456 789')).toBe(true);
    expect(accepts('brand.siren', '12345')).toBe(false);
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
    expect(block).toContain("script-src 'self' https://unpkg.com;");
    expect(block).toMatch(/connect-src [^;]*https:\/\/api\.github\.com/);
    expect(block).toContain('X-Robots-Tag: noindex');
  });
});
