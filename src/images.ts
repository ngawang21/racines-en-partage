import type { ImageMetadata } from 'astro';

// Every raster or SVG under src/assets, keyed by its root-relative path
// ("/src/assets/products/moringa-100.webp"), the form the CMS writes.
const ASSETS = import.meta.glob<{ default: ImageMetadata }>('/src/assets/**/*.{webp,png,jpg,svg}', {
  eager: true,
});

export function hasAsset(path: string): boolean {
  return Object.hasOwn(ASSETS, path);
}

/** The image module behind a content path; throws at build on a missing file. */
export function resolveAsset(path: string): ImageMetadata {
  const mod = ASSETS[path];
  if (!mod) {
    throw new Error(
      `resolveAsset: no image at "${path}". Content image paths start with /src/assets/ ` +
        `and the file must exist in the repository (check the spelling and the extension).`,
    );
  }
  return mod.default;
}

/**
 * The close-up of a pouch's contents, cut from the owner's photo through the
 * pouch window: `/src/assets/products/<file>` has its strip (2:1) at
 * `/src/assets/products/detail/<file>`. Undefined while the strip does not
 * exist, so callers render it only when it is there.
 */
export function detailAsset(productImage: string): string | undefined {
  const path = productImage.replace('/src/assets/products/', '/src/assets/products/detail/');
  return path !== productImage && hasAsset(path) ? path : undefined;
}
