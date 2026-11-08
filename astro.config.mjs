import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { alternatesFor, matchRoute, noindexPathFragments } from './src/i18n/routing.ts';

// Paths of the noindex routes (cart, checkout, thanks, 404, admin) in both
// locales, from the single route table.
const noindex = noindexPathFragments();

// "dev", "build", "preview", "check" or "sync" (`astro <command>`).
const command = process.argv[2];

export default defineConfig({
  site: 'https://racinesenpartage.fr',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: 'jsx',
  // The toolbar adds about 1.3 MB of scripts to every page in dev (its audit
  // alone bundles aria-query and axobject-query). Accessibility is checked by
  // axe in the e2e suite instead. Re-enable for one session with
  // `pnpm exec astro preferences enable devToolbar` if ever needed.
  devToolbar: { enabled: false },
  vite: {
    // `astro build` pre-bundles dependencies with a different hash than
    // `astro dev`. With one shared cache, every build made the next dev start
    // re-optimise everything; dev keeps the default folder, the rest use
    // their own.
    cacheDir: command === 'dev' ? 'node_modules/.vite' : 'node_modules/.vite-build',
    build: {
      // Keep bundled component scripts as external files. The CSP in
      // public/_headers sets `script-src 'self'` with no `unsafe-inline`, so a
      // script Astro inlined for being small would be blocked in production.
      // Returning undefined for everything else keeps Vite's default limit.
      assetsInlineLimit: (filePath) => (filePath.endsWith('.js') ? false : undefined),
    },
  },
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !noindex.some((fragment) => path.startsWith(fragment));
      },
      // The French and English paths differ (/boutique/ and /en/shop/), so the
      // integration's own i18n pairing (same path after the prefix) cannot
      // find the twins. The alternates come from the route table instead,
      // with the same codes the pages advertise in their hreflang links.
      serialize: (item) => {
        const match = matchRoute(new URL(item.url).pathname);
        if (match) {
          item.links = alternatesFor(match.key, match.slug).map((a) => ({
            lang: a.hreflang,
            url: a.href,
          }));
        }
        return item;
      },
    }),
  ],
});
