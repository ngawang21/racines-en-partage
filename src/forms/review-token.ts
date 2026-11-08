// The review invitation token (spec iteration 3, 2.1):
// `base64url(JSON payload).base64url(signature)`, payload
// `{ s: sessionId, k: [sku...], l: locale, e: expiryUnixSeconds }`. The page
// decodes the payload for display only; the Worker verifies the signature.

export interface ReviewTokenPayload {
  s: string;
  k: string[];
  l: 'fr' | 'en';
  e: number;
}

function base64UrlToText(part: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) return null;
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The payload of a well-formed token, or null (never trusted beyond display). */
export function decodeReviewToken(token: string | null): ReviewTokenPayload | null {
  if (!token || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[1]) return null;
  const text = base64UrlToText(parts[0]!);
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const p = data as Partial<ReviewTokenPayload>;
  if (typeof p.s !== 'string' || typeof p.e !== 'number' || !Number.isFinite(p.e)) return null;
  if (!Array.isArray(p.k)) return null;
  const skus = p.k.filter((sku): sku is string => typeof sku === 'string');
  return { s: p.s, k: [...new Set(skus)], l: p.l === 'en' ? 'en' : 'fr', e: p.e };
}

export const isExpired = (payload: ReviewTokenPayload, now = Date.now()): boolean =>
  payload.e * 1000 <= now;
