// Opens the disclosure that holds the URL fragment target ("#recipe" from a
// "Voir la recette" link, the recipes page or the JSON-LD url), then brings
// it into view and moves focus to its panel, so keyboard and screen reader
// users land on it too. The panel takes the focus (tabindex="-1", no ring,
// Accordion.astro), not the summary: a focus moved by script after a click on
// another page matches :focus-visible in Chromium, and the summary's square
// red ring read as an error (review 13). Chromium and Firefox open a closed <details> on a
// fragment navigation themselves, but the scroll they make while the panel is
// still folded (or animating open) can leave the page at the top; Safari
// does not open it at all. Runs on load and on every hash change.

/**
 * The panel of a <details> that has just opened cannot take the focus until
 * its open animation (Accordion.astro, 280 ms) has rendered it: try on each
 * frame for up to a second and a half.
 */
function focusWhenRendered(panel: HTMLElement, until = performance.now() + 1500): void {
  panel.focus({ preventScroll: true });
  if (document.activeElement === panel || performance.now() > until) return;
  requestAnimationFrame(() => focusWhenRendered(panel, until));
}

function revealTarget(smooth: boolean): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  const details = target?.closest<HTMLDetailsElement>('details');
  const summary = details?.querySelector<HTMLElement>(':scope > summary');
  const panel = target?.closest<HTMLElement>('.acc-body');
  if (!target || !details || !summary || !panel) return;
  details.open = true;
  // After layout: the summary sits above the opening panel, so its position
  // does not depend on the open animation. scrollIntoView honours the
  // page's scroll-padding-top (the sticky header).
  requestAnimationFrame(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    summary.scrollIntoView({ block: 'start', behavior: smooth && !reduce ? 'smooth' : 'instant' });
    if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
    focusWhenRendered(panel);
  });
}

// On arrival the page jumps straight there; an in-page link glides.
revealTarget(false);
window.addEventListener('hashchange', () => revealTarget(true));
