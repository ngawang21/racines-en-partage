// Review 11 defaults: the method checked when the checkout opens, and what a
// failed order list means on the customer space.
import { describe, expect, it } from 'vitest';
import { accountFailure, type ApiError } from '../../src/cart/api';
import { initialMethod } from '../../src/cart/page-checkout';
import type { ShippingMethodId } from '../../src/cart/store';

const all = new Set<ShippingMethodId>(['relay', 'home', 'pickup']);

describe('initialMethod (checkout)', () => {
  it('preselects Point Relais when the cart remembers no method', () => {
    expect(initialMethod(undefined, all)).toBe('relay');
    expect(initialMethod(null, all)).toBe('relay');
  });

  it('keeps the method the cart remembers while it is offered', () => {
    expect(initialMethod('pickup', all)).toBe('pickup');
    expect(initialMethod('home', all)).toBe('home');
    expect(initialMethod('home', new Set<ShippingMethodId>(['relay', 'pickup']))).toBe('relay');
  });

  it('preselects nothing when Point Relais is off', () => {
    expect(initialMethod(undefined, new Set<ShippingMethodId>(['home', 'pickup']))).toBeNull();
  });
});

describe('accountFailure (customer space)', () => {
  const error = (code: ApiError['code'], status: number): ApiError => ({ code, status, skus: [] });

  it('treats a 401 as signed out, after a sign-in too', () => {
    expect(accountFailure(error('UNAUTHENTICATED', 401), false)).toBe('signed-out');
    expect(accountFailure(error('UNAUTHENTICATED', 401), true)).toBe('signed-out');
    expect(accountFailure(error('UNKNOWN', 401), false)).toBe('signed-out');
  });

  it('shows the bare form when the API is unreachable on arrival', () => {
    expect(accountFailure(error('NETWORK', 0), false)).toBe('signed-out');
    expect(accountFailure(error('UNKNOWN', 404), false)).toBe('signed-out');
    expect(accountFailure(error('UNKNOWN', 502), false)).toBe('signed-out');
    expect(accountFailure(error('RATE_LIMITED', 429), false)).toBe('signed-out');
  });

  it('reports a real failure once the session is known to be valid', () => {
    expect(accountFailure(error('PAYMENT_PROVIDER_ERROR', 502), false)).toBe('failed');
    expect(accountFailure(error('NETWORK', 0), true)).toBe('failed');
    expect(accountFailure(error('RATE_LIMITED', 429), true)).toBe('failed');
  });
});
