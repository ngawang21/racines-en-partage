import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie,
  isLocalSite,
  readCookie,
  serializeCookie,
  sessionCookie,
} from '../../worker/cookies';

describe('cookies', () => {
  it('reads one cookie among several, trimmed, first one wins, quotes removed', () => {
    const header = 'theme=dark; rep_session=abc.def ;other=1; rep_session=second';
    expect(readCookie(header, 'rep_session')).toBe('abc.def');
    expect(readCookie('rep_session="q.v"', 'rep_session')).toBe('q.v');
    expect(readCookie('a=1', 'rep_session')).toBeNull();
    expect(readCookie('', 'rep_session')).toBeNull();
    expect(readCookie(undefined, 'rep_session')).toBeNull();
    expect(readCookie('xrep_session=1; broken', 'rep_session')).toBeNull();
  });

  it('writes the session cookie HttpOnly, Secure, SameSite=Lax on /api/account for 30 days', () => {
    expect(sessionCookie('abc.def', 'https://racinesenpartage.fr')).toBe(
      'rep_session=abc.def; Max-Age=2592000; Path=/api/account; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('omits Secure on a local http:// server only', () => {
    expect(sessionCookie('a.b', 'http://localhost:8787')).not.toContain('Secure');
    expect(sessionCookie('a.b', 'http://127.0.0.1:8787/')).not.toContain('Secure');
    expect(isLocalSite('http://localhost.evil.example')).toBe(false);
    expect(isLocalSite('https://localhost')).toBe(false);
  });

  it('clears with an empty value and Max-Age=0', () => {
    expect(clearedSessionCookie('https://racinesenpartage.fr')).toBe(
      'rep_session=; Max-Age=0; Path=/api/account; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('refuses unsafe names, values and ages', () => {
    const o = { maxAge: 1, path: '/', secure: true };
    expect(() => serializeCookie('a b', 'x', o)).toThrow();
    expect(() => serializeCookie('a', 'x;y', o)).toThrow();
    expect(() => serializeCookie('a', 'x\r\nSet-Cookie: z', o)).toThrow();
    expect(() => serializeCookie('a', 'x', { ...o, maxAge: -1 })).toThrow();
  });
});
