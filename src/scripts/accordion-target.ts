// Opens the disclosure that holds the URL fragment target. Chromium and
// Firefox open a closed <details> on a fragment navigation themselves; Safari
// does not, so a visitor landing on "#recipe" (recipes page, JSON-LD url)
// would see the recipe folded. Runs on load and on every hash change.

function openTarget(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  const details = target?.closest<HTMLDetailsElement>('details');
  if (!target || !details || details.open) return;
  details.open = true;
  // The browser scrolled while the panel was closed: land on the target now.
  target.scrollIntoView({ block: 'start' });
}

openTarget();
window.addEventListener('hashchange', openTarget);
