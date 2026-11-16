// Cart line items shared by the drawer, the cart page and the checkout
// summary. Keyed updates: an existing <li> is patched in place so the focus
// stays on the stepper button the customer is pressing.
import type { ClientProduct } from '../catalog/build';
import type { CartContext } from './context';
import { formatUnitPrice, nowrapWeight } from '../i18n/format';
import { h, icon } from './dom';
import type { CartLine } from './store';
import { undoRowIndex, type RemovedLine } from './undo';

/** "89,00 €/kg" (spec iteration 3, 2.4), or '' when the weight is unknown. */
export function unitPriceText(product: ClientProduct, ctx: CartContext): string {
  if (!(product.weightGrams > 0) || !Number.isInteger(product.unitAmount)) return '';
  return formatUnitPrice(product.unitAmount, product.weightGrams, ctx.locale);
}

/**
 * "10 sachets maximum par produit. Pour plus, écrivez-nous." with the contact
 * link: the visible reason a + button is greyed and an add changed nothing
 * (review 13). The maximum comes from the catalogue (`maxQuantityPerLine`).
 */
export function capNote(ctx: CartContext): Array<Node | string> {
  const t = ctx.t.cart;
  const max = ctx.store.maxQuantity;
  if (!t.maxNote) return [ctx.fmt(t.maxReached, { max })];
  return ctx
    .fmt(t.maxNote, { max })
    .split(/(\{contact\})/)
    .filter(Boolean)
    .map((part) =>
      part === '{contact}' ? h('a', { href: ctx.path('contact') }, t.maxNoteContact) : part,
    );
}

/** The same note as plain text, for the live region. */
export function capNoteText(ctx: CartContext): string {
  return capNote(ctx)
    .map((part) => (typeof part === 'string' ? part : (part.textContent ?? '')))
    .join('');
}

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
      h('p', { class: 'cart-line-kilo', 'data-line-kilo': true }),
      h('p', { class: 'cart-line-status', 'data-line-status': true, hidden: true }),
      h('div', { class: 'cart-line-actions', 'data-line-actions': true }, stepper, remove),
      variant === 'summary'
        ? null
        : h('p', { class: 'cart-line-cap', 'data-line-cap': true, hidden: true }),
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
  const kilo = li.querySelector<HTMLElement>('[data-line-kilo]')!;
  const kiloText = product ? unitPriceText(product, ctx) : '';
  if (kilo.textContent !== kiloText) kilo.textContent = kiloText;

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

  // "×2" from two units (review 14); one unit shows no tag (CSS :empty).
  const badge = li.querySelector<HTMLElement>('[data-line-badge]');
  if (badge) badge.textContent = line.quantity > 1 ? `×${line.quantity}` : '';

  const input = li.querySelector<HTMLInputElement>('[data-line-qty]');
  if (input && document.activeElement !== input) input.value = String(line.quantity);
  for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-line-step]')) {
    const step = Number(btn.dataset.lineStep);
    const blocked = step < 0 ? line.quantity <= 1 : line.quantity >= max;
    // aria-disabled rather than disabled: a disabled button would drop the focus.
    btn.setAttribute('aria-disabled', String(blocked));
  }

  // At the maximum: the note says why + is greyed (the live region says it too).
  const cap = li.querySelector<HTMLElement>('[data-line-cap]');
  if (cap) {
    const atMax = line.quantity >= max && !unavailable;
    if (atMax && !cap.hasChildNodes()) cap.replaceChildren(...capNote(ctx));
    cap.hidden = !atMax;
  }

  const actions = li.querySelector<HTMLElement>('[data-line-actions]')!;
  actions.hidden = opts.variant === 'summary' && !(flagged || unavailable);

  const total = li.querySelector<HTMLElement>('[data-line-total]')!;
  const totalText = product ? ctx.price(product.unitAmount * line.quantity) : '';
  if (total.textContent !== totalText) total.textContent = totalText;
}

/** Where the focus goes when it would be lost with a row: set by bindLineEvents. */
const fallbacks = new WeakMap<HTMLElement, () => HTMLElement | null>();

/** "Poudre de baobab 100 g retiré. Annuler" (review 17), in place of the removed line. */
function buildUndoRow(removed: RemovedLine, ctx: CartContext): HTMLLIElement {
  const t = ctx.t.cart;
  const name = ctx.catalog.products[removed.sku]?.name ?? removed.sku;
  return h(
    'li',
    { class: 'cart-line cart-undo', 'data-undo-row': removed.id },
    h(
      'p',
      { class: 'cart-undo-text' },
      ctx.fmt(t.undoRemoved || t.removed, { name: nowrapWeight(name) }),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'cart-undo-btn',
        'data-line-undo': true,
        'aria-label': t.undoOf ? ctx.fmt(t.undoOf, { name }) : null,
      },
      t.undo,
    ),
  );
}

