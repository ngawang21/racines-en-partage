// Build-time access to the catalogues (owner: foundation). Server side only:
// it imports astro:assets and the content loaders. Client code imports the
// types from src/catalog/build.ts and reads the embedded JSON:
//
//   ---
//   import { getClientCatalog, serializeForScript } from '../cart/catalog';
//   const catalog = await getClientCatalog(locale);
//   ---
//   <script type="application/json" id="rep-catalog" set:html={serializeForScript(catalog)} />
//
//   // client
//   import type { ClientCatalog } from '../catalog/build';
//   const catalog = JSON.parse(document.getElementById('rep-catalog')!.textContent!) as ClientCatalog;
import { getImage } from 'astro:assets';
import { DEFAULT_LOCALE, LOCALES, SITE, type Locale } from '../consts';
import type { Product } from '../content/schemas';
import { loadProducts, loadSettings } from '../i18n/locale';
import { resolveAsset } from '../images';
import {
  buildCatalog,
  buildClientCatalog,
  serializeForScript,
  type ClientCatalog,
  type WorkerCatalog,
} from '../catalog/build';

export { serializeForScript };
export type { ClientCatalog, WorkerCatalog };

/** Width of the cart thumbnails in the client catalogue (2x a 64 px slot, rounded up). */
export const CLIENT_THUMB_WIDTH = 160;
/** Width of the image the Worker sends to Stripe and the e-mails. */
export const WORKER_IMAGE_WIDTH = 800;

/** Main image of each product rendered as WebP at `width`, root-relative URLs. */
async function mainImageUrls(products: Product[], width: number): Promise<Record<string, string>> {
  const entries = await Promise.all(
    products.map(async (p) => {
      const src = resolveAsset(p.images[0] as string);
      const img = await getImage({ src, width: Math.min(width, src.width), format: 'webp' });
      return [p.sku, img.src] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function getClientCatalog(locale: Locale): Promise<ClientCatalog> {
  const products = await loadProducts(locale);
  const images = await mainImageUrls(products, CLIENT_THUMB_WIDTH);
  return buildClientCatalog(products, await loadSettings(), locale, images);
}

export async function getWorkerCatalog(now: Date = new Date()): Promise<WorkerCatalog> {
  const byLocale = Object.fromEntries(
    await Promise.all(LOCALES.map(async (l) => [l, await loadProducts(l)] as const)),
  ) as Record<Locale, Product[]>;
  const relative = await mainImageUrls(byLocale[DEFAULT_LOCALE], WORKER_IMAGE_WIDTH);
  const absolute = Object.fromEntries(
    Object.entries(relative).map(([sku, src]) => [sku, new URL(src, SITE.url).href]),
  );
  return buildCatalog(byLocale, await loadSettings(), absolute, now);
}
