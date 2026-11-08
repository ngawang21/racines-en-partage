// Sticky buy bar (StickyBuy.astro): visible on phones whenever the page's buy
// block is off screen, below the fold on arrival (so price and add are in
// the first viewport, premium standard 1.1) or scrolled past; hidden while
// the block itself shows and from 900 px. While hidden the bar is inert, so
// it never takes focus. Reduced motion is handled in CSS (no slide).

function initStickyBuy(): void {
  const bar = document.querySelector<HTMLElement>('[data-sticky-buy]');
  const buy = document.querySelector<HTMLElement>('[data-buy-block]');
  if (!bar || !buy || !('IntersectionObserver' in window)) return;
  const phone = window.matchMedia('(max-width: 899px)');
  let offscreen = false;

  const sync = () => {
    const show = phone.matches && offscreen;
    // Keep focus out of a bar that is sliding away.
    if (!show && bar.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    bar.classList.toggle('is-visible', show);
    bar.inert = !show;
  };

  // Off screen either way: a jump from below the fold to above it changes
  // nothing, the bar stays.
  new IntersectionObserver(([entry]) => {
    if (!entry) return;
    offscreen = !entry.isIntersecting;
    sync();
  }).observe(buy);
  phone.addEventListener('change', sync);
}

initStickyBuy();
