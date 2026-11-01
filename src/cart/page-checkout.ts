// Checkout page (spec 5.4, 6.3, 6.4): summary lines, delivery method cards,
// the Mondial Relay picker, totals, terms and the call to POST /api/checkout.
import { ERROR_KEY, buildCheckoutRequest, postCheckout, safeRedirect, type ApiError } from './api';
import type { CartContext } from './context';
import { h } from './dom';
import { renderFreeShipping } from './free-shipping';
import { bindLineEvents, renderLines } from './lines';
import { displayCase, parseHoursTable } from './relay';
import type { RelayWidget } from './relay-widget';
import { parseRelayPoint, type CartState, type RelayPoint, type ShippingMethodId } from './store';
import { computeTotals } from './totals';

/** Last relay search and point, so a return to checkout starts where it stopped. */
const RELAY_MEMORY_KEY = 'rep.relay.search';

interface RelayMemory {
  postcode?: string;
  country?: string;
  point?: RelayPoint;
}

function readMemory(): RelayMemory {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RELAY_MEMORY_KEY) ?? '{}') as RelayMemory;
    return {
      postcode: typeof raw.postcode === 'string' ? raw.postcode.slice(0, 10) : undefined,
      country: typeof raw.country === 'string' ? raw.country.slice(0, 2) : undefined,
      point: parseRelayPoint(raw.point),
    };
  } catch {
    return {};
  }
}

