// Accessibility (spec 7): axe-core on home, shop, a product page, the cart
// with items added through the UI (and the drawer open, with its cross-sell),
// checkout with pickup selected and the FAQ, in both locales and at both
// viewports. Serious and critical violations fail the test; every violation is
// attached to the report, and A11Y_VERBOSE=1 prints them. The iteration 3
// pages (contact form, order lookup, review, newsletter landing) must have no
// violation at all.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PATHS, blockThirdParties, json, orderFixture, readCatalog, type Locale } from './helpers';

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

async function audit(
  page: Page,
  testInfo: TestInfo,
  label: string,
  failing: (impact: string) => boolean = (impact) => FAILING.has(impact),
): Promise<void> {
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
  expect
    .soft(
      summary.filter((v) => failing(v.impact ?? '')),
      `${label}: axe violations`,
    )
    .toEqual([]);
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

const NEW_PAGES = {
  contact: { fr: '/contact/', en: '/en/contact/' },
  lookup: { fr: '/ma-commande/', en: '/en/my-order/' },
  review: { fr: '/avis/', en: '/en/review/' },
  newsletter: { fr: '/newsletter/', en: '/en/newsletter/' },
} as const;
const ANY = () => true;

for (const locale of ['fr', 'en'] as const satisfies readonly Locale[]) {
  test.describe(`a11y, iteration 3 pages (${locale})`, () => {
    test('contact page with the form and its inline errors', async ({ page }, testInfo) => {
      await page.goto(NEW_PAGES.contact[locale]);
      await audit(page, testInfo, `contact-${locale}`, ANY);
      await page.locator('form[data-form="contact"] [data-form-submit]').click();
      await expect(page.locator('#contact-name')).toHaveAttribute('aria-invalid', 'true');
      await audit(page, testInfo, `contact-errors-${locale}`, ANY);
    });

    test('order lookup, empty then with an order', async ({ page }, testInfo) => {
      await page.goto(NEW_PAGES.lookup[locale]);
      await audit(page, testInfo, `lookup-${locale}`, ANY);
      await page.route('**/api/orders/lookup', (route) =>
        json(
          route,
          200,
          orderFixture([{ name: 'Poudre de moringa 100 g', quantity: 1, unitAmount: 890 }]),
        ),
      );
      await page.locator('#lookup-number').fill('X9Y8Z7W6');
      await page.locator('#lookup-email').fill('awa@exemple.fr');
      await page.locator('[data-lookup-form] [data-form-submit]').click();
      await expect(page.locator('[data-lookup-result]')).toBeVisible();
      await audit(page, testInfo, `lookup-order-${locale}`, ANY);
    });

    test('review page with its forms', async ({ page }, testInfo) => {
      await page.goto(PATHS[locale].shop);
      const skus = Object.keys((await readCatalog(page)).products).slice(0, 2);
      const payload = {
        s: 'cs_test_1',
        k: skus,
        l: locale,
        e: Math.floor(Date.now() / 1000) + 600,
      };
      const token = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2ln`;
      await page.goto(`${NEW_PAGES.review[locale]}?t=${token}`);
      await expect(page.locator('[data-review-list] article')).toHaveCount(2);
      await audit(page, testInfo, `review-${locale}`, ANY);
    });

    test('newsletter landing page, both statuses', async ({ page }, testInfo) => {
      for (const status of ['ok', 'invalid']) {
        await page.goto(`${NEW_PAGES.newsletter[locale]}?status=${status}`);
        await expect(page.locator(`[data-landing-when="${status}"]`)).toBeVisible();
        await audit(page, testInfo, `newsletter-${status}-${locale}`, ANY);
      }
    });
  });

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
