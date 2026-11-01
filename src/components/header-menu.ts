// Mobile menu (<details class="mobile-menu">): works without this script;
// this adds what <details> lacks for a menu. Escape closes it and returns
// focus to the button, choosing a link closes it, and a page restored from
// the back-forward cache, or a window widened to the desktop layout, never
// shows it open. The scrim behind the panel is the summary's ::before, so a
// tap outside the panel toggles it closed natively.

function initHeaderMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('details.mobile-menu');
  if (!menu) return;
  const summary = menu.querySelector('summary');
  const close = (focus = false) => {
    if (!menu.open) return;
    menu.open = false;
    if (focus) summary?.focus();
  };

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
  window.matchMedia('(min-width: 900px)').addEventListener('change', (event) => {
    if (event.matches) close();
  });
}

initHeaderMenu();
