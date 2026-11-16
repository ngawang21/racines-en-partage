// Header search (SearchDialog.astro, spec 2.7). Opens the dialog from every
// [data-search-open] button, filters the client catalogue embedded once per
// page in #rep-catalog (never a second copy), and renders the matches from
// the dialog's <template>. The add buttons follow the cart contract, so the
// cart script handles them. Escape and a backdrop click close the dialog
// (native cancel plus a click on the dialog box itself); focus returns to the
// button that opened it. Enter in the field opens the first result;
// ArrowDown and ArrowUp move focus from the field through the result links
// (product names, then recipes) and back up to the field, and Enter opens the
// focused link natively (roving focus over links that stay in the tab order).
// The catalogue is the
// one the cart context already parsed (getContext memoises it per page). The
// formats of one product share a row (searchGroups, the dialog's
// data-families): the name without its weight, a chip per format, "dès" before
// the lightest format's price, and the add button of the format shown.
// Recipes matching the query follow the products (at most RECIPE_LIMIT), as
// plain links, from the small #rep-recipes list SearchDialog embeds.
import type { ClientCatalog } from '../catalog/build';
import { getContext } from '../cart/context';
import type { Locale } from '../consts';
import { formatPrice, formatUnitPrice, formatWeight } from '../i18n/format';
import {
  RECIPE_LIMIT,
  bareName,
  buildIndex,
  buildRecipeIndex,
  groupRows,
  searchGroups,
  searchRecipes,
  type ClientRecipe,
  type RecipeIndexEntry,
  type SearchGroup,
  type SearchIndex,
} from '../search/match';

const LIMIT = 8;
const SUGGESTIONS = 4;

/** The cart context's catalogue; parsed here only when the context cannot be built. */
function readCatalog(): ClientCatalog | null {
  const shared = getContext()?.catalog;
  if (shared) return shared;
  const el = document.getElementById('rep-catalog');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as ClientCatalog;
  } catch {
    return null;
  }
}

/** The recipes embedded by SearchDialog; none when the list is missing or unreadable. */
function readRecipes(): ClientRecipe[] {
  const el = document.getElementById('rep-recipes');
  if (!el?.textContent) return [];
  try {
    const list = JSON.parse(el.textContent) as unknown;
    return Array.isArray(list) ? (list as ClientRecipe[]) : [];
  } catch {
    return [];
  }
}

