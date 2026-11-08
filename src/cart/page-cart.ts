// Cart page: renders the browser cart into the static shell of CartView.astro.
import type { CartContext } from './context';
import { renderCrossSell } from './cross-sell-view';
import { renderFreeShipping } from './free-shipping';
import { bindLineEvents, renderLines } from './lines';
import type { CartState } from './store';
import { computeTotals } from './totals';

export function initCartPage(ctx: CartContext): void {
  const root = document.querySelector<HTMLElement>('[data-cart-page]');
  if (!root) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const content = q<HTMLElement>('[data-cart-page-content]');
  const empty = q<HTMLElement>('[data-cart-page-empty]');
  const list = q<HTMLUListElement>('[data-cart-page-lines]');
  const count = q<HTMLElement>('[data-cart-page-count]');
  const subtotal = q<HTMLElement>('[data-cart-page-subtotal]');
  const alert = q<HTMLElement>('[data-cart-page-alert]');
  const checkout = q<HTMLAnchorElement>('[data-cart-page-checkout]');
  const free = q<HTMLElement>('[data-free-shipping]');
  const crossSell = q<HTMLElement>('[data-cross-sell]');
  const heading = root.querySelector<HTMLElement>('h1');
  if (!list) return;

  checkout?.addEventListener('click', (event) => {
    if (checkout.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });

  bindLineEvents(list, ctx, () => {
    if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    return heading;
  });

  const render = (cart: CartState) => {
    const totals = computeTotals(cart, ctx.catalog);
    const hasLines = cart.lines.length > 0;
    if (content) content.hidden = !hasLines;
    if (empty) empty.hidden = hasLines;
    renderLines(list, cart.lines, ctx, { variant: 'page' });
    if (count) count.textContent = hasLines ? ctx.itemsLabel(totals.itemCount) : '';
    if (subtotal) subtotal.textContent = ctx.price(totals.subtotal);
    renderFreeShipping(free, totals, ctx);
    renderCrossSell(crossSell, cart, ctx);
    const blocked = totals.unknownSkus.length > 0 || totals.outOfStockSkus.length > 0;
    if (alert) alert.hidden = !blocked;
    if (checkout) {
      const disabled = blocked || !ctx.shopOpen;
      if (disabled) checkout.setAttribute('aria-disabled', 'true');
      else checkout.removeAttribute('aria-disabled');
    }
    root.removeAttribute('aria-busy');
  };
  render(ctx.store.getCart());
  ctx.store.subscribe(render);
}
