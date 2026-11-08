// Cart drawer (spec 5.5): a modal <dialog> sliding from the right. showModal
// makes the page inert (focus stays inside), Escape and a backdrop click
// close it, and the focus returns to the control that opened it.
import type { CartContext } from './context';
import { renderCrossSell } from './cross-sell-view';
import { renderFreeShipping } from './free-shipping';
import { bindLineEvents, renderLines } from './lines';
import type { CartState } from './store';
import { computeTotals } from './totals';

export interface Drawer {
  open(opener?: HTMLElement | null): void;
  close(): void;
  render(cart: CartState): void;
}

const CLOSE_FALLBACK_MS = 400;

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
  const free = q<HTMLElement>('[data-free-shipping]');
  const crossSell = q<HTMLElement>('[data-cross-sell]');
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

  const close = () => {
    if (!dialog.open || closing) return;
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

  if (list) bindLineEvents(list, ctx, () => title);

  return {
    open(from) {
      if (dialog.open) {
        title?.focus();
        return;
      }
      opener = from ?? (document.activeElement as HTMLElement | null);
      closing = false;
      dialog.classList.remove('is-closing');
      document.documentElement.classList.add('has-drawer');
      dialog.showModal();
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
      renderFreeShipping(free, totals, ctx);
      renderCrossSell(crossSell, cart, ctx);
    },
  };
}
