// Navigation and search keyboard (review 17): "Recettes" in the primary
// navigation, the phone menu that keeps Tab out of the page behind it and
// marks the current section, a desktop header that still fits at 1024 px with
// five links, and the search results reachable with the arrow keys.
import { expect, test, type Page } from '@playwright/test';
import { blockThirdParties } from './helpers';

const RECIPE = '/recettes/jus-de-bissap/';

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

/** Where focus is: inside the header, inside main or the footer, or elsewhere. */
const focusZone = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    if (el.closest('.mobile-nav') || el.closest('details.mobile-menu > summary')) return 'menu';
    if (el.closest('[data-site-header]')) return 'header';
    if (el.closest('main, .site-footer')) return 'page';
    return el.tagName.toLowerCase();
  });

test('phone menu: Recettes is current on a recipe page and Tab never reaches the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECIPE);
  const menu = page.locator('details.mobile-menu');
  const summary = menu.locator('summary');
  await summary.click();
  await expect(menu).toHaveAttribute('open', '');

  const links = menu.locator('.mobile-nav > ul a');
  await expect(links).toHaveText(['Boutique', 'Recettes', 'Notre histoire', 'FAQ', 'Contact']);
  const current = menu.locator('.mobile-nav > ul a[aria-current="page"]');
  await expect(current).toHaveText('Recettes');
  // Visibly marked: the gold bar on the panel edge.
  const bar = await current.evaluate((a) => getComputedStyle(a, '::before').width);
  expect(bar).toBe('4px');

  await expect(page.locator('#main')).toHaveAttribute('inert', '');
  await expect(page.locator('.site-footer')).toHaveAttribute('inert', '');
  await summary.focus();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await focusZone(page), `Tab ${i + 1}`).not.toBe('page');
  }

  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await expect(page.locator('#main')).not.toHaveAttribute('inert');
  await expect(page.locator('.site-footer')).not.toHaveAttribute('inert');
});

test('phone menu: choosing a link closes it and the next page is live again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('details.mobile-menu summary').click();
  await page.locator('.mobile-nav > ul a', { hasText: 'Recettes' }).click();
  await expect(page).toHaveURL(/\/recettes\/$/);
  await expect(page.locator('#main')).not.toHaveAttribute('inert');
  await expect(
    page.locator('.mobile-nav > ul a[aria-current="page"]', { hasText: 'Recettes' }),
  ).toHaveCount(1);
});

test('desktop header fits at 1024 px with five links, the language pill and three icons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const path of ['/', '/en/']) {
    await page.goto(path);
    const nav = page.locator('.desktop-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(5);
    const box = await page.evaluate(() => {
      const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const bar = document.querySelector('[data-site-header] .bar')!;
      const links = [...document.querySelectorAll('.desktop-nav a')].map((a) =>
        a.getBoundingClientRect(),
      );
      return {
        overflow: bar.scrollWidth - bar.clientWidth,
        brandRight: rect('.brand').right,
        navLeft: rect('.desktop-nav').left,
        navRight: rect('.desktop-nav').right,
        toolsLeft: rect('.tools').left,
        toolsRight: rect('.tools').right,
        // Each label on one line: its text has a single line box.
        oneLine: [...document.querySelectorAll('.desktop-nav a')].every((a) => {
          const range = document.createRange();
          range.selectNodeContents(a);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size === 1;
        }),
        sameRow: links.every((r) => Math.abs(r.top - links[0]!.top) < 2),
        // The wordmark is shown whole, not cut with an ellipsis.
        wordmarkCut: (() => {
          const w = document.querySelector<HTMLElement>('.brand .wordmark')!;
          return w.scrollWidth - w.clientWidth;
        })(),
      };
    });
    expect(box.overflow, path).toBeLessThanOrEqual(0);
    expect(box.brandRight, path).toBeLessThanOrEqual(box.navLeft);
    expect(box.navRight, path).toBeLessThanOrEqual(box.toolsLeft);
    expect(box.toolsRight, path).toBeLessThanOrEqual(1024);
    expect(box.oneLine, path).toBe(true);
    expect(box.sameRow, path).toBe(true);
    expect(box.wordmarkCut, path).toBeLessThanOrEqual(0);
  }
});

test('desktop: Recettes is current on the recipes list and on a recipe page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ['/recettes/', RECIPE, '/en/recipes/']) {
    await page.goto(path);
    await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText(
      path.startsWith('/en/') ? 'Recipes' : 'Recettes',
    );
  }
});

test('the cart badge shows no "0" before or after the cart script runs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const badge = page.locator('.site-header [data-cart-count]');
  await expect(badge).toHaveAttribute('data-empty', '');
  await expect(badge).toHaveCSS('opacity', '0');
});

test('search: arrow keys move through the results, Enter opens one, close comes last', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.locator('.site-header [data-search-open]').click();
  const input = page.locator('#search-input');
  await expect(input).toBeFocused();
  await input.fill('bissap');
  const results = page.locator(
    '#search-dialog [data-search-results] .sr-name, #search-dialog [data-search-recipe-list] .sr-recipe',
  );
  await expect(results.first()).toBeVisible();
  const count = await results.count();
  expect(count).toBeGreaterThan(1);

  await page.keyboard.press('ArrowDown');
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(results.nth(1)).toBeFocused();
  // Past the last result, focus stays on it.
  for (let i = 0; i < count; i++) await page.keyboard.press('ArrowDown');
  await expect(results.nth(count - 1)).toBeFocused();
  for (let i = 0; i < count - 1; i++) await page.keyboard.press('ArrowUp');
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(input).toBeFocused();

  // The close button follows the results in the tab order.
  const order = await page.evaluate(() => {
    const close = document.querySelector('#search-dialog [data-search-close]')!;
    const list = document.querySelector('#search-dialog [data-search-results]')!;
    return list.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(order).toBeTruthy();

  await page.keyboard.press('ArrowDown');
  const href = await results.nth(0).getAttribute('href');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[/.]/g, '\\$&')}$`));
});
