// Cloudflare Turnstile server-side check (siteverify) for the contact,
// stock-alert and newsletter forms. Without a secret the check is skipped:
// local development, and the weeks before the owner creates the widget.
import { describeError, logError } from './log';
import type { Captcha } from './types';

export const TURNSTILE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TIMEOUT_MS = 10_000;
/** Turnstile tokens are at most 2048 characters. */
export const MAX_TURNSTILE_TOKEN = 2048;

export function createTurnstile(
  secret: string | undefined,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = TURNSTILE_TIMEOUT_MS,
): Captcha {
  return {
    async verify(token, remoteIp) {
      if (!secret) return true;
      if (!token || token.length > MAX_TURNSTILE_TOKEN) return false;
      const form = new URLSearchParams({ secret, response: token });
      if (remoteIp) form.set('remoteip', remoteIp);
      try {
        const res = await fetchImpl(TURNSTILE_ENDPOINT, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          logError('turnstile.failed', { status: res.status });
          return false;
        }
        const body: unknown = await res.json();
        return Boolean(
          body && typeof body === 'object' && 'success' in body && body.success === true,
        );
      } catch (err) {
        // An outage fails closed: the form answers CAPTCHA_FAILED and the customer retries.
        logError('turnstile.failed', { error: describeError(err) });
        return false;
      }
    },
  };
}
