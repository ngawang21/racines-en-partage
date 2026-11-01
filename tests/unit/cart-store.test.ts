import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY,
  createCartStore,
  emptyCart,
  itemCount,
  parseCart,
  parseDelivery,
  type CartState,
  type RelayPoint,
  type StorageLike,
} from '../../src/cart/store';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const NOW = new Date('2026-11-01T12:00:00.000Z');
const clock = () => NOW;
const relay: RelayPoint = {
  id: 'FR-016741',
  name: 'Tabac du Marché',
  address1: '2 Rue de la Gare',
  postcode: '95400',
  city: 'Arnouville',
  country: 'FR',
};

const make = (storage = new MemoryStorage(), maxQuantity = 10) => ({
  storage,
  store: createCartStore({ storage, maxQuantity, now: clock }),
});

describe('parseCart (version and shape guard)', () => {
  it('returns an empty cart for null, corrupt JSON, other versions and wrong shapes', () => {
    for (const raw of [
      null,
      '',
      '{',
      'null',
      '[]',
      '"cart"',
      JSON.stringify({ version: 2, lines: [{ sku: 'A', quantity: 1 }] }),
      JSON.stringify({ version: 0, lines: [] }),
      JSON.stringify({ lines: [{ sku: 'A', quantity: 1 }] }),
      JSON.stringify({ version: 1, lines: 'nope' }),
    ]) {
      expect(parseCart(raw, 10, NOW), String(raw)).toEqual(emptyCart(NOW));
    }
  });

  it('keeps well-formed lines, drops bad ones, clamps and merges duplicates', () => {
    const raw = JSON.stringify({
      version: 1,
      updatedAt: '2026-10-31T10:00:00.000Z',
      lines: [
        { sku: 'REP-MOR-100', quantity: 2 },
        { sku: 'REP-MOR-100', quantity: 3 },
        { sku: 'REP-BAO-100', quantity: 99 },
        { sku: 'REP-HIB-100', quantity: 0 },
        { sku: 'REP-CAC-100', quantity: -4 },
        { sku: '<script>', quantity: 1 },
        { sku: 42, quantity: 1 },
        { sku: 'REP-PSY-200', quantity: 2.7 },
        { sku: 'REP-SOU-100', quantity: 'x' },
        null,
      ],
    });
    const cart = parseCart(raw, 10, NOW);
    expect(cart.lines).toEqual([
      { sku: 'REP-MOR-100', quantity: 5 },
      { sku: 'REP-BAO-100', quantity: 10 },
      { sku: 'REP-PSY-200', quantity: 2 },
    ]);
    expect(cart.updatedAt).toBe('2026-10-31T10:00:00.000Z');
  });

  it('keeps a valid delivery and drops a malformed one', () => {
    const base = { version: 1, lines: [], updatedAt: NOW.toISOString() };
    expect(
      parseCart(JSON.stringify({ ...base, delivery: { method: 'pickup' } }), 10).delivery,
    ).toEqual({ method: 'pickup' });
    expect(
      parseCart(JSON.stringify({ ...base, delivery: { method: 'relay', relay } }), 10).delivery,
    ).toEqual({ method: 'relay', relay });
    expect(
      parseCart(JSON.stringify({ ...base, delivery: { method: 'relay' } }), 10).delivery,
    ).toBeUndefined();
    expect(
      parseCart(JSON.stringify({ ...base, delivery: { method: 'drone' } }), 10).delivery,
    ).toBeUndefined();
  });

  it('rejects a relay point without the normalised id or a required field', () => {
    expect(parseDelivery({ method: 'relay', relay: { ...relay, id: '016741' } })).toBeUndefined();
    expect(parseDelivery({ method: 'relay', relay: { ...relay, city: '' } })).toBeUndefined();
    expect(parseDelivery({ method: 'relay', relay: { ...relay, country: 'FRA' } })).toBeUndefined();
    expect(
      parseDelivery({ method: 'relay', relay: { ...relay, address2: 'Bat. B', hoursHtml: 'x' } }),
    ).toEqual({ method: 'relay', relay: { ...relay, address2: 'Bat. B', hoursHtml: 'x' } });
  });
});

