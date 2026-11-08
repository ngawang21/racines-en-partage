// Sticky buy bar (StickyBuy.astro), phones only: it appears once the page's
// buy block has scrolled above the top of the screen, and leaves as soon as
// the block is back in view. On arrival the block itself sits in the first
// screen (ProductView), so the bar never covers the name. While hidden the
// bar is inert, so it never takes focus. Reduced motion is handled in CSS.

function initStickyBuy(): void {
  const bar = document.querySelector<HTMLElement>('[data-sticky-buy]');
  const buy = document.querySelector<HTMLElement>('[data-buy-block]');
  if (!bar || !buy || !('IntersectionObserver' in window)) return;
  const phone = window.matchMedia('(max-width: 899px)');
  let above = false;

  const sync = () => {
    const show = phone.matches && above;
    // Keep focus out of a bar that is sliding away.
    if (!show && bar.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    bar.classList.toggle('is-visible', show);
    bar.inert = !show;
  };

  // Shown only when the block is out of view above the screen: a block still
  // below the fold (a long tagline on a short phone) leaves the bar hidden.
  new IntersectionObserver(([entry]) => {
    if (!entry) return;
    above = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    sync();
  }).observe(buy);
  phone.addEventListener('change', sync);
}

initStickyBuy();
