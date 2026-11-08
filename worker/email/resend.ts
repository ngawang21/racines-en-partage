// Mailers: Resend over its HTTP API, and a null mailer that only logs when
// RESEND_API_KEY is not set (Stripe's receipt and dashboard still cover the owner).
// Also the newsletter audience (Resend contacts).
import { logInfo, maskEmail } from '../log';
import type { Audience, MailMessage, Mailer } from '../types';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const RESEND_API = 'https://api.resend.com';
export const RESEND_TIMEOUT_MS = 10_000;

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MailerError';
  }
}

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = RESEND_TIMEOUT_MS,
  ) {}

  async send(message: MailMessage): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      throw new MailerError(`Resend request failed (${reason})`);
    }
    if (!res.ok) {
      const { name } = await resendError(res);
      throw new MailerError(`Resend refused the e-mail: HTTP ${res.status} ${name}`, res.status);
    }
  }
}

/** Resend answers `{ statusCode, name, message }`; the name is enough to act on. */
async function resendError(res: Response): Promise<{ name: string; message: string }> {
  const out = { name: 'unknown', message: '' };
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object') {
      if ('name' in body && typeof body.name === 'string') out.name = body.name.slice(0, 80);
      if ('message' in body && typeof body.message === 'string') {
        out.message = body.message.slice(0, 200);
      }
    }
  } catch {
    // Not JSON: keep "unknown".
  }
  return out;
}

/** Contacts of one Resend audience: the newsletter list (double opt-in done before). */
export class ResendAudience implements Audience {
  constructor(
    private readonly apiKey: string,
    private readonly audienceId: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = RESEND_TIMEOUT_MS,
  ) {}

  async addContact(email: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${RESEND_API}/audiences/${encodeURIComponent(this.audienceId)}/contacts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, unsubscribed: false }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      throw new MailerError(`Resend request failed (${reason})`);
    }
    if (res.ok) return;
    const { name, message } = await resendError(res);
    // A second click on the confirmation link: the contact is already there.
    if (res.status < 500 && /already exists/i.test(`${name} ${message}`)) return;
    throw new MailerError(`Resend refused the contact: HTTP ${res.status} ${name}`, res.status);
  }
}

export class NullMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    logInfo('mail.skipped', {
      reason: 'RESEND_API_KEY is not set',
      to: maskEmail(message.to),
      subject: message.subject,
      idempotencyKey: message.idempotencyKey.split(':')[0],
    });
  }
}
