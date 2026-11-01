// Thanks page: GET /api/orders/:sessionId, render, clear the cart when paid.
// Without a valid session id, or on any error, the neutral shell stays.
import { getOrder, isSessionId, type OrderSummary } from './api';
import type { CartContext } from './context';
import { nowrapWeight } from '../i18n/format';
import { h } from './dom';
import { displayCase } from './relay';

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
  const order = await getOrder(sessionId);
  done();
  if (!order) return;
  renderOrder(root, order, ctx);
  if (order.status === 'paid') ctx.store.clear();
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
