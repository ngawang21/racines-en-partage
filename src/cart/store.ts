// Cart store (spec 6.1). Pure: no DOM, no window. The persistence backend
// (localStorage in the browser, a Map in tests) and the clock are injected;
// the cross-tab `storage` event is forwarded by the client through
// `syncFromStorage`.

export type ShippingMethodId = 'relay' | 'home' | 'pickup';

export interface CartLine {
  sku: string;
  quantity: number;
}

export interface RelayPoint {
  /** "<CC>-<6 digits>", for example "FR-016741". */
  id: string;
  name: string;
  address1: string;
  address2?: string;
  postcode: string;
  city: string;
  country: string;
  /** Opening hours as a sanitised table (only table, tr, th and td with text). */
  hoursHtml?: string;
}

export type Delivery =
  { method: 'relay'; relay: RelayPoint } | { method: 'home' } | { method: 'pickup' };

export interface CartState {
  version: 1;
  lines: CartLine[];
  delivery?: Delivery;
  updatedAt: string;
}

/** localStorage key of the cart. Bump the suffix with `version`. */
export const STORAGE_KEY = 'rep.cart.v1';
export const CART_VERSION = 1;
export const DEFAULT_MAX_QUANTITY = 10;

/** The subset of the Web Storage API the store needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Listener = (cart: CartState) => void;

export interface CartStore {
  getCart(): CartState;
  /** Adds `quantity` to the line (creating it), clamped to the per-line maximum. */
  addLine(sku: string, quantity?: number): CartState;
  /** Sets the line quantity, clamped to 1..max; 0 or less removes the line. */
  setQuantity(sku: string, quantity: number): CartState;
  removeLine(sku: string): CartState;
  setDelivery(delivery: Delivery | undefined): CartState;
  clear(): CartState;
  subscribe(listener: Listener): () => void;
  /**
   * Reload from storage after a `storage` event of another tab. Pass the
   * event's key; other keys are ignored. Returns true when the cart changed.
   */
  syncFromStorage(key: string | null): boolean;
  readonly maxQuantity: number;
}

export interface StoreOptions {
  storage?: StorageLike | null;
  maxQuantity?: number;
  now?: () => Date;
}

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RELAY_ID_RE = /^[A-Z]{2}-\d{6}$/;

export function emptyCart(now: Date = new Date()): CartState {
  return { version: CART_VERSION, lines: [], updatedAt: now.toISOString() };
}

function clampQuantity(quantity: number, max: number): number {
  if (!Number.isFinite(quantity)) return 0;
  return Math.min(max, Math.max(0, Math.trunc(quantity)));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : undefined;

/** A relay point read back from storage, or undefined when it is not well formed. */
export function parseRelayPoint(value: unknown): RelayPoint | undefined {
  if (!isRecord(value)) return undefined;
  const id = str(value.id, 16);
  const name = str(value.name);
  const address1 = str(value.address1);
  const postcode = str(value.postcode, 16);
  const city = str(value.city);
  const country = str(value.country, 2);
  if (!id || !RELAY_ID_RE.test(id) || !name || !address1 || !postcode || !city || !country)
    return undefined;
  const point: RelayPoint = { id, name, address1, postcode, city, country };
  const address2 = str(value.address2);
  if (address2) point.address2 = address2;
  const hoursHtml = str(value.hoursHtml, 8000);
  if (hoursHtml) point.hoursHtml = hoursHtml;
  return point;
}

export function parseDelivery(value: unknown): Delivery | undefined {
  if (!isRecord(value)) return undefined;
  if (value.method === 'home' || value.method === 'pickup') return { method: value.method };
  if (value.method === 'relay') {
    const relay = parseRelayPoint(value.relay);
    return relay ? { method: 'relay', relay } : undefined;
  }
  return undefined;
}

/**
 * Version and shape guard for whatever sits in storage. Anything that is not a
 * version 1 cart (an older or newer format, corrupt JSON, a tampered value)
 * yields an empty cart; well-formed parts of a version 1 cart are kept, with
 * quantities clamped and duplicate lines merged.
 */
export function parseCart(raw: string | null, max: number, now: Date = new Date()): CartState {
  if (!raw) return emptyCart(now);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyCart(now);
  }
  if (!isRecord(data) || data.version !== CART_VERSION || !Array.isArray(data.lines))
    return emptyCart(now);
  const lines: CartLine[] = [];
  for (const line of data.lines) {
    if (!isRecord(line) || typeof line.sku !== 'string' || !SKU_RE.test(line.sku)) continue;
    const quantity = clampQuantity(Number(line.quantity), max);
    if (quantity < 1) continue;
    const existing = lines.find((l) => l.sku === line.sku);
    if (existing) existing.quantity = Math.min(max, existing.quantity + quantity);
    else lines.push({ sku: line.sku, quantity });
  }
  const cart: CartState = {
    version: CART_VERSION,
    lines,
    updatedAt:
      typeof data.updatedAt === 'string' && !Number.isNaN(Date.parse(data.updatedAt))
        ? data.updatedAt
        : now.toISOString(),
  };
  const delivery = parseDelivery(data.delivery);
  if (delivery) cart.delivery = delivery;
  return cart;
}

