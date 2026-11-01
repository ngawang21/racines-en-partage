// Read the content files from disk the way the CMS writes them, without Astro.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CONTENT = join(ROOT, 'src/content');

export const readYaml = (path: string): unknown => parse(readFileSync(path, 'utf8'));
export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** slug -> parsed YAML for every file of `src/content/<collection>/<locale>/`. */
export function yamlFolder(collection: string, locale: string): Map<string, unknown> {
  const dir = join(CONTENT, collection, locale);
  return new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith('.yml'))
      .sort()
      .map((f) => [f.replace(/\.yml$/, ''), readYaml(join(dir, f))]),
  );
}

/** "/src/assets/products/x.webp" exists in the repository. */
export const assetExists = (path: string): boolean =>
  path.startsWith('/src/assets/') && existsSync(join(ROOT, path));

/** Every string leaf of a value with its path. */
export function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}
