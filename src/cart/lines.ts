// Cart line items shared by the drawer, the cart page and the checkout
// summary. Keyed updates: an existing <li> is patched in place so the focus
// stays on the stepper button the customer is pressing.
import type { CartContext } from './context';
import { nowrapWeight } from '../i18n/format';
import { h, icon } from './dom';
import type { CartLine } from './store';

export type LineVariant = 'drawer' | 'page' | 'summary';

export interface LineOptions {
  variant: LineVariant;
  /** SKUs the API refused (out of stock): highlighted with a remove action. */
  flagged?: ReadonlySet<string>;
}

function buildLine(line: CartLine, ctx: CartContext, variant: LineVariant): HTMLLIElement {
  const product = ctx.catalog.products[line.sku];
  const name = product?.name ?? line.sku;
  const shown = nowrapWeight(name);
  const img = product
    ? h('img', {
        src: product.image,
        alt: '',
        width: 64,
        height: 80,
        loading: variant === 'page' ? 'eager' : 'lazy',
        decoding: 'async',
      })
    : null;
  const media = product
    ? h(
        'a',
        { class: 'cart-line-media', href: product.url, tabindex: -1, 'aria-hidden': 'true' },
        img,
      )
    : h('span', { class: 'cart-line-media', 'aria-hidden': 'true' });
  if (variant === 'summary')
    media.append(h('span', { class: 'cart-line-badge', 'data-line-badge': true }));

  const title = product
    ? h('a', { class: 'cart-line-name', href: product.url }, shown)
    : h('span', { class: 'cart-line-name' }, shown);

  const stepper =
    variant === 'summary'
      ? null
      : h(
          'div',
          { class: 'qty qty--sm' },
          h(
            'button',
            {
              type: 'button',
              class: 'qty-btn',
              'data-line-step': '-1',
              'aria-label': ctx.fmt(ctx.t.cart.decreaseOf, { name }),
            },
            icon('minus', 16),
          ),
          h('input', {
            class: 'qty-input',
            type: 'number',
            inputmode: 'numeric',
            min: 1,
            max: ctx.store.maxQuantity,
            step: 1,
            value: line.quantity,
            'data-line-qty': true,
            'aria-label': ctx.fmt(ctx.t.cart.quantityOf, { name }),
          }),
          h(
            'button',
            {
              type: 'button',
              class: 'qty-btn',
              'data-line-step': '1',
              'aria-label': ctx.fmt(ctx.t.cart.increaseOf, { name }),
            },
            icon('plus', 16),
          ),
        );

  const remove = h(
    'button',
    {
      type: 'button',
      class: 'cart-line-remove',
      'data-line-remove': true,
      'aria-label': ctx.fmt(ctx.t.cart.removeOf, { name }),
    },
    ctx.t.cart.remove,
  );

  return h(
    'li',
    { class: `cart-line cart-line--${variant}`, 'data-sku': line.sku },
    media,
    h(
      'div',
      { class: 'cart-line-body' },
      title,
      h('p', { class: 'cart-line-meta', 'data-line-meta': true }),
      h('p', { class: 'cart-line-status', 'data-line-status': true, hidden: true }),
      h('div', { class: 'cart-line-actions', 'data-line-actions': true }, stepper, remove),
    ),
    h('p', { class: 'cart-line-total price', 'data-line-total': true }),
  );
}

function updateLine(li: HTMLLIElement, line: CartLine, ctx: CartContext, opts: LineOptions): void {
  const product = ctx.catalog.products[line.sku];
  const max = ctx.store.maxQuantity;
  const flagged = opts.flagged?.has(line.sku) ?? false;
  const out = product?.stock === 'out';
  const unavailable = !product || out;

  li.classList.toggle('is-flagged', flagged || unavailable);

  const meta = li.querySelector<HTMLElement>('[data-line-meta]')!;
  const metaText = !product
    ? ''
    : opts.variant === 'summary'
      ? `${line.quantity} × ${ctx.price(product.unitAmount)}`
      : ctx.fmt(ctx.t.cart.unitPrice, { price: ctx.price(product.unitAmount) });
  if (meta.textContent !== metaText) meta.textContent = metaText;

  const status = li.querySelector<HTMLElement>('[data-line-status]')!;
  const statusText = !product
    ? ctx.t.cart.unavailable
    : out || flagged
      ? ctx.t.product.stockOut
      : product.stock === 'low'
        ? ctx.t.product.stockLow
        : '';
  status.textContent = statusText;
  status.hidden = statusText === '';
  status.className = `cart-line-status badge ${unavailable || flagged ? 'badge-stock-out' : 'badge-stock-low'}`;

  const badge = li.querySelector<HTMLElement>('[data-line-badge]');
  if (badge) badge.textContent = String(line.quantity);

  const input = li.querySelector<HTMLInputElement>('[data-line-qty]');
  if (input && document.activeElement !== input) input.value = String(line.quantity);
  for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-line-step]')) {
    const step = Number(btn.dataset.lineStep);
    const blocked = step < 0 ? line.quantity <= 1 : line.quantity >= max;
    // aria-disabled rather than disabled: a disabled button would drop the focus.
    btn.setAttribute('aria-disabled', String(blocked));
  }

  const actions = li.querySelector<HTMLElement>('[data-line-actions]')!;
  actions.hidden = opts.variant === 'summary' && !(flagged || unavailable);

  const total = li.querySelector<HTMLElement>('[data-line-total]')!;
  const totalText = product ? ctx.price(product.unitAmount * line.quantity) : '';
  if (total.textContent !== totalText) total.textContent = totalText;
}

