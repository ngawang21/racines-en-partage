import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailerError, RESEND_ENDPOINT, ResendMailer } from '../../worker/email/resend';
import type { MailMessage } from '../../worker/types';

const message: MailMessage = {
  to: 'awa.diallo@example.com',
  subject: 'Merci pour votre commande E5F6G7H8',
  html: '<p>Merci</p>',
  text: 'Merci',
  replyTo: 'racinesenpartage@outlook.com',
  idempotencyKey: 'evt_1:customer',
};

afterEach(() => vi.restoreAllMocks());

describe('ResendMailer', () => {
  it('posts to the Resend API with bearer auth and the idempotency key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ id: 're_1' }));
    const mailer = new ResendMailer(
      're_secret',
      'Racines en Partage <commandes@racinesenpartage.fr>',
      fetchImpl,
    );
    await mailer.send(message);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer re_secret',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'evt_1:customer',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Racines en Partage <commandes@racinesenpartage.fr>',
      to: ['awa.diallo@example.com'],
      subject: 'Merci pour votre commande E5F6G7H8',
      html: '<p>Merci</p>',
      text: 'Merci',
      reply_to: 'racinesenpartage@outlook.com',
    });
  });

  it('surfaces a refusal as MailerError with the status and Resend error name, no key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(
        { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field' },
        { status: 422 },
      ),
    );
    const mailer = new ResendMailer('re_secret', 'from@example.com', fetchImpl);
    const error = await mailer.send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailerError);
    expect((error as MailerError).status).toBe(422);
    expect((error as MailerError).message).toBe(
      'Resend refused the e-mail: HTTP 422 validation_error',
    );
    expect((error as MailerError).message).not.toContain('re_secret');
  });

  it('turns a timeout into a MailerError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const mailer = new ResendMailer('re_secret', 'from@example.com', fetchImpl, 10);
    await expect(mailer.send(message)).rejects.toThrow(/Resend request failed \(TimeoutError\)/);
  });
});