/**
 * Renders the cart lines into `list`, reusing the <li> of each SKU. The
 * drawer and the cart page also show the undo row of a line just removed, at
 * its place.
 */
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

  const removed = opts.variant === 'summary' ? null : ctx.undo.pending;
  let row = list.querySelector<HTMLLIElement>(':scope > li[data-undo-row]');
  let lostFocusAt = -1;
  if (row && row.dataset.undoRow !== String(removed?.id)) {
    if (row.contains(document.activeElement)) lostFocusAt = [...list.children].indexOf(row);
    row.remove();
    row = null;
  }
  if (removed && !row) row = buildUndoRow(removed, ctx);

  const items: HTMLLIElement[] = lines.map((line) => {
    const li = existing.get(line.sku) ?? buildLine(line, ctx, opts.variant);
    updateLine(li, line, ctx, opts);
    return li;
  });
  if (removed && row) items.splice(undoRowIndex(removed, items.length), 0, row);
  items.forEach((li, index) => {
    // Move only when out of place: moving a focused node would blur it.
    if (list.children[index] !== li) list.insertBefore(li, list.children[index] ?? null);
  });

  // The row had the focus and went with a change of the cart: the line now
  // at its place takes it, else the one before, else the list's fallback.
  if (lostFocusAt >= 0) {
    const near = (items[lostFocusAt] ?? items[lostFocusAt - 1])?.querySelector<HTMLElement>(
      '.cart-line-name[href], [data-line-remove], [data-line-undo]',
    );
    (near ?? fallbacks.get(list)?.())?.focus();
  }
}

export interface BindOptions {
  /** Offer "Annuler" after a removal (drawer and cart page). */
  undo?: boolean;
}

/**
 * One delegated listener per list for steppers, typed quantities, remove and
 * undo. `fallbackFocus` receives the focus when the last line goes.
 */
export function bindLineEvents(
  list: HTMLElement,
  ctx: CartContext,
  fallbackFocus: () => HTMLElement | null,
  options: BindOptions = {},
): void {
  fallbacks.set(list, fallbackFocus);
  const skuOf = (el: Element) => el.closest<HTMLElement>('li[data-sku]')?.dataset.sku ?? null;
  const quantityOf = (sku: string) =>
    ctx.store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
  const nameOf = (sku: string) => ctx.catalog.products[sku]?.name ?? sku;
  const undoButton = () => list.querySelector<HTMLElement>(':scope > li[data-undo-row] button');
  const focusLost = () =>
    !document.activeElement ||
    document.activeElement === document.body ||
    !document.activeElement.isConnected;

  /**
   * Removes the line of `sku`. With undo, the row takes its place and, when
   * the removal came from the keyboard, the focus ("Annuler"); otherwise the
   * focus goes to the neighbouring line, as before.
   */
  const removeLine = (li: HTMLLIElement, sku: string, how: 'keyboard' | 'pointer' | 'blur') => {
    const neighbour = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
    const name = nameOf(sku);
    if (options.undo) ctx.undo.remove(sku);
    else ctx.store.removeLine(sku);
    const undo = options.undo ? undoButton() : null;
    const toNeighbour = () =>
      (
        (neighbour?.isConnected &&
          neighbour.querySelector<HTMLElement>('.cart-line-name[href], [data-line-remove]')) ||
        fallbackFocus()
      )?.focus();
    if (undo && how === 'keyboard') undo.focus();
    else if (how === 'pointer') toNeighbour();
    // A typed 0 committed on leaving the field: only a focus left nowhere is moved.
    else if (focusLost()) {
      if (undo) undo.focus();
      else toNeighbour();
    }
    ctx.announce(ctx.fmt(ctx.t.cart.removed, { name }));
  };

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
      // detail 0: Enter or Space on the button, not a pointer.
      removeLine(remove.closest('li')!, sku, event.detail === 0 ? 'keyboard' : 'pointer');
      return;
    }
    const undo = target.closest<HTMLButtonElement>('[data-line-undo]');
    if (undo) {
      const restored = ctx.undo.undo();
      if (!restored) return;
      const li = list.querySelector<HTMLLIElement>(
        `:scope > li[data-sku="${CSS.escape(restored.sku)}"]`,
      );
      // Back on the line's stepper: the field from the keyboard, its first
      // button from a pointer (no on-screen keyboard popping up on a phone).
      li?.querySelector<HTMLElement>(
        event.detail === 0 ? '[data-line-qty]' : '[data-line-step]',
      )?.focus();
      ctx.announce(
        ctx.fmt(ctx.t.cart.restored || ctx.t.cart.updated, { name: nameOf(restored.sku) }),
      );
    }
  });

  const commitInput = (input: HTMLInputElement, how: 'keyboard' | 'blur') => {
    const sku = skuOf(input);
    if (!sku) return;
    const value = Number.parseInt(input.value, 10);
    if (!Number.isFinite(value)) {
      input.value = String(quantityOf(sku));
      return;
    }
    if (value <= 0) {
      const li = input.closest('li');
      if (!li) return;
      if (how === 'keyboard') removeLine(li, sku, 'keyboard');
      else removeLineAfterBlur(li, sku);
      return;
    }
    ctx.store.setQuantity(sku, value);
    input.value = String(quantityOf(sku));
    ctx.announce(ctx.t.cart.updated);
  };
  /** A typed 0 committed on leaving the field (Tab or a click elsewhere). */
  const removeLineAfterBlur = (li: HTMLLIElement, sku: string) => {
    removeLine(li, sku, 'blur');
    // Tab out of the field heads for the line's own + button, gone with it:
    // once the browser has moved the focus, a focus left nowhere goes to "Annuler".
    window.setTimeout(() => {
      if (focusLost()) undoButton()?.focus();
    }, 0);
  };
  list.addEventListener('change', (event) => {
    const input = (event.target as Element).closest<HTMLInputElement>('[data-line-qty]');
    if (input) commitInput(input, 'blur');
  });
  list.addEventListener('keydown', (event) => {
    const input = (event.target as Element).closest<HTMLInputElement>('[data-line-qty]');
    if (input && event.key === 'Enter') {
      event.preventDefault();
      commitInput(input, 'keyboard');
    }
  });
}
