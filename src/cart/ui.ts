// Cart client entry, bundled by Astro from CartScripts.astro (external module
// script: the CSP has no 'unsafe-inline'). Runs on every page: header badge,
// add-to-cart delegation, quantity steppers, drawer. The cart, checkout,
// thanks, order lookup and review pages, and the forms, load their own
// module on demand.
import { getContext } from './context';
import { createDrawer, type Drawer } from './drawer';
import { itemCount, type CartState } from './store';
import { addOutcome } from './add-outcome';
import { carryQueryToLanguageLinks, takeUrlToken } from './url-token';

/** The forms src/forms/forms.ts enhances (the lookup and review pages load their own). */
const ENHANCED_FORMS = ['contact', 'newsletter', 'stock_alert', 'account_login']
  .map((kind) => `form[data-form="${kind}"]`)
  .join(', ');

/**
 * The forms module loads on the first focus inside one of those forms (or a
 * submit before any focus, such as an autofilled field and Enter), never on
 * page load. A submit that arrives first is replayed once the module is in.
 */
function lazyForms(): void {
  let loading: Promise<void> | null = null;
  const load = () => (loading ??= import('../forms/forms').then((m) => m.initForms()));
  document.addEventListener('focusin', (event) => {
    if ((event.target as Element | null)?.closest?.(ENHANCED_FORMS)) void load();
  });
  document.addEventListener('submit', (event) => {
    const form = (event.target as Element | null)?.closest?.<HTMLFormElement>(ENHANCED_FORMS);
    if (!form || form.dataset.enhanced) return;
    event.preventDefault();
    void load().then(() => {
      if (form.dataset.enhanced) form.requestSubmit();
    });
  });
}

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

/**
 * The quantity input that goes with an add button: the product page stepper,
 * except for buttons in the search dialog or a cross-sell list, which always
 * add one.
 */
function qtyInputFor(sku: string, add: Element): HTMLInputElement | null {
  if (add.closest('dialog[data-search], [data-cross-sell]')) return null;
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
  // Bearer tokens leave the address bar before any other script reads it.
  const bearerPage = document.querySelector(
    '[data-review-page], [data-newsletter-landing], [data-account]',
  );
  const status = new URLSearchParams(window.location.search).get('status');
  // The customer space keeps its sign-in token out of the language links.
  const token = bearerPage
    ? takeUrlToken('t', { keepInLanguageLinks: !bearerPage.matches('[data-account]') })
    : null;
  // The thanks page in the other language needs the same ?session_id.
  if (document.querySelector('[data-thanks]')) carryQueryToLanguageLinks(window.location.search);

  if (document.querySelector(ENHANCED_FORMS)) lazyForms();
  const landing = document.querySelector<HTMLElement>('[data-newsletter-landing]');
  if (landing) void import('../forms/landing').then((m) => m.initLanding(landing, token, status));

  const ctx = getContext();
  if (!ctx) return;
  const { store } = ctx;
  const drawer: Drawer | null = createDrawer(ctx);
  ctx.openDrawer = (opener) => drawer?.open(opener);

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
      const input = qtyInputFor(sku, add);
      const quantity = input ? clampInput(input, store.maxQuantity) : 1;
      const before = store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
      const suggestion = add.closest('[data-cross-sell]');
      store.addLine(sku, quantity);
      const after = store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
      add.classList.add('is-added');
      window.setTimeout(() => add.classList.remove('is-added'), 1200);
      bump();
      // A request the per-line maximum cut short says so (7 in the cart, 5 more: 10).
      const outcome = addOutcome(before, after, quantity);
      const message =
        outcome === 'added'
          ? ctx.fmt(ctx.t.cart.added, { name: product.name })
          : outcome === 'capped'
            ? ctx.fmt(ctx.t.cart.addedCapped || ctx.t.cart.maxReached, {
                name: product.name,
                max: store.maxQuantity,
              })
            : ctx.fmt(ctx.t.cart.maxReached, { max: store.maxQuantity });
      if (suggestion) {
        // A cross-sell suggestion leaves its list once in the cart (the render
        // above ran synchronously): the focus moves to the new cart line, in
        // the drawer or on the cart page, and no drawer opens over the page.
        const scope = suggestion.closest('#cart-drawer, [data-cart-page]') ?? document;
        scope
          .querySelector<HTMLElement>(`li[data-sku="${CSS.escape(sku)}"] .cart-line-name`)
          ?.focus();
      } else {
        drawer?.open(add);
      }
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
  if (document.querySelector('[data-lookup]'))
    void import('./page-lookup').then((m) => m.initLookup(ctx));
  if (document.querySelector('[data-review-page]'))
    void import('./page-review').then((m) => m.initReview(ctx, token));
  if (document.querySelector('[data-account]'))
    void import('./page-account').then((m) => m.initAccount(ctx, token));
}

init();
