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
import { computeTotals, quoteShipping } from './totals';

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

/**
 * The method checked when the page opens: the one the cart remembers when it
 * is still offered, else Point Relais (review 11: the summary then shows a
 * delivery price and a complete total from the start; the other methods stay
 * one tap away). Pure, exported for the unit tests.
 */
export function initialMethod(
  stored: ShippingMethodId | null | undefined,
  enabled: ReadonlySet<ShippingMethodId>,
): ShippingMethodId | null {
  if (stored && enabled.has(stored)) return stored;
  return enabled.has('relay') ? 'relay' : null;
}

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
  const termsBox = terms.closest<HTMLElement>('.terms') ?? terms;
  // Phones: total and "Payer" under the thumb while the pay button is below.
  const bar = q<HTMLElement>('[data-co-bar]');
  const barTotal = q<HTMLElement>('[data-co-bar-total]');
  const barPay = q<HTMLButtonElement>('[data-co-bar-pay]');
  // "Payer" failed for a reason the customer cannot fix: the way out, with the phone.
  const payFailed = ctx.fmt(tc.payFailed || te.generic, { phone: root.dataset.phone ?? '' });

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
    postcodeError: relayRoot.querySelector<HTMLElement>('[data-relay-postcode-error]')!,
    country: relayRoot.querySelector<HTMLInputElement | HTMLSelectElement>('[data-relay-country]')!,
    go: relayRoot.querySelector<HTMLButtonElement>('[data-relay-go]')!,
    status: relayRoot.querySelector<HTMLElement>('[data-relay-status]')!,
    frame: relayRoot.querySelector<HTMLElement>('[data-relay-frame]')!,
    fallback: relayRoot.querySelector<HTMLElement>('[data-relay-fallback]'),
    brand: relayRoot.dataset.brand || 'BDTEST',
    countries: (relayRoot.dataset.countries ?? 'FR').split(',').filter(Boolean),
  };

  const enabled = new Set(ctx.catalog.shipping.map((s) => s.id));
  const initial = ctx.store.getCart().delivery;
  let selected = initialMethod(initial?.method, enabled);
  const preselected = selected !== null && selected !== initial?.method;
  const memory = readMemory();
  let lastRelay: RelayPoint | null =
    initial?.method === 'relay' ? initial.relay : (memory.point ?? null);
  let searching = false;
  let flagged = new Set<string>();
  let inFlight = false;
  let closed = !ctx.shopOpen;
  let widget: Promise<RelayWidget> | null = null;
  // The pay button names the amount once the total is known ("Payer 13,90 €").
  let lastTotal = '';
  let hasLines = false;
  let payBelow = false;
  const payText = () =>
    lastTotal && tc.payAmount ? tc.payAmount.replace('{total}', lastTotal) : tc.pay;

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
    hasLines = cart.lines.length > 0;
    if (content) content.hidden = !hasLines;
    if (empty) empty.hidden = hasLines;
    renderLines(lines, cart.lines, ctx, { variant: 'summary', flagged });

    subtotalEl.textContent = ctx.price(totals.subtotal);
    // Relay checked without a point yet: the cart holds no delivery, but the
    // method's price is known, so the summary shows it and a complete total.
    const shipping =
      totals.shipping ??
      (selected && !totals.shippingUnavailable
        ? quoteShipping(selected, totals.subtotal, ctx.catalog)
        : null);
    const shippingValue = shipping === null ? null : shipping === 0 ? tc.free : ctx.price(shipping);
    shippingEl.textContent = shippingValue ?? '–';
    shippingEl.classList.toggle('price', shippingValue !== null);
    shippingEl.classList.toggle('is-free', shipping === 0);
    const total = ctx.price(totals.subtotal + (shipping ?? 0));
    totalEl.textContent = total;
    if (barTotal) barTotal.textContent = total;
    lastTotal = total;
    if (!inFlight) payLabel.textContent = payText();
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
    if (barPay) barPay.disabled = closed || inFlight;
    updateBar();
    root.removeAttribute('aria-busy');
  };

  /** The bar shows while the pay button is still below the screen, as on the cart page. */
  const updateBar = () => bar?.classList.toggle('is-visible', hasLines && payBelow && !closed);
  if (bar && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const viewportBottom = entry.rootBounds?.bottom ?? window.innerHeight;
        payBelow = !entry.isIntersecting && entry.boundingClientRect.top >= viewportBottom;
      }
      updateBar();
    }).observe(pay);
  }

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
  /**
   * The customer acted on the delivery or the terms: an API error about the
   * previous choice no longer applies. Flagged lines and a closed shop keep
   * theirs (the lines and the disabled button still need the explanation).
   */
  const clearStaleError = () => {
    if (flagged.size === 0 && !closed) hideError();
  };

  const apiMessage = (error: ApiError): string => {
    if (error.code === 'OUT_OF_STOCK') {
      const names = error.skus.map((sku) => ctx.catalog.products[sku]?.name ?? sku).join(', ');
      return ctx.fmt(te.outOfStock, { names });
    }
    const key = ERROR_KEY[error.code] as keyof typeof te;
    // An error the customer cannot act on: the phone number, and the basket is kept.
    if (key === 'generic' || key === 'payment' || !te[key]) return payFailed;
    return te[key];
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
    setPostcodeError('');
    if (relay) relay.status.textContent = '';
    if (selected === 'relay') ctx.store.setDelivery({ method: 'relay', relay: point });
    deliveryError.hidden = true;
    clearStaleError();
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
          closedNote: (until) =>
            until ? ctx.fmt(tc.relayClosedUntil, { date: until }) : tc.relayClosed,
          onClosedPick: (note) => {
            relay.status.textContent = note;
          },
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
        // Only now: "La carte ne s'affiche pas ? Écrivez-nous ou appelez-nous".
        if (relay.fallback) {
          relay.fallback.hidden = false;
          relay.fallback.classList.add('is-alert');
        }
        throw error;
      });
    return widget;
  };

  // The error paragraph stays in the DOM (a polite live region) and is only
  // emptied, so screen readers announce each new message.
  const setPostcodeError = (message: string) => {
    if (!relay) return;
    relay.postcodeError.textContent = message;
    if (message) relay.postcode.setAttribute('aria-invalid', 'true');
    else relay.postcode.removeAttribute('aria-invalid');
  };

  const runSearch = () => {
    if (!relay) return;
    const postcode = relay.postcode.value.trim();
    if (!POSTCODE_RE.test(postcode)) {
      setPostcodeError(postcode === '' ? tc.postcodeRequired : tc.postcodeInvalid);
      relay.postcode.focus();
      return;
    }
    setPostcodeError('');
    if (widget !== null) relay.status.textContent = '';
    saveSearch();
    const mounting = widget === null;
    const pending = ensureWidget();
    // A fresh mount searches with the postcode it was given.
    if (!mounting) void pending?.then((w) => w.search(postcode, relay.country.value));
    else void pending?.catch(() => undefined);
  };

  if (relay) {
    relay.go.addEventListener('click', runSearch);
    relay.postcode.addEventListener('input', () => {
      if (relay.postcodeError.textContent) setPostcodeError('');
    });
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
    if (method !== 'relay') setPostcodeError('');
    clearStaleError();
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
    clearStaleError();
  });

  const setBusy = (busy: boolean) => {
    inFlight = busy;
    pay.disabled = busy || closed;
    pay.setAttribute('aria-busy', String(busy));
    payLabel.textContent = busy ? tc.processing : payText();
    if (barPay) {
      barPay.disabled = busy || closed;
      barPay.setAttribute('aria-busy', String(busy));
    }
  };
  const smoothScroll = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  /**
   * The pay button and the phone bar's "Payer" run the same steps: a missing
   * delivery choice or unticked terms takes the customer to the field with its
   * message; once everything is in order, the bar pays straight away.
   */
  const startPayment = async () => {
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
      // Under the postcode field the focus goes to (review 13), not below the cards.
      if (relay && !relay.search.hidden) {
        setPostcodeError(tc.chooseRelay);
        relay.postcode.focus();
      } else showFieldError(deliveryError, tc.chooseRelay);
      return;
    }
    // A point remembered from an earlier visit, in a country the relay method
    // no longer serves: ask for a new one rather than send a refused request.
    const relayMethod = ctx.catalog.shipping.find((s) => s.id === 'relay');
    if (
      cart.delivery?.method === 'relay' &&
      relayMethod &&
      !relayMethod.countries.includes(cart.delivery.relay.country)
    ) {
      lastRelay = null;
      ctx.store.setDelivery(undefined);
      setPostcodeError(tc.chooseRelay);
      relay?.postcode.focus();
      return;
    }
    if (!terms.checked) {
      showFieldError(termsError, tc.acceptRequired);
      // Centred, so the phone bar never covers the box.
      terms.focus({ preventScroll: true });
      termsBox.scrollIntoView({ block: 'center', behavior: smoothScroll() });
      return;
    }
    const body = buildCheckoutRequest(cart, ctx.locale, ctx.catalog.products);
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
      showError(payFailed);
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
      if (barPay) barPay.disabled = true;
      updateBar();
    }
    showError(apiMessage(error));
    errorBox.scrollIntoView({ block: 'center', behavior: smoothScroll() });
  };
  pay.addEventListener('click', () => void startPayment());
  barPay?.addEventListener('click', () => void startPayment());

  // Back from Stripe with the browser's back button: the page comes from the
  // back/forward cache with the button still busy.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) setBusy(false);
  });

  // Relay preselected with no point yet but a postcode remembered from an
  // earlier visit: search with it, but only once the delivery block is on
  // screen or takes the focus, so opening the page never loads the Mondial
  // Relay widget (jQuery, Leaflet, the remote scripts) for nothing.
  const deferRelaySearch = () => {
    if (!relay || !relayRoot) return;
    let done = false;
    let observer: IntersectionObserver | null = null;
    const go = () => {
      if (done) return;
      done = true;
      observer?.disconnect();
      methods.removeEventListener('focusin', go);
      const postcode = relay.postcode.value.trim();
      if (selected === 'relay' && !lastRelay && widget === null && POSTCODE_RE.test(postcode))
        runSearch();
    };
    methods.addEventListener('focusin', go);
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) go();
      });
      observer.observe(relayRoot);
    }
  };

  bindLineEvents(lines, ctx, () => {
    const heading = root.querySelector<HTMLElement>('#co-summary-title');
    if (heading) heading.tabIndex = -1;
    return heading;
  });
  // A point remembered from an earlier visit counts as chosen, as when the
  // customer ticks Point Relais themselves.
  if (preselected && selected === 'relay' && lastRelay)
    ctx.store.setDelivery({ method: 'relay', relay: lastRelay });
  render(ctx.store.getCart());
  ctx.store.subscribe(render);
  if (selected === 'relay' && !lastRelay && relay?.postcode.value.trim()) deferRelaySearch();
}