/** Renders the cart lines into `list`, reusing the <li> of each SKU. */
export function renderLines(
  list: HTMLElement,
  lines: readonly CartLine[],
  ctx: CartContext,
  opts: LineOptions,
): void {
  const existing = new Map<string, HTMLLIElement>();
  for (const li of list.querySelectorAll<HTMLLIElement>(':scope > li[data-sku]'))
    existing.set(li.dataset.sku!, li);
  const wanted = new Set(lines.map((l) => l.sku));
  for (const [sku, li] of existing) if (!wanted.has(sku)) li.remove();
  lines.forEach((line, index) => {
    let li = existing.get(line.sku);
    if (!li) li = buildLine(line, ctx, opts.variant);
    updateLine(li, line, ctx, opts);
    // Move only when out of place: moving a focused node would blur it.
    if (list.children[index] !== li) list.insertBefore(li, list.children[index] ?? null);
  });
}

/**
 * One delegated listener per list for steppers, typed quantities and remove.
 * `fallbackFocus` receives the focus when the last line goes.
 */
export function bindLineEvents(
  list: HTMLElement,
  ctx: CartContext,
  fallbackFocus: () => HTMLElement | null,
): void {
  const skuOf = (el: Element) => el.closest<HTMLElement>('li[data-sku]')?.dataset.sku ?? null;
  const quantityOf = (sku: string) =>
    ctx.store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
  const nameOf = (sku: string) => ctx.catalog.products[sku]?.name ?? sku;

  list.addEventListener('click', (event) => {
    const target = event.target as Element;
    const step = target.closest<HTMLButtonElement>('[data-line-step]');
    if (step) {
      const sku = skuOf(step);
      if (!sku || step.getAttribute('aria-disabled') === 'true') return;
      const next = quantityOf(sku) + Number(step.dataset.lineStep);
      ctx.store.setQuantity(sku, Math.max(1, next));
      ctx.announce(ctx.t.cart.updated);
      return;
    }
    const remove = target.closest<HTMLButtonElement>('[data-line-remove]');
    if (remove) {
      const sku = skuOf(remove);
      if (!sku) return;
      const li = remove.closest('li')!;
      const neighbour = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
      const name = nameOf(sku);
      ctx.store.removeLine(sku);
      const focus =
        (neighbour?.isConnected &&
          neighbour.querySelector<HTMLElement>('.cart-line-name[href], [data-line-remove]')) ||
        fallbackFocus();
      focus?.focus();
      ctx.announce(ctx.fmt(ctx.t.cart.removed, { name }));
    }
  });

  const commitInput = (input: HTMLInputElement) => {
    const sku = skuOf(input);
    if (!sku) return;
    const value = Number.parseInt(input.value, 10);
    if (!Number.isFinite(value)) {
      input.value = String(quantityOf(sku));
      return;
    }
    if (value <= 0) {
      input.closest('li')?.querySelector<HTMLButtonElement>('[data-line-remove]')?.click();
      return;
    }
    ctx.store.setQuantity(sku, value);
    input.value = String(quantityOf(sku));
    ctx.announce(ctx.t.cart.updated);
  };
  list.addEventListener('change', (event) => {
    const input = (event.target as Element).closest<HTMLInputElement>('[data-line-qty]');
    if (input) commitInput(input);
  });
  list.addEventListener('keydown', (event) => {
    const input = (event.target as Element).closest<HTMLInputElement>('[data-line-qty]');
    if (input && event.key === 'Enter') {
      event.preventDefault();
      commitInput(input);
    }
  });
}
