// Undo after removing a cart line (review 17): "Retirer" or a typed 0 fold
// the line to "Poudre de baobab 100 g retiré. Annuler" for about six
// seconds or until the next cart change; "Annuler" puts it back with its
// quantity at the same place. The totals follow at once, the live region
// says it, and the focus goes to "Annuler" after a keyboard removal and back
// to the line's stepper after undo. Same in the drawer and on the cart page.
import { expect, test, type Page } from '@playwright/test';
import { PATHS, blockThirdParties, formatInPage, readCatalog } from './helpers';

const BAOBAB = 'REP-BAO-100';
const MORINGA = 'REP-MOR-100';
const SEED = [
  { sku: BAOBAB, quantity: 2 },
  { sku: MORINGA, quantity: 3 },
];

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

async function seedCart(page: Page, lines: Array<{ sku: string; quantity: number }>, path: string) {
  await page.goto('/');
  await page.evaluate(
    (l) =>
      localStorage.setItem(
        'rep.cart.v1',
        JSON.stringify({ version: 1, lines: l, updatedAt: new Date().toISOString() }),
      ),
    lines,
  );
  await page.goto(path);
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

/** Subtotal of `lines` as the page prints it. */
async function subtotalOf(page: Page, lines: Array<{ sku: string; quantity: number }>) {
  const catalog = await readCatalog(page);
  const cents = lines.reduce((s, l) => s + catalog.products[l.sku]!.unitAmount * l.quantity, 0);
  return formatInPage(page, cents, 'fr');
}

test('cart page: a typed 0 and Enter fold the line, Annuler restores it in place', async ({
  page,
}) => {
  await seedCart(page, SEED, PATHS.fr.cart);
  const list = page.locator('[data-cart-page-lines]');
  const rows = list.locator(':scope > li');
  await expect(rows).toHaveCount(2);
  const subtotal = page.locator('[data-cart-page-subtotal]');
  await expect(subtotal).toHaveText(await subtotalOf(page, SEED));

  // The review's steps: 0 in the first quantity, Enter.
  const qty = list.locator(`li[data-sku="${BAOBAB}"] [data-line-qty]`);
  await qty.fill('0');
  await qty.press('Enter');

  const row = list.locator('li[data-undo-row]');
  await expect(row).toHaveText(/Poudre de baobab\s100\sg retiré\.\s*Annuler/);
  // In place: first, the moringa line still second.
  await expect(rows.nth(0)).toHaveAttribute('data-undo-row', /\d+/);
  await expect(rows.nth(1)).toHaveAttribute('data-sku', MORINGA);
  const undo = row.getByRole('button', { name: 'Annuler le retrait de Poudre de baobab 100 g' });
  await expect(undo).toBeFocused();
  // Totals and storage at once; the live region says it.
  await expect(subtotal).toHaveText(await subtotalOf(page, [SEED[1]!]));
  expect(await storedLines(page)).toEqual([SEED[1]]);
  await expect(page.locator('[data-cart-live-page]')).toHaveText(
    'Poudre de baobab 100 g retiré du panier',
  );

  await page.keyboard.press('Enter');
  await expect(row).toHaveCount(0);
  await expect(rows.nth(0)).toHaveAttribute('data-sku', BAOBAB);
  await expect(qty).toHaveValue('2');
  await expect(qty).toBeFocused();
  await expect(subtotal).toHaveText(await subtotalOf(page, SEED));
  expect(await storedLines(page)).toEqual(SEED);
  await expect(page.locator('[data-cart-live-page]')).toHaveText(
    'Poudre de baobab 100 g remis dans le panier',
  );
});

test('cart page: the row goes after a few seconds, or at the next cart change', async ({
  page,
}) => {
  await seedCart(page, SEED, PATHS.fr.cart);
  const list = page.locator('[data-cart-page-lines]');
  const row = list.locator('li[data-undo-row]');

  // Keyboard "Retirer": the focus goes to "Annuler", the row waits while it has it.
  await list.locator(`li[data-sku="${MORINGA}"] [data-line-remove]`).focus();
  await page.keyboard.press('Enter');
  const undo = row.getByRole('button', { name: /Annuler/ });
  await expect(undo).toBeFocused();
  await page.waitForTimeout(6500);
  await expect(row).toHaveCount(1);
  // Focus elsewhere: gone within the next period.
  await list.locator(`li[data-sku="${BAOBAB}"] .cart-line-name`).focus();
  await expect(row).toHaveCount(0, { timeout: 8000 });
  expect(await storedLines(page)).toEqual([SEED[0]]);

  // A change of the cart ends the offer at once.
  await seedCart(page, SEED, PATHS.fr.cart);
  await list.locator(`li[data-sku="${BAOBAB}"] [data-line-remove]`).click();
  await expect(row).toHaveCount(1);
  await list.locator(`li[data-sku="${MORINGA}"] [data-line-step="1"]`).click();
  await expect(row).toHaveCount(0);
  expect(await storedLines(page)).toEqual([{ sku: MORINGA, quantity: 4 }]);
});

test('cart page: the last line removed keeps its undo row above the empty message', async ({
  page,
}) => {
  await seedCart(page, [SEED[0]!], PATHS.fr.cart);
  const list = page.locator('[data-cart-page-lines]');
  await list.locator('[data-line-remove]').click();
  const row = list.locator('li[data-undo-row]');
  await expect(row).toBeVisible();
  await expect(page.locator('[data-cart-page-empty]')).toBeVisible();
  await expect(page.locator('.cart-layout-summary')).toBeHidden();
  await row.getByRole('button', { name: /Annuler/ }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('[data-cart-page-empty]')).toBeHidden();
  await expect(page.locator('.cart-layout-summary')).toBeVisible();
  // From a pointer, the focus goes to the line's stepper button (no keyboard pops up).
  await expect(list.locator(`li[data-sku="${BAOBAB}"] [data-line-step="-1"]`)).toBeFocused();
  expect(await storedLines(page)).toEqual([SEED[0]]);
});

test('drawer: "Retirer" folds the line in place, Annuler restores it, totals follow', async ({
  page,
}) => {
  await seedCart(page, SEED, '/produits/poudre-de-moringa-100g/');
  await page.locator('button[data-cart-toggle]').first().click();
  const drawer = page.locator('#cart-drawer');
  await expect(drawer).toBeVisible();
  const list = drawer.locator('[data-drawer-lines]');
  const rows = list.locator(':scope > li');
  const subtotal = drawer.locator('[data-drawer-subtotal]');
  await expect(subtotal).toHaveText(await subtotalOf(page, SEED));

  // Keyboard on the second line's "Retirer".
  await list.locator(`li[data-sku="${MORINGA}"] [data-line-remove]`).focus();
  await page.keyboard.press('Enter');
  const row = list.locator('li[data-undo-row]');
  await expect(row).toHaveText(/Poudre de moringa\s100\sg retiré\.\s*Annuler/);
  await expect(rows.nth(1)).toHaveAttribute('data-undo-row', /\d+/);
  await expect(row.getByRole('button', { name: /Annuler/ })).toBeFocused();
  await expect(subtotal).toHaveText(await subtotalOf(page, [SEED[0]!]));
  await expect(drawer.locator('[data-cart-live]')).toHaveText(
    'Poudre de moringa 100 g retiré du panier',
  );
  await expect(page.locator('[data-cart-count]').first()).toHaveText('2');

  await page.keyboard.press('Enter');
  await expect(row).toHaveCount(0);
  await expect(rows.nth(1)).toHaveAttribute('data-sku', MORINGA);
  await expect(list.locator(`li[data-sku="${MORINGA}"] [data-line-qty]`)).toBeFocused();
  await expect(subtotal).toHaveText(await subtotalOf(page, SEED));
  await expect(page.locator('[data-cart-count]').first()).toHaveText('5');
  expect(await storedLines(page)).toEqual(SEED);

  // A typed 0 left with Tab: the row takes the line's place and the focus.
  const qty = list.locator(`li[data-sku="${BAOBAB}"] [data-line-qty]`);
  await qty.fill('0');
  await qty.press('Tab');
  await expect(rows.nth(0)).toHaveAttribute('data-undo-row', /\d+/);
  await expect(row.getByRole('button', { name: /Annuler/ })).toBeFocused();
  // Escape still closes the drawer.
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  expect(await storedLines(page)).toEqual([SEED[1]]);
});

test('English: "Undo" restores the line', async ({ page }) => {
  await seedCart(page, SEED, PATHS.en.cart);
  const list = page.locator('[data-cart-page-lines]');
  await list.locator(`li[data-sku="${BAOBAB}"] [data-line-remove]`).click();
  const row = list.locator('li[data-undo-row]');
  await expect(row).toContainText('removed.');
  await row.getByRole('button', { name: /^Undo removing / }).click();
  await expect(row).toHaveCount(0);
  expect(await storedLines(page)).toEqual(SEED);
});
