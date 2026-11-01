// The Worker reads prices, stock and shipping from `/catalog.json` (spec 6.2)
// through its ASSETS binding, validates it and keeps it for 60 seconds.
import { z } from 'zod';
import type { WorkerCatalog } from '../src/catalog/build';
import { SHIPPING_METHODS, STOCK } from '../src/content/schemas';

const localised = z.object({ fr: z.string(), en: z.string() });

export const workerCatalogSchema = z.object({
  generatedAt: z.string(),
  currency: z.literal('eur'),
  vatMode: z.enum(['franchise', 'included']),
  shopOpen: z.boolean(),
  maxQuantityPerLine: z.number().int().positive(),
  freeShippingFrom: z.number().int().nonnegative().nullable(),
  shipping: z.array(
    z.object({
      id: z.enum(SHIPPING_METHODS),
      enabled: z.boolean(),
      amount: z.number().int().nonnegative(),
      countries: z.array(z.string().regex(/^[A-Z]{2}$/)),
      label: localised,
      estimate: localised,
    }),
  ),
  products: z.array(
    z.object({
      sku: z.string().min(1),
      slug: z.string().min(1),
      unitAmount: z.number().int().positive(),
      weightGrams: z.number().positive(),
      stock: z.enum(STOCK),
      name: localised,
      image: z.url({ protocol: /^https$/ }),
    }),
  ),
});

// Compile-time proof that the schema and the build-side type describe the same shape.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type CatalogSchemaMatchesType = Assert<
  Same<z.infer<typeof workerCatalogSchema>, WorkerCatalog>
>;

export type { WorkerCatalog };
export type CatalogProduct = WorkerCatalog['products'][number];
export type CatalogShipping = WorkerCatalog['shipping'][number];

export const CATALOG_TTL_MS = 60_000;

/** Parses and validates a catalogue; throws with the first issues on a bad file. */
export function parseCatalog(data: unknown): WorkerCatalog {
  const parsed = workerCatalogSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`catalog.json is invalid: ${issues}`);
  }
  return parsed.data;
}

/**
 * A catalogue cache. `index.ts` keeps one in module scope (per isolate);
 * tests create their own and drive time with `now`.
 */
export function createCatalogCache(ttlMs = CATALOG_TTL_MS) {
  let entry: { catalog: WorkerCatalog; expiresAt: number } | null = null;
  let pending: Promise<WorkerCatalog> | null = null;

  async function fetchFresh(fetchCatalog: () => Promise<Response>, now: () => Date) {
    const res = await fetchCatalog();
    if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`);
    const catalog = parseCatalog(await res.json());
    entry = { catalog, expiresAt: now().getTime() + ttlMs };
    return catalog;
  }

  return {
    get(fetchCatalog: () => Promise<Response>, now: () => Date): Promise<WorkerCatalog> {
      if (entry && now().getTime() < entry.expiresAt) return Promise.resolve(entry.catalog);
      // Concurrent requests share one fetch.
      pending ??= fetchFresh(fetchCatalog, now).finally(() => {
        pending = null;
      });
      return pending;
    },
    clear(): void {
      entry = null;
    },
  };
}

/** `/catalog.json` through the ASSETS binding, addressed on the request origin. */
export function assetCatalogFetcher(assets: Fetcher, origin: string): () => Promise<Response> {
  return () => assets.fetch(new URL('/catalog.json', origin).toString());
}
