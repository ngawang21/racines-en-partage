// What an add to the cart did, for the live announcement: the store clamps
// every line at the per-line maximum, so a request can be cut short.

/** `added`: all of it; `capped`: part of it (maximum reached); `none`: nothing (already at the maximum). */
export type AddOutcome = 'added' | 'capped' | 'none';

export function addOutcome(before: number, after: number, requested: number): AddOutcome {
  const gained = after - before;
  if (gained <= 0) return 'none';
  return gained < requested ? 'capped' : 'added';
}
