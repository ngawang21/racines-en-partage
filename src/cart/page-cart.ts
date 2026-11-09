// Cart page: renders the browser cart into the static shell of CartView.astro.
import type { CartContext } from './context';
import { renderCrossSell, renderFeatured } from './cross-sell-view';
import { renderFreeShipping } from './free-shipping';
import { bindLineEvents, renderLines } from './lines';
import { shippingHint, shippingHintText } from './shipping-hint';
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
  const shipping = q<HTMLElement>('[data-cart-page-shipping]');
  const alert = q<HTMLElement>('[data-cart-page-alert]');
  const checkout = q<HTMLAnchorElement>('[data-cart-page-checkout]');
  const free = q<HTMLElement>('[data-free-shipping]');
  const crossSell = q<HTMLElement>('[data-cross-sell]');
  const featured = q<HTMLElement>('[data-cart-featured]');
  const bar = q<HTMLElement>('[data-cart-bar]');
  const barSubtotal = q<HTMLElement>('[data-cart-bar-subtotal]');
  const barCheckout = q<HTMLAnchorElement>('[data-cart-bar-checkout]');
  const heading = root.querySelector<HTMLElement>('h1');
  if (!list) return;

  for (const link of [checkout, barCheckout])
    link?.addEventListener('click', (event) => {
      if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
    });

  bindLineEvents(list, ctx, () => {
    if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    return heading;
  });

  // The phone bar shows while the summary's button is below the viewport
  // (not yet reached); once the visitor has scrolled past it, the bar stays
  // away so it never covers the cross-sell or the footer. CSS hides it from
  // 900 px, where the summary is a sticky column.
  let hasLines = false;
  let buttonBelow = false;
  const updateBar = () => bar?.classList.toggle('is-visible', hasLines && buttonBelow);
  if (bar && checkout && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const viewportBottom = entry.rootBounds?.bottom ?? window.innerHeight;
        buttonBelow = !entry.isIntersecting && entry.boundingClientRect.top >= viewportBottom;
      }
      updateBar();
    }).observe(checkout);
  }

  const render = (cart: CartState) => {
    const totals = computeTotals(cart, ctx.catalog);
    hasLines = cart.lines.length > 0;
    if (content) content.hidden = !hasLines;
    if (empty) empty.hidden = hasLines;
    renderLines(list, cart.lines, ctx, { variant: 'page' });
    if (count) count.textContent = hasLines ? ctx.itemsLabel(totals.itemCount) : '';
    const subtotalText = ctx.price(totals.subtotal);
    if (subtotal) subtotal.textContent = subtotalText;
    if (barSubtotal) barSubtotal.textContent = subtotalText;
    if (shipping) {
      const hint = shippingHint(totals.subtotal, ctx.catalog);
      shipping.textContent = shippingHintText(hint, ctx.t.cart, ctx.price);
      shipping.closest('.summary-row')?.classList.toggle('is-free', hint?.kind === 'free');
    }
    renderFreeShipping(free, totals, ctx);
    renderCrossSell(crossSell, cart, ctx);
    renderFeatured(featured, cart, ctx);
    const blocked = totals.unknownSkus.length > 0 || totals.outOfStockSkus.length > 0;
    if (alert) alert.hidden = !blocked;
    for (const link of [checkout, barCheckout]) {
      if (!link) continue;
      if (blocked || !ctx.shopOpen) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
    }
    updateBar();
    root.removeAttribute('aria-busy');
  };
  render(ctx.store.getCart());
  ctx.store.subscribe(render);
}
