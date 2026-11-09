// "Complétez votre commande" (spec iteration 3, 2.9) in the drawer and on the
// cart page. The products come from pickCrossSell; each item carries the add
// button of the cart contract, so src/cart/ui.ts handles the click.
//   <section data-cross-sell hidden>
//     <h2|h3 data-cross-sell-title tabindex="-1">...</h2|h3>
//     <ul data-cross-sell-list></ul>
//   </section>
import type { ClientProduct } from '../catalog/build';
import { nowrapWeight } from '../i18n/format';
import type { CartContext } from './context';
import { pickCrossSell, pickFeatured } from './cross-sell';
import { h, icon } from './dom';
import { unitPriceText } from './lines';
import type { CartState } from './store';

const MAX_SUGGESTIONS = 2;
const MAX_FEATURED = 4;

function buildItem(product: ClientProduct, ctx: CartContext): HTMLLIElement {
  const kilo = unitPriceText(product, ctx);
  return h(
    'li',
    // Not data-sku: `li[data-sku]` means a cart line (tests, line events).
    { class: 'cross-sell-item', 'data-cross-sell-sku': product.sku },
    h(
      'a',
      { class: 'cross-sell-media', href: product.url, tabindex: -1, 'aria-hidden': 'true' },
      h('img', {
        src: product.image,
        alt: '',
        width: 56,
        height: 70,
        loading: 'lazy',
        decoding: 'async',
      }),
    ),
    h(
      'div',
      { class: 'cross-sell-body' },
      h('a', { class: 'cross-sell-name', href: product.url }, nowrapWeight(product.name)),
      h(
        'p',
        { class: 'cross-sell-price' },
        h('span', { class: 'price' }, ctx.price(product.unitAmount)),
        kilo ? h('span', { class: 'cross-sell-kilo' }, kilo) : null,
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary cross-sell-add',
        'data-add-to-cart': true,
        'data-sku': product.sku,
        'aria-label': ctx.fmt(ctx.t.cart.crossSellAddOf, { name: product.name }),
      },
      icon('plus', 18),
      h('span', null, ctx.t.cart.crossSellAdd),
    ),
  );
}

/** Renders the suggestions for `cart`, rebuilding the list only when they change. */
export function renderCrossSell(root: HTMLElement | null, cart: CartState, ctx: CartContext): void {
  if (!root) return;
  const list = root.querySelector<HTMLElement>('[data-cross-sell-list]');
  if (!list) return;
  // A paused shop sells nothing: no suggestion either.
  const picks = ctx.shopOpen ? pickCrossSell(cart.lines, ctx.catalog, MAX_SUGGESTIONS) : [];
  root.hidden = picks.length === 0;
  const wanted = picks.map((p) => p.sku).join(' ');
  if (list.dataset.skus === wanted) return;
  list.dataset.skus = wanted;
  list.replaceChildren(...picks.map((p) => buildItem(p, ctx)));
}

/**
 * The empty cart as a shop window (review 14): "Nos incontournables" under
 * the empty message of the drawer and the cart page, with the cross-sell
 * items and their add buttons. Shown only while the cart is empty.
 *   <section data-cart-featured hidden><ul data-cross-sell-list></ul></section>
 */
export function renderFeatured(root: HTMLElement | null, cart: CartState, ctx: CartContext): void {
  if (!root) return;
  const list = root.querySelector<HTMLElement>('[data-cross-sell-list]');
  if (!list) return;
  const picks =
    ctx.shopOpen && cart.lines.length === 0 ? pickFeatured(ctx.catalog, MAX_FEATURED) : [];
  root.hidden = picks.length === 0;
  const wanted = picks.map((p) => p.sku).join(' ');
  if (list.dataset.skus === wanted) return;
  list.dataset.skus = wanted;
  list.replaceChildren(...picks.map((p) => buildItem(p, ctx)));
}
