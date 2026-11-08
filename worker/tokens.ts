// Signed tokens of the review invitation and the newsletter confirmation:
// `base64url(JSON payload).base64url(HMAC-SHA256(that first part, secret))`.
// The payload carries `e`, its expiry in Unix seconds. WebCrypto only, so the
// same code runs in workerd and in Node (tests).

/** Above any token this shop issues (30 SKUs fit in well under 1 KB). */
export const MAX_TOKEN_LENGTH = 4096;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const encoder = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strict decoding: null on any character outside the base64url alphabet. */
export function base64UrlDecode(text: string): Uint8Array | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function sign(data: string, secret: string): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return new Uint8Array(signature);
}

/** Compares every byte whatever the first difference, so timing reveals nothing. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Signs `payload` (which must carry `e`, the expiry in Unix seconds). */
export async function signToken(payload: object, secret: string): Promise<string> {
  if (!secret) throw new Error('signToken needs a secret');
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return `${body}.${base64UrlEncode(await sign(body, secret))}`;
}

/**
 * The payload without checking the signature. Only for choices that grant
 * nothing (the language of a redirect); everything else goes through verifyToken.
 */
export function peekToken(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const bytes = base64UrlDecode(parts[0]!);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The payload when the signature matches and `e` is still in the future; null otherwise. */
export async function verifyToken<T>(token: unknown, secret: string, now: Date): Promise<T | null> {
  if (!secret || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  const given = base64UrlDecode(signature);
  if (!given || !base64UrlDecode(body)) return null;
  if (!timingSafeEqual(given, await sign(body, secret))) return null;
  const payload = peekToken(token);
  if (!payload) return null;
  const expiry = payload.e;
  if (typeof expiry !== 'number' || !Number.isFinite(expiry)) return null;
  if (expiry * 1000 <= now.getTime()) return null;
  return payload as T;
}

/** Unix seconds `seconds` after `now`. */
export function expiresIn(now: Date, seconds: number): number {
  return Math.floor(now.getTime() / 1000) + seconds;
}
