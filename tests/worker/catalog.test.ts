import { describe, expect, it, vi } from 'vitest';
import { CATALOG_TTL_MS, createCatalogCache, parseCatalog } from '../../worker/catalog';
import { catalogFixture } from './fixtures';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('catalogue schema', () => {
  it('accepts the fixture (same shape as dist/catalog.json and WorkerCatalog)', () => {
    expect(parseCatalog(catalogFixture())).toEqual(catalogFixture());
  });

  it('rejects amounts in euros, unknown stock and non-https images', () => {
    const bad = catalogFixture();
    bad.products[0] = { ...bad.products[0]!, unitAmount: 8.9 };
    expect(() => parseCatalog(bad)).toThrow(/products\.0\.unitAmount/);
    expect(() =>
      parseCatalog({
        ...catalogFixture(),
        products: [{ ...catalogFixture().products[0], stock: 'maybe' }],
      }),
    ).toThrow(/stock/);
    expect(() =>
      parseCatalog({
        ...catalogFixture(),
        products: [{ ...catalogFixture().products[0], image: 'http://racinesenpartage.fr/a.webp' }],
      }),
    ).toThrow(/image/);
  });

  it('rejects an unknown shipping method', () => {
    const data = {
      ...catalogFixture(),
      shipping: [{ ...catalogFixture().shipping[0], id: 'drone' }],
    };
    expect(() => parseCatalog(data)).toThrow(/shipping\.0\.id/);
  });
});

describe('catalogue cache', () => {
  it('serves the cached copy for 60 s, then fetches again', async () => {
    const cache = createCatalogCache();
    let t = Date.parse('2026-11-01T18:00:00Z');
    const now = () => new Date(t);
    const fetchCatalog = vi.fn(async () => jsonResponse(catalogFixture()));

    await cache.get(fetchCatalog, now);
    t += CATALOG_TTL_MS - 1;
    await cache.get(fetchCatalog, now);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);

    t += 1;
    await cache.get(fetchCatalog, now);
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  it('shares one fetch between concurrent callers', async () => {
    const cache = createCatalogCache();
    const fetchCatalog = vi.fn(async () => jsonResponse(catalogFixture()));
    const now = () => new Date('2026-11-01T18:00:00Z');
    await Promise.all([cache.get(fetchCatalog, now), cache.get(fetchCatalog, now)]);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const cache = createCatalogCache();
    const now = () => new Date('2026-11-01T18:00:00Z');
    const fetchCatalog = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(catalogFixture()));
    await expect(cache.get(fetchCatalog, now)).rejects.toThrow(/HTTP 500/);
    await expect(cache.get(fetchCatalog, now)).resolves.toMatchObject({ currency: 'eur' });
  });

  it('rejects an invalid file', async () => {
    const cache = createCatalogCache();
    const fetchCatalog = async () => jsonResponse({ currency: 'usd' });
    await expect(cache.get(fetchCatalog, () => new Date())).rejects.toThrow(
      /catalog\.json is invalid/,
    );
  });
});
