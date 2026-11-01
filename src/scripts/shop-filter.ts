// Shop page filtering and sorting on the rendered DOM (spec 5.4). Progressive
// enhancement: the server renders every card; this script hides, shows and
// reorders them, and mirrors the state in the hash ("#cat=poudres&sort=name").

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name';
const SORTS: readonly Sort[] = ['featured', 'price-asc', 'price-desc', 'name'];

const tools = document.querySelector<HTMLElement>('[data-shop-tools]');
const grid = document.querySelector<HTMLElement>('[data-product-grid]');

if (tools && grid) {
  const chips = [...tools.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const select = tools.querySelector<HTMLSelectElement>('[data-sort]');
  const count = document.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  const items = [...grid.querySelectorAll<HTMLElement>('[data-product-item]')];
  const known = new Set(chips.map((c) => c.dataset.filter));
  const locale = tools.dataset.locale ?? 'fr';
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });

  const card = (li: HTMLElement) => li.querySelector<HTMLElement>('[data-product-card]')!.dataset;

  const read = (): { cat: string; sort: Sort } => {
    const params = new URLSearchParams(location.hash.slice(1));
    const cat = params.get('cat') ?? 'all';
    const sort = params.get('sort') as Sort | null;
    return {
      cat: known.has(cat) ? cat : 'all',
      sort: sort && SORTS.includes(sort) ? sort : 'featured',
    };
  };

  const write = (cat: string, sort: Sort) => {
    const params = new URLSearchParams();
    if (cat !== 'all') params.set('cat', cat);
    if (sort !== 'featured') params.set('sort', sort);
    const hash = params.toString();
    const url = `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`;
    history.replaceState(null, '', url);
  };

  const compare: Record<Sort, (a: DOMStringMap, b: DOMStringMap) => number> = {
    featured: (a, b) => Number(a.order) - Number(b.order),
    'price-asc': (a, b) => Number(a.price) - Number(b.price) || Number(a.order) - Number(b.order),
    'price-desc': (a, b) => Number(b.price) - Number(a.price) || Number(a.order) - Number(b.order),
    name: (a, b) =>
      collator.compare(a.name ?? '', b.name ?? '') || Number(a.weight) - Number(b.weight),
  };

  const apply = ({ cat, sort }: { cat: string; sort: Sort }) => {
    for (const chip of chips)
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === cat));
    if (select) select.value = sort;

    const sorted = [...items].sort((a, b) => compare[sort](card(a), card(b)));
    let shown = 0;
    for (const li of sorted) {
      const visible = cat === 'all' || card(li).category === cat;
      li.hidden = !visible;
      if (visible) shown += 1;
      grid.append(li);
    }
    if (empty) empty.hidden = shown > 0;
    if (count) {
      const one = locale === 'fr' ? shown <= 1 : shown === 1;
      const template = (one ? tools.dataset.countOne : tools.dataset.countMany) ?? '%n';
      count.textContent = template.replace('%n', String(shown));
    }
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const next = { cat: chip.dataset.filter ?? 'all', sort: read().sort };
      write(next.cat, next.sort);
      apply(next);
    });
  }
  select?.addEventListener('change', () => {
    const next = { cat: read().cat, sort: (select.value as Sort) || 'featured' };
    write(next.cat, next.sort);
    apply(next);
  });
  window.addEventListener('hashchange', () => apply(read()));

  if (location.hash) apply(read());
}
