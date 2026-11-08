// Back/forward cache restores (project `bfcache` in playwright.config.ts:
// full Chromium with the cache on). Each test first checks that Back really
// restored the page from the cache (`pageshow` with `persisted`), otherwise
// it would prove nothing.
import { expect, test, type Page } from '@playwright/test';
import { blockThirdParties } from './helpers';

const PRODUCT = '/produits/poudre-de-moringa-100g/';
const SKU = 'REP-MOR-100';

declare global {
  interface Window {
    __persisted?: boolean;
  }
}

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
  await page.addInitScript(() => {
    window.addEventListener('pageshow', (e) => {
      window.__persisted = e.persisted;
    });
  });
});

async function backFromCache(page: Page) {
  await page.goBack({ waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => window.__persisted)).toBe(true);
}

const storedLines = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('rep.cart.v1') ?? '{"lines":[]}') as {
          lines: Array<{ sku: string; quantity: number }>;
        }
      ).lines,
  );

test('the cart drawer is closed after Back from the page it linked to (C5)', async ({ page }) => {
  await page.goto(PRODUCT);
  await page.locator('[data-buy-block] button[data-add-to-cart]').click();
  const drawer = page.locator('#cart-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('a[href="/commande/"]').click();
  await page.waitForURL('**/commande/');
  await backFromCache(page);
  await expect(drawer).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/has-drawer/);
  await expect(page.locator('[data-cart-toggle]').first()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('a restored page re-reads the cart, even when the storage event is lost (C8)', async ({
  page,
}) => {
  // WebKit may not deliver the storage event to a page restored from the
  // cache: drop it here, so only the pageshow re-read can keep the page in step.
  await page.addInitScript(() => {
    window.addEventListener('storage', (e) => e.stopImmediatePropagation());
  });
  await page.goto(PRODUCT);
  await page.locator('[data-buy-block] button[data-add-to-cart]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cart-drawer')).toBeHidden();

  // Elsewhere: the line becomes 3.
  await page.goto('/panier/');
  const qty = page.locator(`[data-cart-page-lines] li[data-sku="${SKU}"] [data-line-qty]`);
  await qty.fill('3');
  await qty.press('Enter');
  await expect.poll(() => storedLines(page)).toEqual([{ sku: SKU, quantity: 3 }]);

  await backFromCache(page);
  await expect(page.locator('[data-cart-count]').first()).toHaveText('3');

  // An add on the restored page keeps the change made elsewhere.
  const other = page
    .locator(`main button[data-add-to-cart]:not([disabled]):not([data-sku="${SKU}"])`)
    .first();
  const otherSku = (await other.getAttribute('data-sku'))!;
  await other.click();
  await expect
    .poll(() => storedLines(page))
    .toEqual([
      { sku: SKU, quantity: 3 },
      { sku: otherSku, quantity: 1 },
    ]);
});
