// The brand "duo" photos show two products side by side
// (src/assets/brand/duo-<a>-<b>.webp). A product page adds the duo that shows
// its product as a second gallery photo: the first word of the product's main
// image file ("moringa" in moringa-100.webp) must be one of the duo's words.
// Display only; the product file's `images` list stays the source of truth.
import type { ImageMetadata } from 'astro';

const DUOS = import.meta.glob<{ default: ImageMetadata }>('/src/assets/brand/duo-*.webp', {
  eager: true,
});

export function companionPhoto(mainImage: string): ImageMetadata | undefined {
  const stem = mainImage.split('/').pop()?.split(/[-.]/)[0];
  if (!stem) return undefined;
  for (const [path, mod] of Object.entries(DUOS)) {
    const words = (path.split('/').pop() ?? '')
      .replace(/\.webp$/, '')
      .split('-')
      .slice(1);
    if (words.includes(stem)) return mod.default;
  }
  return undefined;
}