function writeMemory(memory: RelayMemory): void {
  try {
    window.localStorage.setItem(RELAY_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Storage unavailable: the search simply is not remembered.
  }
}

const POSTCODE_RE = /^[0-9A-Za-z -]{3,10}$/;

export function initCheckout(ctx: CartContext): void {
  const root = document.querySelector<HTMLElement>('[data-checkout]');
  const t = ctx.t;
  if (!root || !t.checkout || !t.errors) return;
  const tc = t.checkout;
  const te = t.errors;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);

  const content = q<HTMLElement>('[data-checkout-content]');
  const empty = q<HTMLElement>('[data-checkout-empty]');
  const lines = q<HTMLUListElement>('[data-co-lines]')!;
  const methods = q<HTMLFieldSetElement>('[data-co-methods]')!;
  const deliveryError = q<HTMLElement>('[data-co-delivery-error]')!;
  const subtotalEl = q<HTMLElement>('[data-co-subtotal]')!;
  const shippingEl = q<HTMLElement>('[data-co-shipping]')!;
  const totalEl = q<HTMLElement>('[data-co-total]')!;
  const free = q<HTMLElement>('[data-free-shipping]');
  const terms = q<HTMLInputElement>('[data-co-terms]')!;
  const termsError = q<HTMLElement>('[data-co-terms-error]')!;
  const errorBox = q<HTMLElement>('[data-co-error]')!;
  const pay = q<HTMLButtonElement>('[data-co-pay]')!;
  const payLabel = q<HTMLElement>('[data-co-pay-label]')!;

  const relayRoot = q<HTMLElement>('[data-relay]');
  const relay = relayRoot && {
    chosen: relayRoot.querySelector<HTMLElement>('[data-relay-chosen]')!,
    name: relayRoot.querySelector<HTMLElement>('[data-relay-name]')!,
    address: relayRoot.querySelector<HTMLElement>('[data-relay-address]')!,
    hours: relayRoot.querySelector<HTMLDetailsElement>('[data-relay-hours]')!,
    hoursTable: relayRoot.querySelector<HTMLTableElement>('[data-relay-hours-table]')!,
    change: relayRoot.querySelector<HTMLButtonElement>('[data-relay-change]')!,
    search: relayRoot.querySelector<HTMLElement>('[data-relay-search]')!,
    postcode: relayRoot.querySelector<HTMLInputElement>('[data-relay-postcode]')!,
    country: relayRoot.querySelector<HTMLInputElement | HTMLSelectElement>('[data-relay-country]')!,
    go: relayRoot.querySelector<HTMLButtonElement>('[data-relay-go]')!,
    status: relayRoot.querySelector<HTMLElement>('[data-relay-status]')!,
    frame: relayRoot.querySelector<HTMLElement>('[data-relay-frame]')!,
    fallback: relayRoot.querySelector<HTMLElement>('.relay-fallback'),
    brand: relayRoot.dataset.brand || 'BDTEST',
    countries: (relayRoot.dataset.countries ?? 'FR').split(',').filter(Boolean),
  };

  const enabled = new Set(ctx.catalog.shipping.map((s) => s.id));
  const initial = ctx.store.getCart().delivery;
  let selected: ShippingMethodId | null =
    initial && enabled.has(initial.method) ? initial.method : null;
  const memory = readMemory();
  let lastRelay: RelayPoint | null =
    initial?.method === 'relay' ? initial.relay : (memory.point ?? null);
  let searching = false;
  let flagged = new Set<string>();
  let inFlight = false;
  let closed = !ctx.shopOpen;
  let widget: Promise<RelayWidget> | null = null;

  if (relay) {
    relay.postcode.value = memory.postcode ?? '';
    if (memory.country && relay.countries.includes(memory.country))
      relay.country.value = memory.country;
  }

  // ------------------------------------------------------------- rendering

  const renderRelayCard = (point: RelayPoint | null) => {
    if (!relay) return;
    const show = selected === 'relay' && point !== null && !searching;
    relay.chosen.hidden = !show;
    relay.search.hidden = selected !== 'relay' || show;
    if (!point) return;
    relay.name.textContent = displayCase(point.name);
    relay.address.replaceChildren(
      displayCase(point.address1),
      ...(point.address2 ? [h('br'), displayCase(point.address2)] : []),
      h('br'),
      `${point.postcode} ${displayCase(point.city)}`,
    );
    const rows = point.hoursHtml ? parseHoursTable(point.hoursHtml) : [];
    relay.hours.hidden = rows.length === 0;
    relay.hoursTable.replaceChildren(
      h(
        'tbody',
        null,
        ...rows.map(([day = '', ...slots]) =>
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, day),
            h('td', null, slots.filter((s) => s && s !== '-').join(' · ') || '-'),
          ),
        ),
      ),
    );
  };

  const render = (cart: CartState) => {
    const totals = computeTotals(cart, ctx.catalog);
    const hasLines = cart.lines.length > 0;
    if (content) content.hidden = !hasLines;
    if (empty) empty.hidden = hasLines;
    renderLines(lines, cart.lines, ctx, { variant: 'summary', flagged });

    subtotalEl.textContent = ctx.price(totals.subtotal);
    const shippingValue =
      totals.shipping === null
        ? null
        : totals.shipping === 0
          ? tc.free
          : ctx.price(totals.shipping);
    shippingEl.textContent = shippingValue ?? '–';
    shippingEl.classList.toggle('price', shippingValue !== null);
    shippingEl.classList.toggle('is-free', totals.shipping === 0);
    totalEl.textContent = ctx.price(totals.total);
    renderFreeShipping(free, totals, ctx);

    for (const priceEl of root.querySelectorAll<HTMLElement>('[data-method-price]')) {
      const amount = Number(priceEl.dataset.amount);
      const isFree = amount === 0 || totals.freeShipping;
      priceEl.textContent = isFree ? tc.free : ctx.price(amount);
      priceEl.classList.toggle('is-free', isFree);
    }
    for (const note of root.querySelectorAll<HTMLElement>('[data-method-free]'))
      note.hidden = totals.freeShipping;

    for (const input of methods.querySelectorAll<HTMLInputElement>('input[name="delivery-method"]'))
      input.checked = input.value === selected;
    for (const method of methods.querySelectorAll<HTMLElement>('[data-method]'))
      method.classList.toggle('is-selected', method.dataset.method === selected);
    for (const detail of methods.querySelectorAll<HTMLElement>('[data-method-detail]'))
      detail.hidden = detail.dataset.methodDetail !== selected;
    renderRelayCard(cart.delivery?.method === 'relay' ? cart.delivery.relay : lastRelay);

    // Lines the API refused that are gone: the error no longer applies.
    if (flagged.size > 0 && ![...flagged].some((sku) => cart.lines.some((l) => l.sku === sku))) {
      flagged = new Set();
      hideError();
    }
    pay.disabled = closed || inFlight;
    root.removeAttribute('aria-busy');
  };

  // ---------------------------------------------------------------- errors

  const showFieldError = (el: HTMLElement, message: string) => {
    el.textContent = message;
    el.hidden = false;
  };
  const hideError = () => {
    errorBox.hidden = true;
    errorBox.textContent = '';
  };
  const showError = (message: string) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const apiMessage = (error: ApiError): string => {
    if (error.code === 'OUT_OF_STOCK') {
      const names = error.skus.map((sku) => ctx.catalog.products[sku]?.name ?? sku).join(', ');
      return ctx.fmt(te.outOfStock, { names });
    }
    const key = ERROR_KEY[error.code] as keyof typeof te;
    return te[key] || te.generic;
  };

  // ----------------------------------------------------------------- relay

  const saveSearch = () => {
    if (!relay) return;
    writeMemory({
      postcode: relay.postcode.value.trim(),
      country: relay.country.value,
      point: lastRelay ?? undefined,
    });
  };

  const onRelaySelected = (point: RelayPoint) => {
    lastRelay = point;
    searching = false;
    saveSearch();
    if (selected === 'relay') ctx.store.setDelivery({ method: 'relay', relay: point });
    deliveryError.hidden = true;
    ctx.announce(
      `${tc.relayChosen}${ctx.locale === 'fr' ? '\u00a0:' : ':'} ${displayCase(point.name)}`,
    );
    if (relay) {
      relay.name.tabIndex = -1;
      relay.name.focus({ preventScroll: true });
      relay.chosen.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  const ensureWidget = (): Promise<RelayWidget> | null => {
    if (!relay) return null;
    if (widget) return widget;
    relay.status.textContent = tc.relayLoading;
    relay.frame.hidden = false;
    widget = import('./relay-widget')
      .then((m) =>
        m.mountRelayWidget({
          container: '#rep-relay-widget',
          target: '#rep-relay-id',
          brand: relay.brand,
          country: relay.country.value || relay.countries[0] || 'FR',
          allowedCountries: relay.countries,
          postcode: relay.postcode.value.trim(),
          onSelect: onRelaySelected,
        }),
      )
      .then((w) => {
        relay.status.textContent = '';
        return w;
      })
      .catch((error: unknown) => {
        widget = null;
        relay.frame.hidden = true;
        relay.status.textContent = '';
        relay.fallback?.classList.add('is-alert');
        throw error;
      });
    return widget;
  };

  const runSearch = () => {
    if (!relay) return;
    const postcode = relay.postcode.value.trim();
    if (!POSTCODE_RE.test(postcode)) {
      relay.postcode.setAttribute('aria-invalid', 'true');
      relay.postcode.focus();
      return;
    }
    relay.postcode.removeAttribute('aria-invalid');
    saveSearch();
    const mounting = widget === null;
    const pending = ensureWidget();
    // A fresh mount searches with the postcode it was given.
    if (!mounting) void pending?.then((w) => w.search(postcode, relay.country.value));
    else void pending?.catch(() => undefined);
  };

  if (relay) {
    relay.go.addEventListener('click', runSearch);
    relay.postcode.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSearch();
      }
    });
    relay.change.addEventListener('click', () => {
      searching = true;
      renderRelayCard(lastRelay);
      relay.frame.hidden = widget === null;
      void widget?.then((w) => w.refresh());
      relay.postcode.focus();
    });
  }

  // --------------------------------------------------------------- methods

  methods.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'delivery-method') return;
    const method = input.value as ShippingMethodId;
    if (!enabled.has(method)) return;
    selected = method;
    deliveryError.hidden = true;
    if (method === 'relay') {
      ctx.store.setDelivery(lastRelay ? { method: 'relay', relay: lastRelay } : undefined);
      // Without a point yet, open the picker straight away when a postcode is known.
      if (!lastRelay && relay?.postcode.value.trim()) runSearch();
    } else {
      ctx.store.setDelivery({ method });
    }
  });

  // ------------------------------------------------------------------- pay

  terms.addEventListener('change', () => {
    if (terms.checked) termsError.hidden = true;
  });

  const setBusy = (busy: boolean) => {
    inFlight = busy;
    pay.disabled = busy || closed;
    pay.setAttribute('aria-busy', String(busy));
    payLabel.textContent = busy ? tc.processing : tc.pay;
  };

  pay.addEventListener('click', async () => {
    if (inFlight || closed) return;
    hideError();
    const cart = ctx.store.getCart();
    const totals = computeTotals(cart, ctx.catalog);
    if (totals.unknownSkus.length > 0 || totals.outOfStockSkus.length > 0) {
      showError(tc.unavailableLines);
      return;
    }
    if (!selected) {
      showFieldError(deliveryError, tc.chooseMethod);
      methods.querySelector<HTMLInputElement>('input[name="delivery-method"]')?.focus();
      return;
    }
    if (selected === 'relay' && cart.delivery?.method !== 'relay') {
      showFieldError(deliveryError, tc.chooseRelay);
      if (relay && !relay.search.hidden) relay.postcode.focus();
      return;
    }
    if (!terms.checked) {
      showFieldError(termsError, tc.acceptRequired);
      terms.focus();
      return;
    }
    const body = buildCheckoutRequest(cart, ctx.locale);
    if (!body) {
      showFieldError(deliveryError, tc.chooseMethod);
      return;
    }
    setBusy(true);
    const result = await postCheckout(body);
    if (result.ok) {
      const url = safeRedirect(result.url, window.location.origin);
      if (url) {
        window.location.assign(url);
        return;
      }
      setBusy(false);
      showError(te.generic);
      return;
    }
    setBusy(false);
    const { error } = result;
    if (error.code === 'OUT_OF_STOCK' || error.code === 'UNKNOWN_SKU') {
      flagged = new Set(error.skus.length > 0 ? error.skus : totals.unknownSkus);
      render(ctx.store.getCart());
    }
    if (error.code === 'SHOP_CLOSED') {
      closed = true;
      pay.disabled = true;
    }
    showError(apiMessage(error));
    errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // Back from Stripe with the browser's back button: the page comes from the
  // back/forward cache with the button still busy.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) setBusy(false);
  });

  bindLineEvents(lines, ctx, () => {
    const heading = root.querySelector<HTMLElement>('#co-summary-title');
    if (heading) heading.tabIndex = -1;
    return heading;
  });
  render(ctx.store.getCart());
  ctx.store.subscribe(render);
  if (selected === 'relay' && !lastRelay && relay?.postcode.value.trim()) runSearch();
}
