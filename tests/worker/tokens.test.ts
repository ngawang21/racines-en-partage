import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  expiresIn,
  peekToken,
  signToken,
  timingSafeEqual,
  verifyToken,
} from '../../worker/tokens';

const SECRET = 'test-secret';
const NOW = new Date('2026-11-08T09:00:00Z');
const payload = { s: 'cs_test_abc', k: ['REP-MOR-100'], l: 'fr', e: expiresIn(NOW, 3600) };

describe('signed tokens', () => {
  it('round trip: the payload comes back while the token is valid', async () => {
    const token = await signToken(payload, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyToken(token, SECRET, NOW)).toEqual(payload);
  });

  it('the payload part is base64url JSON, readable without the secret', async () => {
    const token = await signToken({ m: 'awa@example.com', l: 'en', e: 1 }, SECRET);
    const [body] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(body!)!))).toEqual({
      m: 'awa@example.com',
      l: 'en',
      e: 1,
    });
    expect(peekToken(token)).toEqual({ m: 'awa@example.com', l: 'en', e: 1 });
  });

  it('carries non-ASCII text', async () => {
    const token = await signToken({ n: 'Gaëlle « Été »', e: expiresIn(NOW, 60) }, SECRET);
    expect(await verifyToken<{ n: string }>(token, SECRET, NOW)).toMatchObject({
      n: 'Gaëlle « Été »',
    });
  });

  it('refuses another secret', async () => {
    const token = await signToken(payload, SECRET);
    expect(await verifyToken(token, 'other-secret', NOW)).toBeNull();
    expect(await verifyToken(token, '', NOW)).toBeNull();
  });

  it('refuses a tampered payload, even with a valid-looking signature', async () => {
    const token = await signToken(payload, SECRET);
    const [, signature] = token.split('.');
    const forged = base64UrlEncode(
      new TextEncoder().encode(JSON.stringify({ ...payload, k: ['REP-BAO-100'] })),
    );
    expect(await verifyToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('refuses a tampered signature', async () => {
    const token = await signToken(payload, SECRET);
    const last = token.at(-1) === 'A' ? 'B' : 'A';
    expect(await verifyToken(token.slice(0, -1) + last, SECRET, NOW)).toBeNull();
  });

  it('refuses an expired token, and expiry is exclusive', async () => {
    const token = await signToken({ ...payload, e: expiresIn(NOW, 0) }, SECRET);
    expect(await verifyToken(token, SECRET, NOW)).toBeNull();
    const later = await signToken(payload, SECRET);
    expect(await verifyToken(later, SECRET, new Date(NOW.getTime() + 3601_000))).toBeNull();
  });

  it('refuses a payload without a numeric expiry', async () => {
    for (const p of [{ s: 'x' }, { s: 'x', e: '9999999999' }]) {
      expect(await verifyToken(await signToken(p, SECRET), SECRET, NOW)).toBeNull();
    }
  });

  it.each([
    ['not a string', 42],
    ['empty', ''],
    ['no dot', 'abc'],
    ['three parts', 'a.b.c'],
    ['bad alphabet', 'ab+c.de/f'],
    ['padding', 'YQ==.YQ=='],
    ['too long', `${'a'.repeat(5000)}.b`],
  ])('null for a malformed token (%s)', async (_label, token) => {
    expect(await verifyToken(token, SECRET, NOW)).toBeNull();
  });

  it('a signed array or non-JSON payload is refused', async () => {
    const body = base64UrlEncode(new TextEncoder().encode('[1,2]'));
    const sig = (await signToken({ e: 1 }, SECRET)).split('.')[1];
    expect(await verifyToken(`${body}.${sig}`, SECRET, NOW)).toBeNull();
    expect(peekToken(`${body}.x`)).toBeNull();
    expect(peekToken('%%%.x')).toBeNull();
  });

  it('signToken needs a secret', async () => {
    await expect(signToken(payload, '')).rejects.toThrow();
  });

  it('timingSafeEqual compares lengths and every byte', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });

  it('base64url round trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });
});
