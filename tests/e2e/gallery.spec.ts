// Product gallery, larger view (iteration 4, spec 3): the button over the
// main photo opens a modal dialog with the photo at up to its exported size,
// focus stays inside it, the arrows and the keyboard switch photos, Escape,
// the close button and a click outside the buttons close it, focus returns
// to the opening button, and nothing moves on the page. The larger picture
// loads only when the dialog opens. Zoom (review 17): a click, Enter or Space
// on the photo, the "+" and "−" buttons or a double tap toggle a 2x view that
// pans with the arrow keys and a drag, fetches the largest file and never
// scales beyond 2x. Runs on the desktop and mobile projects.
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
  // The dark area above the photo, between the zoom and close buttons (on a
  // phone the photo takes the whole width, so the sides are photo).
  await page.mouse.click(page.viewportSize()!.width / 2, 4);
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

/** The scale and translation of the photo shown in the larger view. */
async function photoTransform(page: Page) {
  return page.locator('dialog.lightbox .lightbox-frame:not([hidden]) img').evaluate((img) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(img).transform);
    return { scale: m.a, x: m.e, y: m.f };
  });
}

/** The 1200 px file of the photo shown (the largest the zoom preset exports). */
async function largestFile(page: Page) {
  return page.locator('dialog.lightbox .lightbox-frame:not([hidden]) img').evaluate((img) => {
    const srcset = img.parentElement!.querySelector('source')!.srcset;
    return srcset
      .split(',')
      .map((c) => c.trim().split(/\s+/))
      .find(([, w]) => w === '1200w')![0]!;
  });
}

test('zoom: the photo toggles a 2x view that pans, and Escape still closes', async ({ page }) => {
  // No animated zoom: the transform is measured as soon as it is set.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PRODUCT.fr.path);
  const trigger = page.getByRole('button', { name: PRODUCT.fr.enlarge });
  await trigger.click();
  const dialog = page.locator('dialog.lightbox');
  const image = dialog.locator('.lightbox-frame:not([hidden]) img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  const zoomIn = dialog.getByRole('button', { name: 'Zoomer sur la photo' });
  const zoomOut = dialog.getByRole('button', { name: 'Voir la photo entière' });
  await expect(zoomIn).toHaveAttribute('aria-disabled', 'false');
  await expect(zoomOut).toHaveAttribute('aria-disabled', 'true');
  const fit = (await image.boundingBox())!;
  const cursor = () => image.evaluate((img) => getComputedStyle(img).cursor);
  expect(await cursor()).toBe('zoom-in');
  const layoutBefore = await image.evaluate((img) => [
    (img as HTMLElement).offsetWidth,
    (img as HTMLElement).offsetHeight,
  ]);

  // A click on the photo: twice as large, exactly, and the largest file.
  await image.click();
  await expect(dialog).toHaveClass(/is-zoomed/);
  expect((await photoTransform(page)).scale).toBe(2);
  const zoomedBox = (await image.boundingBox())!;
  expect(Math.round(zoomedBox.width)).toBe(Math.round(fit.width * 2));
  expect(await cursor()).toBe('zoom-out');
  await expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
  await expect(zoomOut).toHaveAttribute('aria-disabled', 'false');
  const file = await largestFile(page);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.currentSrc))
    .toContain(file);
  // A transform only: the photo's layout box did not change, the dialog does not scroll.
  expect(
    await image.evaluate((img) => [
      (img as HTMLElement).offsetWidth,
      (img as HTMLElement).offsetHeight,
    ]),
  ).toEqual(layoutBefore);
  expect(await dialog.evaluate((d) => [d.scrollTop, d.scrollLeft])).toEqual([0, 0]);
  // No blur and no pixelated rendering on the scaled photo.
  expect(await image.evaluate((img) => getComputedStyle(img).filter)).toBe('none');
  expect(await image.evaluate((img) => getComputedStyle(img).imageRendering)).toBe('auto');

  // Click again: back to the whole photo.
  await image.click();
  await expect(dialog).not.toHaveClass(/is-zoomed/);
  expect((await photoTransform(page)).scale).toBe(1);

  // Keyboard: Enter on the focused photo zooms, the arrows pan instead of
  // switching photos, Space returns to the whole photo.
  await image.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveClass(/is-zoomed/);
  const count = dialog.locator('[data-gallery-count]');
  await expect(count).toHaveText('1 / 2');
  const start = await photoTransform(page);
  await page.keyboard.press('ArrowDown');
  const down = await photoTransform(page);
  expect(down.y).toBeLessThan(start.y);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect((await photoTransform(page)).y).toBeGreaterThan(down.y);
  // The pan never goes past the photo's edge.
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp');
  const top = await photoTransform(page);
  const viewport = page.viewportSize()!;
  expect(top.y).toBeLessThanOrEqual(Math.max(0, (fit.height * 2 - viewport.height) / 2) + 0.5);
  const topEdge = (await image.boundingBox())!.y;
  expect(topEdge).toBeLessThanOrEqual(0.5);
  await expect(count).toHaveText('1 / 2');
  await page.keyboard.press(' ');
  await expect(dialog).not.toHaveClass(/is-zoomed/);

  // The "+" and "−" buttons, from the keyboard.
  await zoomIn.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveClass(/is-zoomed/);
  await zoomOut.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toHaveClass(/is-zoomed/);

  // A drag pans the 2x view and does not toggle it.
  await image.click();
  await expect(dialog).toHaveClass(/is-zoomed/);
  const before = await photoTransform(page);
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x, centre.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(dialog).toHaveClass(/is-zoomed/);
  expect((await photoTransform(page)).y).toBeGreaterThan(before.y);

  // Another photo starts whole; Escape closes as before, focus back on the opener.
  await dialog.getByRole('button', { name: 'Photo suivante' }).click();
  await expect(count).toHaveText('2 / 2');
  await expect(dialog).not.toHaveClass(/is-zoomed/);
  await dialog.locator('.lightbox-frame:not([hidden]) img').click();
  await expect(dialog).toHaveClass(/is-zoomed/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  // Reopened: the whole photo again.
  await trigger.click();
  await expect(dialog).not.toHaveClass(/is-zoomed/);
  expect((await photoTransform(page)).scale).toBe(1);
});

