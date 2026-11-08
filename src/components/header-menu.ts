// Header behaviour on top of markup that works without script.
//
// Mobile menu (<details class="mobile-menu">): Escape closes it and returns
// focus to the button, choosing a link closes it, and a page restored from
// the back-forward cache, or a window widened to the desktop layout, never
// shows it open. The scrim beside the panel is the summary's ::before, so a
// tap outside the panel toggles it closed natively. The panel and the scrim
// start at the header's bottom edge, published here as --menu-top (the
// announcement bar may still be on screen above the header).
//
// Tucked header (phones and small tablets, below 1024 px; spec 8.2): scrolling down slides the header out of
// view, scrolling up brings it back, so the small screen is for the product.
// Transform only (Header.astro styles), never while the menu, the search or
// the cart drawer is open, never under reduced motion, and focus inside the
// header always shows it.

const TUCK_DELTA = 8;

function initHeaderMenu(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  const menu = document.querySelector<HTMLDetailsElement>('details.mobile-menu');
  if (!header || !menu) return;
  const summary = menu.querySelector('summary');
  const close = (focus = false) => {
    if (!menu.open) return;
    menu.open = false;
    if (focus) summary?.focus();
  };
  const placePanel = () => {
    const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
    document.documentElement.style.setProperty('--menu-top', `${bottom}px`);
  };

  // Before the menu opens, so the panel never paints at the fallback edge.
  summary?.addEventListener('click', () => {
    header.classList.remove('is-tucked');
    placePanel();
  });
  window.addEventListener('resize', () => menu.open && placePanel());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      close(true);
    }
  });
  menu.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('.mobile-nav a')) close();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) close();
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
    if (event.matches) close();
  });

  initTuck(header, menu);
}

function initTuck(header: HTMLElement, menu: HTMLDetailsElement): void {
  const phone = window.matchMedia('(max-width: 1023px)');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const overlayOpen = () =>
    menu.open ||
    document.querySelector('#search-dialog[open], #cart-drawer[open]') !== null ||
    // Keyboard focus only: a tapped button keeps focus but needs no header.
    header.querySelector(':focus-visible') !== null;
  let lastY = window.scrollY;
  let frame = 0;

  const update = () => {
    frame = 0;
    const y = window.scrollY;
    const delta = y - lastY;
    if (!phone.matches || still.matches || overlayOpen() || y <= header.offsetHeight) {
      header.classList.remove('is-tucked');
      lastY = y;
      return;
    }
    if (Math.abs(delta) < TUCK_DELTA) return;
    header.classList.toggle('is-tucked', delta > 0);
    lastY = y;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    },
    { passive: true },
  );
  header.addEventListener('focusin', () => {
    if (header.querySelector(':focus-visible')) header.classList.remove('is-tucked');
  });
  phone.addEventListener('change', update);
}

initHeaderMenu();
