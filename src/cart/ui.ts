// Cart client entry, bundled by Astro from CartScripts.astro (external module
// script: the CSP has no 'unsafe-inline'). Runs on every page: header badge,
// add-to-cart delegation, quantity steppers, drawer. The cart, checkout and
// thanks pages load their own module on demand.
import { getContext } from './context';
import { createDrawer, type Drawer } from './drawer';
import { itemCount, type CartState } from './store';

function renderBadges(cart: CartState): void {
  const count = itemCount(cart);
  for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-count]')) {
    badge.textContent = String(count);
    badge.toggleAttribute('data-empty', count === 0);
  }
  for (const toggle of document.querySelectorAll<HTMLElement>('[data-cart-toggle]'))
    toggle.dataset.count = String(count);
}

function bump(): void {
  for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-count]')) {
    badge.classList.remove('is-bumped');
    // Restart the animation on repeated adds.
    void badge.offsetWidth;
    badge.classList.add('is-bumped');
    badge.addEventListener('animationend', () => badge.classList.remove('is-bumped'), {
      once: true,
    });
  }
}

function qtyInputFor(sku: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[data-qty-for="${CSS.escape(sku)}"]`);
}

function clampInput(input: HTMLInputElement, max: number): number {
  const value = Number.parseInt(input.value, 10);
  const next = Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1;
  input.value = String(next);
  syncStepButtons(input, max);
  return next;
}

/** The stepper around a quantity input: `[data-qty]`, `[data-qty-stepper]` or the parent. */
const scopeOf = (el: Element) => el.closest('[data-qty], [data-qty-stepper]') ?? el.parentElement;

function stepButtonsOf(input: HTMLInputElement): HTMLButtonElement[] {
  const scope = scopeOf(input);
  return scope ? [...scope.querySelectorAll<HTMLButtonElement>('[data-qty-step]')] : [];
}

function inputOfStep(step: HTMLElement): HTMLInputElement | null {
  const controlled = step.getAttribute('aria-controls');
  const byId = controlled ? document.getElementById(controlled) : null;
  if (byId instanceof HTMLInputElement && byId.matches('[data-qty-for]')) return byId;
  return scopeOf(step)?.querySelector<HTMLInputElement>('input[data-qty-for]') ?? null;
}

function syncStepButtons(input: HTMLInputElement, max: number): void {
  const value = Number(input.value);
  for (const btn of stepButtonsOf(input)) {
    const step = Number(btn.dataset.qtyStep);
    btn.setAttribute('aria-disabled', String(step < 0 ? value <= 1 : value >= max));
  }
}

function init(): void {
  const ctx = getContext();
  if (!ctx) return;
  const { store } = ctx;
  const drawer: Drawer | null = createDrawer(ctx);

  // A paused shop keeps products visible but no button may add them.
  if (!ctx.shopOpen)
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-add-to-cart]'))
      btn.disabled = true;

  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-qty-for]')) {
    input.max = String(store.maxQuantity);
    syncStepButtons(input, store.maxQuantity);
  }

  const render = (cart: CartState) => {
    renderBadges(cart);
    drawer?.render(cart);
  };
  render(store.getCart());
  store.subscribe(render);

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    const add = target.closest<HTMLButtonElement>('button[data-add-to-cart]');
    if (add) {
      // Never act for a disabled button (out of stock, paused shop).
      if (add.disabled || add.dataset.stock === 'out' || !ctx.shopOpen) return;
      const sku = add.dataset.sku;
      const product = sku ? ctx.catalog.products[sku] : undefined;
      if (!sku || !product || product.stock === 'out') return;
      const input = qtyInputFor(sku);
      const quantity = input ? clampInput(input, store.maxQuantity) : 1;
      const before = store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
      store.addLine(sku, quantity);
      const after = store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
      add.classList.add('is-added');
      window.setTimeout(() => add.classList.remove('is-added'), 1200);
      bump();
      drawer?.open(add);
      const message =
        after > before
          ? ctx.fmt(ctx.t.cart.added, { name: product.name })
          : ctx.fmt(ctx.t.cart.maxReached, { max: store.maxQuantity });
      ctx.announce(message);
      return;
    }

    const step = target.closest<HTMLButtonElement>('button[data-qty-step]');
    if (step) {
      const input = inputOfStep(step);
      if (!input || input.disabled || step.getAttribute('aria-disabled') === 'true') return;
      const value = Number.parseInt(input.value, 10) || 1;
      input.value = String(value + Number(step.dataset.qtyStep));
      clampInput(input, store.maxQuantity);
      return;
    }

    const toggle = target.closest<HTMLElement>('[data-cart-toggle]');
    if (toggle && drawer) {
      event.preventDefault();
      drawer.open(toggle);
    }
  });

  document.addEventListener('change', (event) => {
    const input = (event.target as Element | null)?.closest<HTMLInputElement>(
      'input[data-qty-for]',
    );
    if (input) clampInput(input, store.maxQuantity);
  });

  for (const toggle of document.querySelectorAll('[data-cart-toggle]')) {
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.setAttribute('aria-expanded', 'false');
  }

  // Page modules, loaded only where their container exists.
  if (document.querySelector('[data-cart-page]'))
    void import('./page-cart').then((m) => m.initCartPage(ctx));
  if (document.querySelector('[data-checkout]'))
    void import('./page-checkout').then((m) => m.initCheckout(ctx));
  if (document.querySelector('[data-thanks]'))
    void import('./page-thanks').then((m) => m.initThanks(ctx));
}

init();