test('zoom: Tab reaches the photo and the zoom buttons without leaving the dialog', async ({
  page,
}) => {
  await page.goto(PRODUCT.en.path);
  await page.getByRole('button', { name: PRODUCT.en.enlarge }).click();
  const dialog = page.locator('dialog.lightbox');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  const seen = new Set<string>();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    seen.add(
      await page.evaluate(() => {
        const el = document.activeElement!;
        return el.tagName === 'IMG' ? 'photo' : (el.textContent ?? '').trim();
      }),
    );
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  expect([...seen].sort()).toEqual(
    [
      'Close',
      'Next photo',
      'Previous photo',
      'See the whole photo',
      'Zoom in on the photo',
      'photo',
    ].sort(),
  );
});

test('zoom: a double tap toggles it on touch, a single tap does not', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch only');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PRODUCT.fr.path);
  await page.getByRole('button', { name: PRODUCT.fr.enlarge }).tap();
  const dialog = page.locator('dialog.lightbox');
  const image = dialog.locator('.lightbox-frame:not([hidden]) img');
  await expect(image).toBeVisible();
  // Native pinch stays available on the photo, whole or zoomed.
  expect(await image.evaluate((img) => getComputedStyle(img).touchAction)).toBe('manipulation');

  await image.tap();
  await page.waitForTimeout(400);
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveClass(/is-zoomed/);

  await image.tap();
  await image.tap();
  await expect(dialog).toHaveClass(/is-zoomed/);
  expect((await photoTransform(page)).scale).toBe(2);
  expect(await image.evaluate((img) => getComputedStyle(img).touchAction)).toBe('pinch-zoom');
  await page.waitForTimeout(400);
  await image.tap();
  await image.tap();
  await expect(dialog).not.toHaveClass(/is-zoomed/);
});

test('axe finds no violation with the zoomed view', async ({ page }) => {
  await page.goto(PRODUCT.fr.path);
  await page.getByRole('button', { name: PRODUCT.fr.enlarge }).click();
  const dialog = page.locator('dialog.lightbox');
  await expect(dialog.locator('.lightbox-frame img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Zoomer sur la photo' }).click();
  await expect(dialog).toHaveClass(/is-zoomed/);
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
