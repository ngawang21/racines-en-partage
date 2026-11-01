// Thanks page: GET /api/orders/:sessionId, render, clear the cart once the
// order is placed. Without a valid session id, or for an order the API does
// not know, the neutral shell stays; a lookup that fails (network, 429, 5xx)
// is retried, then says so.
import { claimOrderClear, getOrder, isSessionId, type OrderSummary } from './api';
import type { CartContext } from './context';
import { nowrapWeight } from '../i18n/format';
import { h } from './dom';
import { displayCase } from './relay';

/** Waits before each retry of a failed lookup (ms). */
export const ORDER_RETRY_DELAYS = [1500, 4000];

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function initThanks(ctx: CartContext): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-thanks]');
  const tt = ctx.t.thanks;
  if (!root || !tt) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const loading = q<HTMLElement>('[data-thanks-loading]');
  const done = () => {
    root.removeAttribute('aria-busy');
    if (loading) loading.textContent = '';
  };

  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  if (!isSessionId(sessionId)) {
    done();
    return;
  }
  if (loading) loading.textContent = tt.loading;
  let lookup = await getOrder(sessionId);
  for (const delay of ORDER_RETRY_DELAYS) {
    if (lookup.status !== 'failed') break;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    lookup = await getOrder(sessionId);
  }
  done();
  if (lookup.status === 'missing') return;
  if (lookup.status === 'failed') {
    const lead = q<HTMLElement>('[data-thanks-lead]');
    if (lead) lead.textContent = tt.loadFailed;
    return;
  }
  const { order } = lookup;
  renderOrder(root, order, ctx);
  // Paid, or placed with a payment still clearing: the cart has become this
  // order. Only on the first visit, so a cart filled since is never wiped.
  if (order.status !== 'unpaid' && claimOrderClear(localStorageOrNull(), sessionId))
    ctx.store.clear();
}

function renderOrder(root: HTMLElement, order: OrderSummary, ctx: CartContext): void {
  const tt = ctx.t.thanks!;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const lead = q<HTMLElement>('[data-thanks-lead]');
  if (lead)
    lead.textContent =
      order.status === 'paid' ? tt.lead : order.status === 'pending' ? tt.pending : tt.unpaid;

  const number = q<HTMLElement>('[data-thanks-number]');
  if (number && order.number) {
    const status =
      order.status === 'paid'
        ? tt.statusPaid
        : order.status === 'pending'
          ? tt.statusPending
          : tt.statusUnpaid;
    number.replaceChildren(
      h('span', null, ctx.fmt(tt.orderNumber, { number: order.number })),
      h(
        'span',
        { class: `badge ${order.status === 'paid' ? 'badge-stock-in' : 'badge-stock-low'}` },
        status,
      ),
    );
    number.hidden = false;
  }

  q<HTMLElement>('[data-thanks-lines]')?.replaceChildren(
    ...order.lines.map((line) =>
      h(
        'li',
        { class: 'order-line' },
        h('span', { class: 'order-line-qty' }, `${line.quantity} ×`),
        h('span', { class: 'order-line-name' }, nowrapWeight(line.name)),
        h('span', { class: 'order-line-total price' }, ctx.price(line.unitAmount * line.quantity)),
      ),
    ),
  );
  const set = (sel: string, text: string) => {
    const el = q<HTMLElement>(sel);
    if (el) el.textContent = text;
  };
  set('[data-thanks-subtotal]', ctx.price(order.amounts.subtotal));
  set(
    '[data-thanks-shipping]',
    order.amounts.shipping === 0
      ? (ctx.t.checkout?.free ?? '0')
      : ctx.price(order.amounts.shipping),
  );
  const discountRow = q<HTMLElement>('[data-thanks-discount-row]');
  if (discountRow) {
    discountRow.hidden = order.amounts.discount <= 0;
    set('[data-thanks-discount]', `−${ctx.price(order.amounts.discount)}`);
  }
  set('[data-thanks-total]', ctx.price(order.amounts.total));
  const email = q<HTMLElement>('[data-thanks-email]');
  if (email && order.email) {
    email.textContent = ctx.fmt(tt.emailSent, { email: order.email });
    email.hidden = false;
  }

  const method = order.delivery?.method;
  const label = ctx.catalog.shipping.find((s) => s.id === method)?.label ?? '';
  set('[data-thanks-method]', label);
  const relay = q<HTMLElement>('[data-thanks-relay]');
  if (relay && order.delivery?.method === 'relay' && order.delivery.relay) {
    const point = order.delivery.relay;
    set('[data-thanks-relay-name]', displayCase(point.name));
    q<HTMLElement>('[data-thanks-relay-address]')?.replaceChildren(
      displayCase(point.address1),
      ...(point.address2 ? [h('br'), displayCase(point.address2)] : []),
      h('br'),
      `${point.postcode} ${displayCase(point.city)}`,
    );
    relay.hidden = false;
  }
  const pickup = q<HTMLElement>('[data-thanks-pickup]');
  if (pickup) pickup.hidden = method !== 'pickup';
  for (const step of root.querySelectorAll<HTMLElement>('[data-next]'))
    step.hidden = step.dataset.next !== method;

  const cart = q<HTMLElement>('[data-thanks-cart]');
  if (cart) cart.hidden = order.status !== 'unpaid';
  const panel = q<HTMLElement>('[data-thanks-order]');
  if (panel) panel.hidden = false;
}
