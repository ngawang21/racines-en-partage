// Thanks page: GET /api/orders/:sessionId, render, clear the cart once the
// order is placed. Without a valid session id, or for an order the API does
// not know, the neutral shell stays; a lookup that fails (network, 429, 5xx)
// is retried, then says so.
import { claimOrderClear, getOrder, isSessionId } from './api';
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
  // Paid, or placed with a payment still clearing: the cart has become this
  // order. Only on the first visit, so a cart filled since is never wiped.
  if (order.status !== 'unpaid' && claimOrderClear(localStorageOrNull(), sessionId))
    ctx.store.clear();
}
