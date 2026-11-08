// Thanks page: GET /api/orders/:sessionId and render. Without a valid session
// id, or for an order the API does not know, the neutral shell stays; a lookup
// that fails (network, 429, 5xx) is retried, then says so.
//
// Stripe only sends the customer here (success_url) once the Checkout Session
// is complete: the paid cart is emptied on arrival, before the lookup, so a
// failed lookup never leaves lines that could be paid twice. Only on the first
// visit for that session, so a cart filled since is never wiped. The one case
// that gives the lines back is a session the API reports as not completed
// (`unpaid`, an address typed by hand): "your cart is waiting" must hold.
import { claimOrderClear, getOrder, isSessionId, releaseOrderClear } from './api';
import type { CartContext } from './context';
import { renderOrder } from './order-view';

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
  const storage = localStorageOrNull();
  const paidCart = ctx.store.getCart();
  const cleared = claimOrderClear(storage, sessionId);
  if (cleared) ctx.store.clear();

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
  const lead = q<HTMLElement>('[data-thanks-lead]');
  try {
    renderOrder(root, order, ctx);
  } catch {
    // A payload the renderer does not expect: say so rather than half a page.
    q<HTMLElement>('[data-thanks-order]')?.setAttribute('hidden', '');
    if (lead) lead.textContent = tt.loadFailed;
    return;
  }
  if (lead)
    lead.textContent =
      order.status === 'paid' ? tt.lead : order.status === 'pending' ? tt.pending : tt.unpaid;
  // Not completed after all: put the lines back (unless a cart was filled
  // meanwhile, in another tab) and forget the claim, so a later successful
  // payment of the same session still empties the cart.
  if (order.status === 'unpaid' && cleared) {
    releaseOrderClear(storage, sessionId);
    if (ctx.store.getCart().lines.length === 0 && paidCart.lines.length > 0) {
      for (const line of paidCart.lines) ctx.store.addLine(line.sku, line.quantity);
      if (paidCart.delivery) ctx.store.setDelivery(paidCart.delivery);
    }
  }
}
