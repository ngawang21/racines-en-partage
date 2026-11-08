import { describe, expect, it } from 'vitest';
import { addOutcome } from '../../src/cart/add-outcome';

describe('addOutcome', () => {
  it('a full add is "added"', () => {
    expect(addOutcome(0, 1, 1)).toBe('added');
    expect(addOutcome(2, 7, 5)).toBe('added');
  });

  it('an add cut short by the per-line maximum is "capped" (C4: 7 in the cart, 5 more, 10)', () => {
    expect(addOutcome(7, 10, 5)).toBe('capped');
    expect(addOutcome(0, 10, 30)).toBe('capped');
  });

  it('nothing added (already at the maximum) is "none"', () => {
    expect(addOutcome(10, 10, 1)).toBe('none');
    expect(addOutcome(10, 10, 5)).toBe('none');
  });
});
