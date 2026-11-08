// Opens the disclosure that holds the URL fragment target ("#recipe" from a
// "Voir la recette" link, the recipes page or the JSON-LD url), then brings
// it into view and moves focus to its summary, so keyboard and screen reader
// users land on it too. Chromium and Firefox open a closed <details> on a
// fragment navigation themselves, but the scroll they make while the panel is
// still folded (or animating open) can leave the page at the top; Safari
// does not open it at all. Runs on load and on every hash change.

function revealTarget(smooth: boolean): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  const details = target?.closest<HTMLDetailsElement>('details');
  const summary = details?.querySelector<HTMLElement>(':scope > summary');
  if (!target || !details || !summary) return;
  details.open = true;
  // After layout: the summary sits above the opening panel, so its position
  // does not depend on the open animation. scrollIntoView honours the
  // page's scroll-padding-top (the sticky header).
  requestAnimationFrame(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    summary.scrollIntoView({ block: 'start', behavior: smooth && !reduce ? 'smooth' : 'instant' });
    summary.focus({ preventScroll: true });
  });
}

// On arrival the page jumps straight there; an in-page link glides.
revealTarget(false);
window.addEventListener('hashchange', () => revealTarget(true));
