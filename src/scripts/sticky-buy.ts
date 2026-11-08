// Sticky buy bar (StickyBuy.astro): visible on phones once the page's buy
// block has scrolled up out of view, hidden again when it comes back or the
// window widens to the desktop layout. While hidden the bar is inert, so it
// never takes focus. Reduced motion is handled in CSS (no slide).

function initStickyBuy(): void {
  const bar = document.querySelector<HTMLElement>('[data-sticky-buy]');
  const buy = document.querySelector<HTMLElement>('[data-buy-block]');
  if (!bar || !buy || !('IntersectionObserver' in window)) return;
  const phone = window.matchMedia('(max-width: 899px)');
  let passed = false;

  const sync = () => {
    const show = phone.matches && passed;
    // Keep focus out of a bar that is sliding away.
    if (!show && bar.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    bar.classList.toggle('is-visible', show);
    bar.inert = !show;
  };

  // The root reaches far below the viewport, so the block "intersects" until
  // it has scrolled up past the top, and a jump (an anchor link, a restored
  // scroll position) from below the fold to above it still crosses the edge.
  new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      passed = !entry.isIntersecting;
      sync();
    },
    { rootMargin: '0px 0px 1000000px 0px' },
  ).observe(buy);
  phone.addEventListener('change', sync);
}

initStickyBuy();
