// Undo after removing a cart line (review 17). Pure: no DOM, the timer is
// injected. "Retirer" or a typed 0 removes the line from the store at once
// (the totals follow), and the drawer and the cart page show "Poudre de
// baobab 100 g retiré. Annuler" in its place for about six seconds, or until
// the next change of the cart, whichever comes first. "Annuler" puts the line
// back with its quantity at the same position.
import type { CartLine, CartStore } from './store';

export const UNDO_MS = 6000;

export interface RemovedLine {
  /** Distinguishes two removals of the same product, one after the other. */
  id: number;
  sku: string;
  quantity: number;
  /** Position of the line in the cart when it was removed. */
  index: number;
}

/** The line about to be removed and its position, or null when it is not in the cart. */
export function removalOf(lines: readonly CartLine[], sku: string, id = 0): RemovedLine | null {
  const index = lines.findIndex((l) => l.sku === sku);
  const line = lines[index];
  return line ? { id, sku, quantity: line.quantity, index } : null;
}

/**
 * The lines with `removed` back at its position (at the end when the cart has
 * fewer lines now). A product already back in the cart keeps its line.
 */
export function restoreLines(lines: readonly CartLine[], removed: RemovedLine): CartLine[] {
  if (lines.some((l) => l.sku === removed.sku)) return [...lines];
  const at = Math.min(Math.max(0, removed.index), lines.length);
  return [
    ...lines.slice(0, at),
    { sku: removed.sku, quantity: removed.quantity },
    ...lines.slice(at),
  ];
}

/** Where the undo row sits among `count` rendered lines. */
export const undoRowIndex = (removed: RemovedLine, count: number): number =>
  Math.min(Math.max(0, removed.index), count);

export interface UndoOptions {
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Asked when the time is up: false keeps the row one more period (it has the focus). */
  canExpire?: () => boolean;
}

export interface UndoController {
  /** The removal that can still be undone, or null. */
  readonly pending: RemovedLine | null;
  /** Removes the line from the store and offers its undo. Returns the removal. */
  remove(sku: string): RemovedLine | null;
  /** Puts the pending line back. Returns it, or null when nothing can be undone. */
  undo(): RemovedLine | null;
  /** Called when the offer ends on its own (time up), not on a cart change. */
  onExpire(listener: (removed: RemovedLine) => void): () => void;
}

/**
 * Subscribe this before any view of the cart: a change of the cart that is
 * not the removal itself ends the offer before the views render it.
 */
export function createUndo(store: CartStore, options: UndoOptions = {}): UndoController {
  const timeoutMs = options.timeoutMs ?? UNDO_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const listeners = new Set<(removed: RemovedLine) => void>();
  let pending: RemovedLine | null = null;
  let timer: unknown = null;
  let own = false;
  let nextId = 1;

  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const arm = () => {
    stop();
    timer = setTimer(() => {
      timer = null;
      if (!pending) return;
      if (options.canExpire && !options.canExpire()) {
        arm();
        return;
      }
      const ended = pending;
      pending = null;
      for (const listener of [...listeners]) listener(ended);
    }, timeoutMs);
  };

  store.subscribe(() => {
    if (own || !pending) return;
    pending = null;
    stop();
  });

  const ownCommit = (fn: () => void) => {
    own = true;
    try {
      fn();
    } finally {
      own = false;
    }
  };

  return {
    get pending() {
      return pending;
    },
    remove(sku) {
      const removed = removalOf(store.getCart().lines, sku, nextId++);
      if (!removed) return null;
      stop();
      pending = removed;
      ownCommit(() => store.removeLine(sku));
      arm();
      return removed;
    },
    undo() {
      const removed = pending;
      if (!removed) return null;
      stop();
      pending = null;
      ownCommit(() => store.restoreLine(removed.sku, removed.quantity, removed.index));
      return removed;
    },
    onExpire(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
