// Header search (SearchDialog.astro, spec 2.7). Opens the dialog from every
// [data-search-open] button, filters the client catalogue embedded once per
// page in #rep-catalog (never a second copy), and renders the matches from
// the dialog's <template>. The add buttons follow the cart contract, so the
// cart script handles them. Escape and a backdrop click close the dialog
// (native cancel plus a click on the dialog box itself); focus returns to the
// button that opened it. Enter with a single result opens that product.
import type { ClientCatalog, ClientProduct } from '../catalog/build';
import type { Locale } from '../consts';
import { formatPrice, formatUnitPrice } from '../i18n/format';
import { buildIndex, search, type SearchIndex } from '../search/match';

const LIMIT = 8;
const SUGGESTIONS = 4;

function readCatalog(): ClientCatalog | null {
  const el = document.getElementById('rep-catalog');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as ClientCatalog;
  } catch {
    return null;
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
  const locale = (dialog.dataset.locale ?? 'fr') as Locale;
  const strings = dialog.dataset;

  let catalog: ClientCatalog | null = null;
  let index: SearchIndex = [];
  let shown: ClientProduct[] = [];
  let opener: HTMLElement | null = null;
  let statusTimer = 0;

  const ensureIndex = () => {
    if (catalog) return;
    catalog = readCatalog();
    index = catalog ? buildIndex(catalog) : [];
  };

  const renderRow = (p: ClientProduct): HTMLLIElement => {
    const li = (row.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
    const img = li.querySelector('img')!;
    img.src = p.image;
    const link = li.querySelector<HTMLAnchorElement>('.sr-name')!;
    link.href = p.url;
    link.textContent = p.name;
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
    if (query === '') {
      shown = products.filter((p) => p.featured).slice(0, SUGGESTIONS);
      hint.hidden = false;
      label.hidden = shown.length === 0;
      window.clearTimeout(statusTimer);
      status.textContent = '';
    } else {
      shown = search(index, query, LIMIT);
      hint.hidden = true;
      label.hidden = true;
      const one = locale === 'fr' ? shown.length <= 1 : shown.length === 1;
      announce(
        shown.length === 0
          ? (strings.empty ?? '').replace('%q', query)
          : ((one ? strings.resultsOne : strings.resultsMany) ?? '').replace(
              '%n',
              String(shown.length),
            ),
      );
    }
    list.replaceChildren(...shown.map(renderRow));
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

  for (const btn of openers) btn.addEventListener('click', () => open(btn));

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
  input.addEventListener('input', render);
  // Escape in a filled search field only clears it in Chromium: close instead.
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dialog.close();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim() !== '' && shown.length === 1) window.location.assign(shown[0]!.url);
  });
  // Leaving the page by a result link: closed again when restored from the bfcache.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && dialog.open) dialog.close();
  });
}

initSearch();
