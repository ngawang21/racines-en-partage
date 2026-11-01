// Accessibility (spec 7): axe-core on home, shop, a product page, the cart
// with items added through the UI (and the drawer open), checkout with pickup
// selected and the FAQ, in both locales and at both viewports. Serious and
// critical violations fail the test; every violation is attached to the
// report, and A11Y_VERBOSE=1 prints them.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PATHS, blockThirdParties, json, type Locale } from './helpers';

const HOME = { fr: '/', en: '/en/' } as const;
const FAQ = { fr: '/faq/', en: '/en/faq/' } as const;
const PICKUP = { fr: /Retrait/, en: /pickup in Arnouville/i } as const;
const FAILING = new Set(['serious', 'critical']);

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
  // No Worker behind the preview: any API call answers a neutral error.
  await page.route('**/api/**', (route) =>
    json(route, 503, { error: { code: 'UNAVAILABLE', message: 'mocked' } }),
  );
});

async function audit(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  if (process.env.A11Y_VERBOSE) {
    for (const v of summary)
      console.log(
        `[${testInfo.project.name}] ${label}: ${v.impact} ${v.id} ${v.targets.join(', ')}`,
      );
  }
  const failing = summary.filter((v) => FAILING.has(v.impact ?? ''));
  expect.soft(failing, `${label}: serious or critical axe violations`).toEqual([]);
}

async function addTwoProducts(page: Page, locale: Locale): Promise<void> {
  await page.goto(PATHS[locale].shop);
  const adds = page.locator('button[data-add-to-cart]:not([disabled])');
  const drawer = page.locator('#cart-drawer');
  await adds.nth(0).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await adds.nth(1).click();
  await expect(drawer.locator('li[data-sku]')).toHaveCount(2);
}

for (const locale of ['fr', 'en'] as const satisfies readonly Locale[]) {
  test.describe(`a11y (${locale})`, () => {
    test('home', async ({ page }, testInfo) => {
      await page.goto(HOME[locale]);
      await audit(page, testInfo, `home-${locale}`);
    });

    test('shop', async ({ page }, testInfo) => {
      await page.goto(PATHS[locale].shop);
      await audit(page, testInfo, `shop-${locale}`);
    });

    test('product', async ({ page }, testInfo) => {
      await page.goto(PATHS[locale].shop);
      const href = await page
        .locator('main a[href*="/produits/"], main a[href*="/products/"]')
        .first()
        .getAttribute('href');
      await page.goto(href!);
      await audit(page, testInfo, `product-${locale}`);
    });

    test('faq', async ({ page }, testInfo) => {
      await page.goto(FAQ[locale]);
      await audit(page, testInfo, `faq-${locale}`);
    });

    test('drawer, cart and checkout with pickup', async ({ page }, testInfo) => {
      await addTwoProducts(page, locale);
      await audit(page, testInfo, `drawer-${locale}`);
      await page.keyboard.press('Escape');

      await page.goto(PATHS[locale].cart);
      await expect(page.locator('[data-cart-page-lines] li[data-sku]')).toHaveCount(2);
      await audit(page, testInfo, `cart-${locale}`);

      await page.locator('[data-cart-page-checkout]').click();
      await expect(page.locator('[data-co-lines] li[data-sku]')).toHaveCount(2);
      await page.locator('.method-card', { hasText: PICKUP[locale] }).click();
      await expect(page.locator('[data-method-detail="pickup"]')).toBeVisible();
      await audit(page, testInfo, `checkout-${locale}`);
    });
  });
}