function initSearch(): void {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[data-search]');
  const openers = [...document.querySelectorAll<HTMLButtonElement>('[data-search-open]')];
  if (!dialog || typeof dialog.showModal !== 'function' || openers.length === 0) return;
  const q = <T extends Element>(sel: string) => dialog.querySelector<T>(sel)!;
  const form = q<HTMLFormElement>('[data-search-form]');
  const input = q<HTMLInputElement>('[data-search-input]');
  const list = q<HTMLUListElement>('[data-search-results]');
  const status = q<HTMLElement>('[data-search-status]');
  const label = q<HTMLElement>('[data-search-label]');
  const hint = q<HTMLElement>('#search-hint');
  const row = q<HTMLTemplateElement>('template[data-search-row]');
  const recipeBlock = q<HTMLElement>('[data-search-recipes]');
  const recipeList = q<HTMLUListElement>('[data-search-recipe-list]');
  const recipeRow = q<HTMLTemplateElement>('template[data-search-recipe-row]');
  const locale = (dialog.dataset.locale ?? 'fr') as Locale;
  const strings = dialog.dataset;
  const families = new Map<string, string>(
    (() => {
      try {
        return Object.entries(JSON.parse(strings.families ?? '{}') as Record<string, string>);
      } catch {
        return [];
      }
    })(),
  );

  let catalog: ClientCatalog | null = null;
  let index: SearchIndex = [];
  let shown: SearchGroup[] = [];
  let recipeIndex: RecipeIndexEntry[] | null = null;
  let shownRecipes: ClientRecipe[] = [];
  const recipeUrl = (slug: string) => (strings.recipePath ?? '').replace('%s', () => slug);
  let opener: HTMLElement | null = null;
  let statusTimer = 0;

  const ensureIndex = () => {
    recipeIndex ??= buildRecipeIndex(readRecipes());
    if (catalog) return;
    catalog = readCatalog();
    index = catalog ? buildIndex(catalog) : [];
  };

  const renderRecipe = (recipe: ClientRecipe): HTMLLIElement => {
    const li = (recipeRow.content.firstElementChild as HTMLLIElement).cloneNode(
      true,
    ) as HTMLLIElement;
    li.querySelector<HTMLAnchorElement>('.sr-recipe')!.href = recipeUrl(recipe.slug);
    li.querySelector('.sr-recipe-title')!.textContent = recipe.title;
    li.querySelector('.sr-recipe-product')!.textContent = recipe.product;
    return li;
  };

  const renderRow = ({ shown: p, formats }: SearchGroup): HTMLLIElement => {
    const li = (row.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
    const several = formats.length > 1;
    const img = li.querySelector('img')!;
    img.src = p.image;
    const link = li.querySelector<HTMLAnchorElement>('.sr-name')!;
    link.href = p.url;
    link.textContent = several ? bareName(p.name) : p.name;
    if (several) {
      const chips = li.querySelector<HTMLElement>('.sr-formats')!;
      for (const f of formats) {
        const chip = document.createElement('a');
        chip.className = 'sr-format';
        chip.href = f.url;
        chip.textContent = formatWeight(f.weightGrams, locale);
        if (f.slug === p.slug) chip.dataset.shown = '';
        const name = document.createElement('span');
        name.className = 'visually-hidden';
        name.textContent = `, ${bareName(f.name)}`;
        chip.append(name);
        chips.append(chip);
      }
      chips.hidden = false;
      // "dès" when the row shows the lightest format, as on the product cards.
      li.querySelector<HTMLElement>('.sr-from')!.hidden = p.slug !== formats[0]!.slug;
    }
    li.querySelector('.sr-price')!.textContent = formatPrice(p.unitAmount, locale);
    li.querySelector('.sr-unit')!.textContent = formatUnitPrice(
      p.unitAmount,
      p.weightGrams,
      locale,
    );
    const add = li.querySelector<HTMLButtonElement>('.sr-add')!;
    add.setAttribute('data-add-to-cart', '');
    add.dataset.sku = p.sku;
    add.dataset.stock = p.stock;
    li.querySelector('.sr-add-name')!.textContent = `, ${p.name}`;
    if (p.stock === 'out') {
      add.disabled = true;
      add.querySelector('svg')?.remove();
      li.querySelector('.sr-add-label')!.textContent = strings.out ?? '';
    } else if (catalog && !catalog.shopOpen) {
      add.disabled = true;
      add.dataset.shopClosed = '';
    }
    return li;
  };

  const announce = (text: string) => {
    window.clearTimeout(statusTimer);
    // A short pause so a screen reader hears the count once typing settles.
    statusTimer = window.setTimeout(() => {
      status.textContent = text;
    }, 350);
  };

  const render = () => {
    ensureIndex();
    const query = input.value.trim();
    const products = catalog ? Object.values(catalog.products) : [];
    // Every recipe match is counted; the list shows the first RECIPE_LIMIT.
    const recipeMatches =
      query === '' ? [] : searchRecipes(recipeIndex ?? [], query, Number.POSITIVE_INFINITY);
    shownRecipes = recipeMatches.slice(0, RECIPE_LIMIT);
    if (query === '') {
      shown = groupRows(
        products.filter((p) => p.featured),
        products,
        families,
      ).slice(0, SUGGESTIONS);
      hint.hidden = false;
      label.hidden = shown.length === 0;
      window.clearTimeout(statusTimer);
      status.textContent = '';
    } else {
      // Every row is counted; the list shows the first LIMIT.
      const matches = searchGroups(index, query, families);
      shown = matches.slice(0, LIMIT);
      hint.hidden = true;
      label.hidden = true;
      const count = (n: number, one = '', many = '') => {
        const singular = locale === 'fr' ? n <= 1 : n === 1;
        return (singular ? one : many).replace('%n', () => String(n));
      };
      const total = matches.length;
      const recipes = recipeMatches.length;
      const parts = [
        ...(total > 0 ? [count(total, strings.resultsOne, strings.resultsMany)] : []),
        ...(recipes > 0 ? [count(recipes, strings.recipesOne, strings.recipesMany)] : []),
      ];
      announce(
        parts.length === 0 ? (strings.empty ?? '').replace('%q', () => query) : parts.join(', '),
      );
    }
    list.replaceChildren(...shown.map(renderRow));
    recipeList.replaceChildren(...shownRecipes.map(renderRecipe));
    recipeBlock.hidden = shownRecipes.length === 0;
  };

  const open = (from: HTMLElement) => {
    if (dialog.open) return;
    opener = from;
    // The mobile menu and the search never show together.
    const menu = document.querySelector<HTMLDetailsElement>('details.mobile-menu');
    if (menu?.open) menu.open = false;
    render();
    dialog.showModal();
    input.focus();
    input.select();
  };

  for (const btn of openers) {
    btn.addEventListener('click', () => open(btn));
    // Secondary openers (the 404 page) stay hidden until the dialog works.
    btn.hidden = false;
  }

  dialog.addEventListener('close', () => {
    window.clearTimeout(statusTimer);
    if (opener?.isConnected) opener.focus();
    opener = null;
  });
  // Clicks on the ::backdrop land on the dialog element itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  q<HTMLButtonElement>('[data-search-close]').addEventListener('click', () => dialog.close());
  // Arrow keys: the field, then each result link in order.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const links = [
      ...dialog.querySelectorAll<HTMLAnchorElement>(
        '[data-search-results] .sr-name, [data-search-recipe-list] .sr-recipe',
      ),
    ];
    const active = document.activeElement;
    const at = links.indexOf(active as HTMLAnchorElement);
    const down = event.key === 'ArrowDown';
    if (active === input) {
      if (!down || links.length === 0) return;
      event.preventDefault();
      links[0]!.focus();
      return;
    }
    if (at < 0) return;
    event.preventDefault();
    const next = at + (down ? 1 : -1);
    if (next < 0) input.focus();
    else links[Math.min(next, links.length - 1)]!.focus();
  });
  input.addEventListener('input', render);
  // Escape in a filled search field only clears it in Chromium: close instead.
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dialog.close();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim() === '') return;
    const first = shown[0]?.shown.url ?? (shownRecipes[0] && recipeUrl(shownRecipes[0].slug));
    if (first) window.location.assign(first);
  });
  // Leaving the page by a result link: closed again when restored from the bfcache.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && dialog.open) dialog.close();
  });
}

initSearch();
