// Undo after removing a cart line (review 17): the pure part of
// src/cart/undo.ts and the store's restoreLine.
import { describe, expect, it } from 'vitest';
import { createCartStore, type CartLine } from '../../src/cart/store';
import { UNDO_MS, createUndo, removalOf, restoreLines, undoRowIndex } from '../../src/cart/undo';

const LINES: CartLine[] = [
  { sku: 'REP-BAO-100', quantity: 2 },
  { sku: 'REP-MOR-100', quantity: 1 },
  { sku: 'REP-HIB-100', quantity: 4 },
];

/** A timer the test fires by hand. */
function manualTimer() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number);
    },
    pending: () => [...timers.values()],
    fire() {
      const due = [...timers.entries()];
      timers.clear();
      for (const [, t] of due) t.fn();
    },
  };
}

const storeWith = (lines: CartLine[]) => {
  const store = createCartStore({ maxQuantity: 10 });
  for (const l of lines) store.addLine(l.sku, l.quantity);
  return store;
};

describe('removalOf and restoreLines', () => {
  it('records the line, its quantity and its position', () => {
    expect(removalOf(LINES, 'REP-MOR-100', 7)).toEqual({
      id: 7,
      sku: 'REP-MOR-100',
      quantity: 1,
      index: 1,
    });
    expect(removalOf(LINES, 'REP-XXX-100')).toBeNull();
  });

  it('puts the line back at the same position', () => {
    const removed = removalOf(LINES, 'REP-MOR-100')!;
    const without = LINES.filter((l) => l.sku !== 'REP-MOR-100');
    expect(restoreLines(without, removed)).toEqual(LINES);
  });

  it('puts it at the end when the cart is shorter now, first when it was first', () => {
    const last = removalOf(LINES, 'REP-HIB-100')!;
    expect(restoreLines([LINES[0]!], last).map((l) => l.sku)).toEqual([
      'REP-BAO-100',
      'REP-HIB-100',
    ]);
    const first = removalOf(LINES, 'REP-BAO-100')!;
    expect(restoreLines(LINES.slice(1), first)).toEqual(LINES);
    expect(restoreLines([], first)).toEqual([{ sku: 'REP-BAO-100', quantity: 2 }]);
  });

  it('keeps a line already back in the cart', () => {
    const removed = removalOf(LINES, 'REP-MOR-100')!;
    expect(restoreLines(LINES, removed)).toEqual(LINES);
  });

  it('places the undo row where the line was', () => {
    const removed = removalOf(LINES, 'REP-HIB-100')!;
    expect(undoRowIndex(removed, 2)).toBe(2);
    expect(undoRowIndex(removed, 1)).toBe(1);
    expect(undoRowIndex({ ...removed, index: 0 }, 2)).toBe(0);
  });
});

describe('store.restoreLine', () => {
  it('inserts at the index with the quantity clamped, once', () => {
    const store = storeWith(LINES.filter((l) => l.sku !== 'REP-MOR-100'));
    store.restoreLine('REP-MOR-100', 25, 1);
    expect(store.getCart().lines).toEqual([
      { sku: 'REP-BAO-100', quantity: 2 },
      { sku: 'REP-MOR-100', quantity: 10 },
      { sku: 'REP-HIB-100', quantity: 4 },
    ]);
    const before = store.getCart();
    expect(store.restoreLine('REP-MOR-100', 1, 0)).toBe(before);
    expect(store.restoreLine('not a sku', 1, 0)).toBe(before);
    expect(store.restoreLine('REP-CAC-100', 0, 0)).toBe(before);
  });
});

describe('createUndo', () => {
  it('removes at once, then restores the line at its place', () => {
    const store = storeWith(LINES);
    const timer = manualTimer();
    const undo = createUndo(store, timer);
    const seen: Array<string | null> = [];
    // A view subscribed after the controller sees the offer with the removal.
    store.subscribe(() => seen.push(undo.pending?.sku ?? null));

    expect(undo.remove('REP-MOR-100')).toMatchObject({ sku: 'REP-MOR-100', index: 1 });
    expect(store.getCart().lines.map((l) => l.sku)).toEqual(['REP-BAO-100', 'REP-HIB-100']);
    expect(undo.pending?.sku).toBe('REP-MOR-100');
    expect(timer.pending().map((t) => t.ms)).toEqual([UNDO_MS]);

    expect(undo.undo()?.sku).toBe('REP-MOR-100');
    expect(store.getCart().lines).toEqual(LINES);
    expect(undo.pending).toBeNull();
    expect(timer.pending()).toEqual([]);
    expect(seen).toEqual(['REP-MOR-100', null]);
    expect(undo.undo()).toBeNull();
  });

  it('ends the offer on the next change of the cart', () => {
    const store = storeWith(LINES);
    const timer = manualTimer();
    const undo = createUndo(store, timer);
    undo.remove('REP-BAO-100');
    store.setQuantity('REP-HIB-100', 5);
    expect(undo.pending).toBeNull();
    expect(timer.pending()).toEqual([]);
    expect(undo.undo()).toBeNull();
    expect(store.getCart().lines.map((l) => l.sku)).toEqual(['REP-MOR-100', 'REP-HIB-100']);
  });

  it('a second removal replaces the first offer', () => {
    const store = storeWith(LINES);
    const undo = createUndo(store, manualTimer());
    const first = undo.remove('REP-BAO-100')!;
    const second = undo.remove('REP-HIB-100')!;
    expect(second.id).not.toBe(first.id);
    expect(undo.pending?.sku).toBe('REP-HIB-100');
    undo.undo();
    expect(store.getCart().lines.map((l) => l.sku)).toEqual(['REP-MOR-100', 'REP-HIB-100']);
  });

  it('expires after the delay, unless the row holds the focus', () => {
    const store = storeWith(LINES);
    const timer = manualTimer();
    let focused = true;
    const undo = createUndo(store, { ...timer, canExpire: () => !focused });
    const ended: string[] = [];
    undo.onExpire((r) => ended.push(r.sku));
    undo.remove('REP-MOR-100');

    timer.fire();
    expect(undo.pending?.sku).toBe('REP-MOR-100');
    expect(timer.pending()).toHaveLength(1);

    focused = false;
    timer.fire();
    expect(undo.pending).toBeNull();
    expect(ended).toEqual(['REP-MOR-100']);
    // The cart is untouched by the expiry.
    expect(store.getCart().lines.map((l) => l.sku)).toEqual(['REP-BAO-100', 'REP-HIB-100']);
  });

  it('ignores a product that is not in the cart', () => {
    const store = storeWith(LINES);
    const undo = createUndo(store, manualTimer());
    expect(undo.remove('REP-CAC-100')).toBeNull();
    expect(undo.pending).toBeNull();
  });
});
