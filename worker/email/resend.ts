// Mailers: Resend over its HTTP API, and a null mailer that only logs when
// RESEND_API_KEY is not set (Stripe's receipt and dashboard still cover the owner).
import { logInfo, maskEmail } from '../log';
import type { MailMessage, Mailer } from '../types';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
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
      // Resend answers `{ statusCode, name, message }`; the name is enough to act on.
      let name = 'unknown';
      try {
        const body: unknown = await res.json();
        if (body && typeof body === 'object' && 'name' in body && typeof body.name === 'string') {
          name = body.name.slice(0, 80);
        }
      } catch {
        // Not JSON: keep "unknown".
      }
      throw new MailerError(`Resend refused the e-mail: HTTP ${res.status} ${name}`, res.status);
    }
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
