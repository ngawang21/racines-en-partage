// Client context shared by the cart modules of one page: the embedded
// catalogue and strings, the store, formatting and the live region.
import type { ClientCatalog } from '../catalog/build';
import type { Locale } from '../consts';
import { interpolate } from '../i18n/fallback';
import { formatPrice } from '../i18n/format';
import { routePath, type RouteKey } from '../i18n/routing';
import { readJson } from './dom';
import { STORAGE_KEY, createCartStore, type CartStore } from './store';
import type { ClientStrings, PageStrings } from './strings';

export interface CartContext {
  locale: Locale;
  catalog: ClientCatalog;
  t: ClientStrings;
  store: CartStore;
  shopOpen: boolean;
  price(cents: number): string;
  fmt(text: string, vars: Record<string, string | number>): string;
  path(key: RouteKey): string;
  /** Polite announcement in the drawer's live region when it is open, else the page's. */
  announce(message: string): void;
  /** "1 article", "3 articles". */
  itemsLabel(count: number): string;
  /** Opens the cart drawer (set by ui.ts once the drawer exists; a no-op before). */
  openDrawer(opener?: HTMLElement | null): void;
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let context: CartContext | null = null;

export function getContext(): CartContext | null {
  if (context) return context;
  const catalog = readJson<ClientCatalog>('rep-catalog');
  const base = readJson<ClientStrings>('rep-strings');
  if (!catalog || !base) return null;
  const page = readJson<PageStrings>('rep-page-strings');
  const t: ClientStrings = page ? { ...base, ...page } : base;
  const locale = catalog.locale;
  const store = createCartStore({
    storage: localStorageOrNull(),
    maxQuantity: catalog.maxQuantityPerLine,
  });
  window.addEventListener('storage', (e) => {
    if (e.storageArea === null || e.key === null || e.key === STORAGE_KEY)
      store.syncFromStorage(e.key);
  });

  let timer: number | undefined;
  const announce = (message: string) => {
    const drawer = document.getElementById('cart-drawer') as HTMLDialogElement | null;
    const region =
      (drawer?.open && drawer.querySelector<HTMLElement>('[data-cart-live]')) ||
      document.querySelector<HTMLElement>('[data-cart-live-page]');
    if (!region) return;
    region.textContent = '';
    window.clearTimeout(timer);
    // A fresh text node after a short delay makes screen readers repeat
    // identical messages (two adds of the same product).
    timer = window.setTimeout(() => {
      region.textContent = message;
    }, 60);
  };

  context = {
    locale,
    catalog,
    t,
    store,
    shopOpen: catalog.shopOpen && document.body.dataset.shopOpen !== 'false',
    price: (cents) => formatPrice(cents, locale),
    fmt: interpolate,
    path: (key) => routePath(key, locale),
    announce,
    openDrawer: () => {},
    itemsLabel: (count) =>
      // French uses the singular for 0 and 1, English for 1 only.
      interpolate(
        (locale === 'fr' ? count <= 1 : count === 1) ? t.cart.itemsOne : t.cart.itemsMany,
        {
          count,
        },
      ),
  };
  return context;
}