/** Total number of units in the cart (the header badge). */
export function itemCount(cart: CartState): number {
  return cart.lines.reduce((n, l) => n + l.quantity, 0);
}

export function createCartStore(options: StoreOptions = {}): CartStore {
  const storage = options.storage ?? null;
  const max = Math.max(1, Math.trunc(options.maxQuantity ?? DEFAULT_MAX_QUANTITY));
  const now = options.now ?? (() => new Date());
  const listeners = new Set<Listener>();

  const read = (): string | null => {
    try {
      return storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };

  let raw = read();
  let state = parseCart(raw, max, now());

  const emit = () => {
    for (const listener of [...listeners]) listener(state);
  };

  const commit = (next: Omit<CartState, 'updatedAt' | 'version'>): CartState => {
    state = { version: CART_VERSION, ...next, updatedAt: now().toISOString() };
    if (!state.delivery) delete state.delivery;
    raw = JSON.stringify(state);
    try {
      storage?.setItem(STORAGE_KEY, raw);
    } catch {
      // Private mode or a full quota: the cart still works for this page.
    }
    emit();
    return state;
  };

  const withLines = (lines: CartLine[]) => commit({ lines, delivery: state.delivery });

  return {
    maxQuantity: max,
    getCart: () => state,
    addLine(sku, quantity = 1) {
      if (!SKU_RE.test(sku)) return state;
      const add = clampQuantity(quantity, max);
      if (add < 1) return state;
      const current = state.lines.find((l) => l.sku === sku);
      if (current) {
        const next = Math.min(max, current.quantity + add);
        if (next === current.quantity) return state;
        return withLines(state.lines.map((l) => (l.sku === sku ? { sku, quantity: next } : l)));
      }
      return withLines([...state.lines, { sku, quantity: add }]);
    },
    setQuantity(sku, quantity) {
      const next = clampQuantity(quantity, max);
      if (next < 1) return this.removeLine(sku);
      const current = state.lines.find((l) => l.sku === sku);
      if (!current || current.quantity === next) return state;
      return withLines(state.lines.map((l) => (l.sku === sku ? { sku, quantity: next } : l)));
    },
    removeLine(sku) {
      if (!state.lines.some((l) => l.sku === sku)) return state;
      return withLines(state.lines.filter((l) => l.sku !== sku));
    },
    setDelivery(delivery) {
      return commit({ lines: state.lines, delivery });
    },
    clear() {
      return commit({ lines: [] });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncFromStorage(key) {
      // key null: the other tab called localStorage.clear().
      if (key !== null && key !== STORAGE_KEY) return false;
      const fresh = read();
      if (fresh === raw) return false;
      raw = fresh;
      state = parseCart(fresh, max, now());
      emit();
      return true;
    },
  };
}
