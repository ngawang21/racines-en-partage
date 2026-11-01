// Free-shipping progress (drawer, cart page, checkout): a sentence and a bar.
//   <div data-free-shipping>
//     <p data-free-text></p>
//     <div data-free-bar role="progressbar"><span data-free-fill></span></div>
//   </div>
import type { CartContext } from './context';
import type { Totals } from './totals';

export function renderFreeShipping(
  root: HTMLElement | null,
  totals: Totals,
  ctx: CartContext,
): void {
  if (!root) return;
  const gap = totals.freeShippingGap;
  root.hidden = gap === null || totals.lines.length === 0;
  if (gap === null) return;
  const reached = gap === 0;
  root.classList.toggle('is-reached', reached);
  const text = root.querySelector<HTMLElement>('[data-free-text]');
  if (text)
    text.textContent = reached
      ? ctx.t.cart.freeShippingReached
      : ctx.fmt(ctx.t.cart.freeShippingGap, { amount: ctx.price(gap) });
  const percent = Math.round((totals.freeShippingProgress ?? 0) * 100);
  const bar = root.querySelector<HTMLElement>('[data-free-bar]');
  bar?.setAttribute('aria-valuenow', String(percent));
  const fill = root.querySelector<HTMLElement>('[data-free-fill]');
  if (fill) fill.style.setProperty('--progress', String(percent / 100));
}
