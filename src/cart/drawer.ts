// Cart drawer (spec 5.5): a modal <dialog> sliding from the right. showModal
// makes the page inert (focus stays inside), Escape and a backdrop click
// close it, and the focus returns to the control that opened it. Opening it
// closes the mobile menu (one overlay at a time, so Escape reaches the
// drawer), and a page restored from the back/forward cache never shows it.
//
// History (review 14, phone): opening pushes a same-URL entry marked
// HISTORY_KEY, so the phone's Back closes the drawer instead of leaving the
// page; closing it any other way (Escape, the button, the backdrop) goes back
// over that entry, so the history holds no trace of the drawer.
import type { CartContext } from './context';
import { renderCrossSell, renderFeatured } from './cross-sell-view';
import { renderFreeShipping } from './free-shipping';
import { bindLineEvents, renderLines } from './lines';
import { shippingHint, shippingHintText } from './shipping-hint';
import type { CartState } from './store';
import { computeTotals } from './totals';

export interface Drawer {
  open(opener?: HTMLElement | null): void;
  close(): void;
  render(cart: CartState): void;
}

const CLOSE_FALLBACK_MS = 300;
/** Marker of the history entry the open drawer pushed. */
const HISTORY_KEY = 'repDrawer';

const isDrawerEntry = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && HISTORY_KEY in state;

export function createDrawer(ctx: CartContext): Drawer | null {
  const dialog = document.getElementById('cart-drawer') as HTMLDialogElement | null;
  if (!dialog || typeof dialog.showModal !== 'function') return null;
  const q = <T extends HTMLElement>(sel: string) => dialog.querySelector<T>(sel);
  const list = q<HTMLUListElement>('[data-drawer-lines]');
  const title = q<HTMLElement>('[data-drawer-title]');
  const empty = q<HTMLElement>('[data-drawer-empty]');
  const foot = q<HTMLElement>('[data-drawer-foot]');
  const count = q<HTMLElement>('[data-drawer-count]');
  const subtotal = q<HTMLElement>('[data-drawer-subtotal]');
  const shipping = q<HTMLElement>('[data-drawer-shipping]');
  const free = q<HTMLElement>('[data-free-shipping]');
  const crossSell = q<HTMLElement>('[data-cross-sell]');
  const featured = q<HTMLElement>('[data-cart-featured]');
  let opener: HTMLElement | null = null;
  let closing = false;

  const setExpanded = (value: boolean) => {
    for (const toggle of document.querySelectorAll('[data-cart-toggle]'))
      toggle.setAttribute('aria-expanded', String(value));
  };

  const finishClose = () => {
    if (!closing) return;
    closing = false;
    dialog.classList.remove('is-closing');
    if (dialog.open) dialog.close();
  };

  /** Leaves the drawer's history entry, when it is the current one. */
  const popEntry = () => {
    if (isDrawerEntry(window.history.state)) window.history.back();
  };

  const close = () => {
    if (!dialog.open || closing) return;
    popEntry();
    closing = true;
    dialog.classList.add('is-closing');
    dialog.addEventListener('animationend', finishClose, { once: true });
    window.setTimeout(finishClose, CLOSE_FALLBACK_MS);
  };

  dialog.addEventListener('close', () => {
    closing = false;
    dialog.classList.remove('is-closing');
    setExpanded(false);
    document.documentElement.classList.remove('has-drawer');
    if (opener?.isConnected) opener.focus();
    opener = null;
  });
  dialog.addEventListener('cancel', (event) => {
    // Escape: run the exit animation first.
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    // Clicks on the ::backdrop are dispatched to the dialog itself.
    if (event.target === dialog) close();
    else if ((event.target as Element).closest('[data-drawer-close]')) close();
  });

  // Back to this page after following a drawer link ("Commander"): the
  // restored page must not sit inert under the modal. Closed at once, without
  // the exit animation, and without moving the focus.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && dialog.open) {
      opener = null;
      closing = false;
      dialog.classList.remove('is-closing');
      dialog.close();
    }
    // Left through a drawer link, the page comes back on the drawer's entry:
    // step over it (same document, so no load) and the next Back leaves.
    // A page loaded afresh on that entry cannot step back without a reload;
    // it drops the marker instead.
    if (!isDrawerEntry(window.history.state)) return;
    if (event.persisted) window.history.back();
    else window.history.replaceState(null, '');
  });

  // Back while the drawer is open: close it (the entry is already gone).
  window.addEventListener('popstate', (event) => {
    if (isDrawerEntry(event.state) || !dialog.open || closing) return;
    closing = true;
    dialog.classList.add('is-closing');
    dialog.addEventListener('animationend', finishClose, { once: true });
    window.setTimeout(finishClose, CLOSE_FALLBACK_MS);
  });

  if (list) bindLineEvents(list, ctx, () => title);

  return {
    open(from) {
      if (dialog.open) {
        title?.focus();
        return;
      }
      opener = from ?? (document.activeElement as HTMLElement | null);
      // The mobile menu stays behind otherwise, and its Escape handler would
      // close it before the drawer.
      const menu = document.querySelector<HTMLDetailsElement>('details.mobile-menu[open]');
      if (menu) menu.open = false;
      closing = false;
      dialog.classList.remove('is-closing');
      document.documentElement.classList.add('has-drawer');
      dialog.showModal();
      if (!isDrawerEntry(window.history.state))
        window.history.pushState({ [HISTORY_KEY]: true }, '');
      setExpanded(true);
      // The heading takes the focus so the title and the live message are read first.
      title?.focus();
    },
    close,
    render(cart) {
      const totals = computeTotals(cart, ctx.catalog);
      const hasLines = cart.lines.length > 0;
      if (empty) empty.hidden = hasLines;
      if (foot) foot.hidden = !hasLines;
      if (list) {
        list.hidden = !hasLines;
        renderLines(list, cart.lines, ctx, { variant: 'drawer' });
      }
      if (count) count.textContent = hasLines ? ctx.itemsLabel(totals.itemCount) : '';
      if (subtotal) subtotal.textContent = ctx.price(totals.subtotal);
      if (shipping)
        shipping.textContent = shippingHintText(
          shippingHint(totals.subtotal, ctx.catalog),
          ctx.t.cart,
          ctx.price,
        );
      renderFreeShipping(free, totals, ctx);
      renderCrossSell(crossSell, cart, ctx);
      renderFeatured(featured, cart, ctx);
    },
  };
}
