// Format chips of a product card (ProductCard.astro): without script a chip
// is the link to its format's page. Here it becomes a toggle button: a plain
// click, Space or Enter shows that format in the card (price, price per
// kilo, stock badge, add button, title link) without leaving the page. A
// modified click (new tab) still follows the link. Everything shown comes
// from the chip's data-* attributes, formatted at build time.
//
// Listeners are delegated on the document: shop-filter.ts moves the cards,
// and one script serves every card of the page. The article's data-price and
// data-weight are left alone so a sort never moves a card after a choice.

const CHIP = 'a.card-format[data-sku]';
const FLAG = 'repCardFormats';

function enhance(list: Element): void {
  if (list.getAttribute('role') === 'group') return;
  list.setAttribute('role', 'group');
  for (const item of list.children) item.setAttribute('role', 'presentation');
  for (const chip of list.querySelectorAll<HTMLElement>(CHIP)) {
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-pressed', String(chip.hasAttribute('data-shown')));
  }
}

function setText(root: Element, selector: string, text: string): void {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function select(chip: HTMLAnchorElement): void {
  const card = chip.closest('[data-product-card]');
  const list = chip.closest('.card-formats');
  if (!card || !list) return;
  enhance(list);
  for (const other of list.querySelectorAll(CHIP))
    other.setAttribute('aria-pressed', String(other === chip));

  const d = chip.dataset;
  const out = d.stock === 'out';
  const weight = d.weightLabel ?? '';
  const price = d.priceLabel ?? '';

  setText(card, '.card-price', price);
  setText(card, '[data-card-unit]', d.unit ?? '');
  setText(card, '[data-card-weight]', `, ${weight}`);
  card.querySelector<HTMLElement>('.card-from')?.setAttribute('hidden', '');

  const title = card.querySelector<HTMLAnchorElement>('.card-title a');
  const href = chip.getAttribute('href');
  if (title && href) title.setAttribute('href', href);

  const badge = card.querySelector<HTMLElement>('.card-badge');
  if (badge) {
    badge.className = badge.className.replace(/\bbadge-stock-\w+/, d.stockClass ?? '');
    badge.textContent = d.stockLabel ?? '';
    badge.hidden = d.stock === 'in_stock';
  }

  const add = card.querySelector<HTMLButtonElement>('button[data-add-to-cart]');
  if (add) {
    add.dataset.sku = d.sku;
    add.dataset.stock = d.stock;
    add.disabled = out || add.hasAttribute('data-shop-closed');
    const label = add.querySelector<HTMLElement>('.card-add-label');
    if (label) label.textContent = (out ? label.dataset.out : label.dataset.add) ?? '';
    setText(add, '[data-card-sr]', `, ${d.name ?? ''} ${weight}`);
  }

  // "200 g, 12,00 €", then the stock label when the format is sold out.
  const lang = document.documentElement.lang || undefined;
  const sold = out ? `, ${(d.stockLabel ?? '').toLocaleLowerCase(lang)}` : '';
  setText(card, '[data-card-status]', `${weight}, ${price}${sold}`);
}

function chipOf(event: Event): HTMLAnchorElement | null {
  return event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(CHIP) : null;
}

function init(): void {
  for (const list of document.querySelectorAll('.card-formats')) enhance(list);
  // One set of listeners per document, however often the module runs.
  if (document.documentElement.dataset[FLAG] !== undefined) return;
  document.documentElement.dataset[FLAG] = '';

  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    const chip = chipOf(event);
    if (!chip) return;
    event.preventDefault();
    select(chip);
  });
  // Enter on a link already fires a click; Space is what a button adds.
  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
    const chip = chipOf(event);
    if (!chip) return;
    event.preventDefault();
    select(chip);
  });
}

init();
