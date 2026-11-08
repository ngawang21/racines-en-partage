// The customer space session cookie: parsing the Cookie header and writing
// Set-Cookie values. Small on purpose; only `rep_session` is ever read.

export const SESSION_COOKIE = 'rep_session';
/** 30 days. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** The browser sends the cookie to the account endpoints only. */
export const SESSION_COOKIE_PATH = '/api/account';

/** Cookie names and values this shop writes: a token, so base64url and dots. */
const COOKIE_NAME = /^[A-Za-z0-9_-]+$/;
const COOKIE_VALUE = /^[A-Za-z0-9._-]*$/;

/** The value of `name` in a Cookie header; the first one wins, null when absent. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

export interface CookieOptions {
  maxAge: number;
  path: string;
  /** False only for a local http:// development server. */
  secure: boolean;
}

/** `name=value; Max-Age=...; Path=...; HttpOnly; [Secure; ]SameSite=Lax`. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!COOKIE_NAME.test(name)) throw new Error(`Unsafe cookie name: ${name}`);
  if (!COOKIE_VALUE.test(value)) throw new Error('Unsafe cookie value');
  if (!Number.isInteger(options.maxAge) || options.maxAge < 0) {
    throw new Error('Cookie Max-Age must be a non-negative integer');
  }
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    'HttpOnly',
    ...(options.secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ');
}

/** `wrangler dev` on http://localhost (or 127.0.0.1) cannot keep a Secure cookie. */
export function isLocalSite(siteUrl: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(siteUrl);
}

export function sessionCookie(token: string, siteUrl: string): string {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: SESSION_COOKIE_PATH,
    secure: !isLocalSite(siteUrl),
  });
}

export function clearedSessionCookie(siteUrl: string): string {
  return serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    path: SESSION_COOKIE_PATH,
    secure: !isLocalSite(siteUrl),
  });
}