describe('createCartStore', () => {
  it('starts empty and reads an existing cart from storage', () => {
    expect(make().store.getCart()).toEqual(emptyCart(NOW));
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, lines: [{ sku: 'REP-MOR-100', quantity: 2 }], updatedAt: '' }),
    );
    expect(make(storage).store.getCart().lines).toEqual([{ sku: 'REP-MOR-100', quantity: 2 }]);
  });

  it('addLine creates a line, adds to an existing one and clamps to the maximum', () => {
    const { store } = make();
    store.addLine('REP-MOR-100');
    store.addLine('REP-BAO-100', 3);
    store.addLine('REP-MOR-100', 2);
    expect(store.getCart().lines).toEqual([
      { sku: 'REP-MOR-100', quantity: 3 },
      { sku: 'REP-BAO-100', quantity: 3 },
    ]);
    store.addLine('REP-MOR-100', 50);
    expect(store.getCart().lines[0]).toEqual({ sku: 'REP-MOR-100', quantity: 10 });
    expect(store.maxQuantity).toBe(10);
  });

  it('addLine ignores zero, negative, NaN quantities and invalid SKUs', () => {
    const { store } = make();
    const before = store.getCart();
    store.addLine('REP-MOR-100', 0);
    store.addLine('REP-MOR-100', -2);
    store.addLine('REP-MOR-100', Number.NaN);
    store.addLine('', 1);
    store.addLine('bad sku', 1);
    expect(store.getCart()).toBe(before);
  });

  it('setQuantity clamps to 1..max and removes the line at 0', () => {
    const { store } = make(new MemoryStorage(), 5);
    store.addLine('REP-MOR-100', 2);
    store.setQuantity('REP-MOR-100', 9);
    expect(store.getCart().lines).toEqual([{ sku: 'REP-MOR-100', quantity: 5 }]);
    store.setQuantity('REP-MOR-100', 3.9);
    expect(store.getCart().lines).toEqual([{ sku: 'REP-MOR-100', quantity: 3 }]);
    store.setQuantity('REP-MOR-100', 0);
    expect(store.getCart().lines).toEqual([]);
  });

  it('setQuantity on an unknown line does nothing', () => {
    const { store } = make();
    const before = store.getCart();
    store.setQuantity('REP-MOR-100', 2);
    expect(store.getCart()).toBe(before);
  });

  it('removeLine, setDelivery and clear', () => {
    const { store } = make();
    store.addLine('REP-MOR-100');
    store.addLine('REP-BAO-100');
    store.removeLine('REP-MOR-100');
    expect(store.getCart().lines).toEqual([{ sku: 'REP-BAO-100', quantity: 1 }]);
    store.setDelivery({ method: 'relay', relay });
    expect(store.getCart().delivery).toEqual({ method: 'relay', relay });
    store.addLine('REP-HIB-100');
    expect(store.getCart().delivery).toEqual({ method: 'relay', relay });
    store.setDelivery(undefined);
    expect('delivery' in store.getCart()).toBe(false);
    store.setDelivery({ method: 'home' });
    store.clear();
    expect(store.getCart()).toEqual(emptyCart(NOW));
  });

  it('persists every change under rep.cart.v1 with version 1 and updatedAt', () => {
    const { store, storage } = make();
    store.addLine('REP-MOR-100', 2);
    store.setDelivery({ method: 'pickup' });
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!) as CartState;
    expect(saved).toEqual({
      version: 1,
      lines: [{ sku: 'REP-MOR-100', quantity: 2 }],
      delivery: { method: 'pickup' },
      updatedAt: NOW.toISOString(),
    });
  });

  it('keeps working when storage throws (private mode, quota)', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const store = createCartStore({ storage, now: clock });
    store.addLine('REP-MOR-100');
    expect(itemCount(store.getCart())).toBe(1);
  });

  it('works without storage at all', () => {
    const store = createCartStore();
    store.addLine('REP-MOR-100', 4);
    expect(itemCount(store.getCart())).toBe(4);
  });

  it('notifies subscribers on change only, and unsubscribes', () => {
    const { store } = make();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.addLine('REP-MOR-100');
    store.setQuantity('REP-MOR-100', 1); // unchanged
    store.removeLine('REP-XXX-000'); // unknown
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].lines).toEqual([{ sku: 'REP-MOR-100', quantity: 1 }]);
    off();
    store.addLine('REP-MOR-100');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('syncs from another tab through the storage event key', () => {
    const storage = new MemoryStorage();
    const a = make(storage).store;
    const b = make(storage).store;
    const listener = vi.fn();
    b.subscribe(listener);
    a.addLine('REP-MOR-100', 2);
    expect(b.syncFromStorage('other.key')).toBe(false);
    expect(b.syncFromStorage(STORAGE_KEY)).toBe(true);
    expect(b.getCart().lines).toEqual([{ sku: 'REP-MOR-100', quantity: 2 }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(b.syncFromStorage(STORAGE_KEY)).toBe(false);
    storage.map.clear();
    expect(b.syncFromStorage(null)).toBe(true);
    expect(b.getCart().lines).toEqual([]);
  });
});

describe('itemCount', () => {
  it('sums the quantities', () => {
    expect(
      itemCount({
        ...emptyCart(NOW),
        lines: [
          { sku: 'A', quantity: 2 },
          { sku: 'B', quantity: 3 },
        ],
      }),
    ).toBe(5);
  });
});
