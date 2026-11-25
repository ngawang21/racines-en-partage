// Format chips on product cards (client feedback, master plan 3.4 and 3.6):
// a click, Space or Enter on "200 g" shows that format in the card (price,
// price per kilo, add button, title link) without leaving the page; the add
// button then adds the chosen format. A ctrl-click still follows the link.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { PATHS, blockThirdParties, formatInPage, type Locale } from './helpers';

const product = (slug: string) =>
  parse(readFileSync(`src/content/products/fr/${slug}.yml`, 'utf8')) as {
    sku: string;
    price: number;
  };
const LIGHT = product('poudre-de-baobab-100g');
const HEAVY = product('poudre-de-baobab-200g');
const cents = (p: { price: number }) => Math.round(p.price * 100);

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

const storedLines = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('rep.cart.v1') ?? '{"lines":[]}') as {
          lines: Array<{ sku: string; quantity: number }>;
        }
      ).lines,
  );

async function baobabCard(page: Page, locale: Locale) {
  await page.goto(PATHS[locale].shop);
  const card = page.locator('[data-product-card]', {
    has: page.locator(`a.card-format[data-sku="${HEAVY.sku}"]`),
  });
  await expect(card).toHaveCount(1);
  const chip = (sku: string) => card.locator(`a.card-format[data-sku="${sku}"]`);
  // The script has run: the chips are toggles, the lightest one pressed.
  await expect(chip(LIGHT.sku)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(HEAVY.sku)).toHaveAttribute('aria-pressed', 'false');
  return { card, light: chip(LIGHT.sku), heavy: chip(HEAVY.sku) };
}

test('a click on 200 g shows its price in place and the add button adds the 200 g', async ({
  page,
}) => {
  const { card, light, heavy } = await baobabCard(page, 'fr');
  const price = card.locator('.card-price');
  const from = card.locator('.card-from');
  const add = card.locator('button[data-add-to-cart]');
  const status = card.locator('[data-card-status]');
  await expect(price).toHaveText(await formatInPage(page, cents(LIGHT), 'fr'));
  await expect(from).toBeVisible();
  await expect(add).toHaveAttribute('data-sku', LIGHT.sku);
  await expect(status).toHaveText('');
  await expect(card.locator('.card-formats')).toHaveAttribute('role', 'group');
  await expect(heavy).toHaveAttribute('role', 'button');
  const sortPrice = await card.getAttribute('data-price');
  const width = (await add.boundingBox())!.width;

  await heavy.click();
  await expect(page).toHaveURL(PATHS.fr.shop);
  const heavyPrice = await formatInPage(page, cents(HEAVY), 'fr');
  await expect(price).toHaveText(heavyPrice);
  await expect(from).toBeHidden();
  await expect(heavy).toHaveAttribute('aria-pressed', 'true');
  await expect(light).toHaveAttribute('aria-pressed', 'false');
  await expect(add).toHaveAttribute('data-sku', HEAVY.sku);
  await expect(card.locator('[data-card-unit]')).toHaveText(
    (await heavy.getAttribute('data-unit'))!,
  );
  await expect(card.locator('.card-title a')).toHaveAttribute(
    'href',
    (await heavy.getAttribute('href'))!,
  );
  await expect(status).toHaveText(`${(await heavy.textContent())!.split(',')[0]}, ${heavyPrice}`);
  // The sort keys stay on the lead format and the button keeps its size.
  expect(await card.getAttribute('data-price')).toBe(sortPrice);
  expect((await add.boundingBox())!.width).toBeCloseTo(width, 1);

  await add.click();
  await expect.poll(() => storedLines(page)).toEqual([{ sku: HEAVY.sku, quantity: 1 }]);
});

test('keyboard: Space on a focused chip selects it, Enter selects the other back', async ({
  page,
}) => {
  const { card, light, heavy } = await baobabCard(page, 'fr');
  const price = card.locator('.card-price');
  await heavy.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(PATHS.fr.shop);
  await expect(heavy).toHaveAttribute('aria-pressed', 'true');
  await expect(price).toHaveText(await formatInPage(page, cents(HEAVY), 'fr'));

  await light.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(PATHS.fr.shop);
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await expect(price).toHaveText(await formatInPage(page, cents(LIGHT), 'fr'));
  await expect(card.locator('button[data-add-to-cart]')).toHaveAttribute('data-sku', LIGHT.sku);
});

test('a ctrl-click is left to the browser: the card does not change', async ({ page }) => {
  const { card, heavy } = await baobabCard(page, 'fr');
  await heavy.click({ modifiers: ['Control'] });
  await expect(page).toHaveURL(PATHS.fr.shop);
  await expect(heavy).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('button[data-add-to-cart]')).toHaveAttribute('data-sku', LIGHT.sku);
});

test('a chosen format survives a sort, which moves the cards', async ({ page }) => {
  const { card, heavy } = await baobabCard(page, 'fr');
  const sort = page.locator('select[data-sort]');
  await sort.selectOption({ index: 1 });
  await heavy.click();
  await expect(page).toHaveURL(/\/boutique\/(#.*)?$/);
  await expect(card.locator('.card-price')).toHaveText(
    await formatInPage(page, cents(HEAVY), 'fr'),
  );
});

test('English shop: 200 g shows the price in English format', async ({ page }) => {
  const { card, heavy } = await baobabCard(page, 'en');
  await heavy.click();
  await expect(page).toHaveURL(PATHS.en.shop);
  await expect(card.locator('.card-price')).toHaveText(
    await formatInPage(page, cents(HEAVY), 'en'),
  );
  await expect(card.locator('.card-from')).toBeHidden();
  await expect(card.locator('button[data-add-to-cart]')).toHaveAttribute('data-sku', HEAVY.sku);
});
