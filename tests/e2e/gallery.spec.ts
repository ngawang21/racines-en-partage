// Product gallery, larger view (iteration 4, spec 3): the button over the
// main photo opens a modal dialog with the photo at up to its exported size,
// focus stays inside it, the arrows and the keyboard switch photos, Escape,
// the close button and a click outside the buttons close it, focus returns
// to the opening button, and nothing moves on the page. The larger picture
// loads only when the dialog opens. Runs on the desktop and mobile projects.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { blockThirdParties, json } from './helpers';

const PRODUCT = {
  fr: { path: '/produits/fleurs-d-hibiscus-bissap-100g/', enlarge: 'Agrandir la photo' },
  en: { path: '/en/products/fleurs-d-hibiscus-bissap-100g/', enlarge: 'Enlarge the photo' },
} as const;

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
  await page.route('**/api/**', (route) =>
    json(route, 503, { error: { code: 'UNAVAILABLE', message: 'mocked' } }),
  );
});

/** The gallery frame's position in the page (not the viewport). */
async function framePosition(page: Page) {
  return page.locator('.gallery-main').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  });
}

const largeRequests = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (request) => {
    // The larger view is WebP only; the page's own pictures are AVIF first.
    if (/hibiscus-100\.[^/]*\.webp/.test(request.url())) seen.push(request.url());
  });
  return seen;
};

test('opens the larger view, keeps focus inside, closes with Escape and returns focus', async ({
  page,
}) => {
  const requests = largeRequests(page);
  await page.goto(PRODUCT.fr.path);
  await page.waitForLoadState('networkidle');
  expect(requests, 'no large WebP before the dialog opens').toEqual([]);

  const trigger = page.getByRole('button', { name: PRODUCT.fr.enlarge });
  await trigger.scrollIntoViewIfNeeded();
  const before = await framePosition(page);
  const dialog = page.locator('dialog.lightbox');
  await expect(dialog).toBeHidden();

  // Keyboard activation (Enter) on the real button.
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('open', '');
  const close = dialog.getByRole('button', { name: 'Fermer' });
  await expect(close).toBeFocused();

  const image = dialog.locator('.lightbox-frame:not([hidden]) img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  expect(requests.length, 'the larger picture loads on opening').toBeGreaterThan(0);

  // The photo fits the viewport and fills the width on a phone.
  const viewport = page.viewportSize()!;
  const box = (await image.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  if (viewport.width < 900) expect(Math.round(box.width)).toBe(viewport.width);

  // Tab and Shift+Tab never leave the dialog.
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }

  // Two photos on this product: the arrow keys and buttons switch them.
  const count = dialog.locator('[data-gallery-count]');
  await expect(count).toHaveText('1 / 2');
  await page.keyboard.press('ArrowRight');
  await expect(count).toHaveText('2 / 2');
  await dialog.getByRole('button', { name: 'Photo précédente' }).click();
  await expect(count).toHaveText('1 / 2');
  await page.keyboard.press('ArrowLeft');
  await expect(count).toHaveText('2 / 2');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  // The gallery now shows the photo last seen, and nothing moved.
  await expect(page.locator('[data-gallery-slide="1"]')).toBeVisible();
  expect(await framePosition(page)).toEqual(before);
});

test('closes with the close button and with a click outside the buttons', async ({ page }) => {
  await page.goto(PRODUCT.en.path);
  const trigger = page.getByRole('button', { name: PRODUCT.en.enlarge });
  const dialog = page.locator('dialog.lightbox');

  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  // The dark area around the photo, below the close button.
  await page.mouse.click(4, page.viewportSize()!.height / 3);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('axe finds no violation with the larger view open', async ({ page }) => {
  await page.goto(PRODUCT.fr.path);
  await page.getByRole('button', { name: PRODUCT.fr.enlarge }).click();
  const dialog = page.locator('dialog.lightbox');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.lightbox-frame img')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
});
