import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCatalog, type WorkerCatalog } from '../../worker/catalog';
import { budgetKey, createKvBudget, dailyLimit } from '../../worker/budget';
import { MailerError, NullMailer } from '../../worker/email/resend';
import { cleanText } from '../../worker/forms';
import { signToken, verifyToken } from '../../worker/tokens';
import {
  ENV,
  NOW,
  catalogFixture,
  fakeAudience,
  fakeBudget,
  fakeCaptcha,
  fakeLimiter,
  makeApp,
  postJson,
  type ErrorJson,
} from './fixtures';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const contact = {
  kind: 'contact',
  locale: 'fr',
  name: 'Awa Diallo',
  email: 'awa.diallo@example.com',
  message: 'Bonjour,\nAvez-vous du moringa en 500 g ?',
  website: '',
};

const stockAlert = {
  kind: 'stock_alert',
  locale: 'en',
  email: 'john@example.com',
  sku: 'REP-ORG-100',
  website: '',
};

const errorCode = async (res: Response) => ((await res.json()) as ErrorJson).error.code;

describe('cleanText', () => {
  it('strips tags and control characters, folds lines in single-line fields', () => {
    expect(cleanText(' <b>Awa</b>\u0000 <script>x</script>\nDiallo\t ')).toBe('Awa x Diallo');
  });

  it('keeps line breaks in multi-line fields, at most one blank line', () => {
    expect(cleanText('a\r\nb\r\n\r\n\r\n\r\nc  \n‮d', true)).toBe('a\nb\n\nc\nd');
  });

  it('drops lone surrogates and BOM', () => {
    expect(cleanText('﻿a\ud800b')).toBe('ab');
  });
});

describe('POST /api/contact', () => {
  it('202 and one e-mail to the owner, reply-to the customer, message escaped', async () => {
    const { app, mail } = makeApp();
    const res = await postJson(app, '/api/contact', {
      ...contact,
      message: 'Bonjour <img src=x onerror=alert(1)> & merci',
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
    const [m] = mail.sent;
    expect(m!.to).toBe(ENV.ORDER_EMAIL_TO);
    expect(m!.replyTo).toBe('awa.diallo@example.com');
    expect(m!.subject).toBe('Message du site de Awa Diallo');
    expect(m!.idempotencyKey).toMatch(/^contact:[0-9a-f-]{36}$/);
    // Tags are stripped before the template escapes what is left.
    expect(m!.text).toContain('Bonjour  & merci');
    expect(m!.html).toContain('Bonjour  &amp; merci');
    expect(m!.html).not.toContain('<img');
  });

  it('stock alert: subject names the product (French) and the address', async () => {
    const { app, mail } = makeApp();
    const res = await postJson(app, '/api/contact', stockAlert);
    expect(res.status).toBe(202);
    const [m] = mail.sent;
    expect(m!.subject).toBe("Alerte de stock : Poudre d'orge grillée 100 g pour john@example.com");
    expect(m!.replyTo).toBe('john@example.com');
    expect(m!.text).toContain('REP-ORG-100');
    expect(m!.text).toContain('anglais');
    expect(m!.idempotencyKey).toMatch(/^stock_alert:/);
  });

  it('stock alert for an unknown SKU: 409 UNKNOWN_SKU, nothing sent', async () => {
    const { app, mail } = makeApp();
    const res = await postJson(app, '/api/contact', { ...stockAlert, sku: 'REP-NOPE' });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('UNKNOWN_SKU');
    expect(mail.sent).toHaveLength(0);
  });

  it('honeypot filled: 202 and nothing sent, before any validation', async () => {
    const { app, mail } = makeApp({ captcha: fakeCaptcha(false).captcha });
    const res = await postJson(app, '/api/contact', { website: 'https://spam.example' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(0);
  });

  it.each([
    ['no name', { ...contact, name: ' <b></b> ' }, 'name'],
    ['no message', { ...contact, message: '' }, 'message'],
    ['bad e-mail', { ...contact, email: 'not-an-email' }, 'email'],
    ['long name', { ...contact, name: 'x'.repeat(81) }, 'name'],
    ['long message', { ...contact, message: 'x'.repeat(3001) }, 'message'],
    ['stock alert without sku', { ...stockAlert, sku: undefined }, 'sku'],
    ['unknown kind', { ...contact, kind: 'spam' }, 'kind'],
    ['bad locale', { ...contact, locale: 'de' }, 'locale'],
  ])('400 VALIDATION_ERROR: %s', async (_label, body, path) => {
    const { app, mail } = makeApp();
    const res = await postJson(app, '/api/contact', body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    const issues = json.error.details!.issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toContain(path);
    expect(mail.sent).toHaveLength(0);
  });

  it('Turnstile: the token and the client IP are checked; a failure is 400 CAPTCHA_FAILED', async () => {
    const { captcha, verify } = fakeCaptcha(false);
    const { app, mail } = makeApp({ captcha });
    const res = await postJson(
      app,
      '/api/contact',
      { ...contact, turnstile: 'tok' },
      { Origin: 'https://racinesenpartage.fr', 'CF-Connecting-IP': '203.0.113.7' },
    );
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('CAPTCHA_FAILED');
    expect(verify).toHaveBeenCalledWith('tok', '203.0.113.7');
    expect(mail.sent).toHaveLength(0);
  });

  it('Turnstile passing lets the message through', async () => {
    const { app, mail } = makeApp({ captcha: fakeCaptcha(true).captcha });
    expect((await postJson(app, '/api/contact', contact)).status).toBe(202);
    expect(mail.sent).toHaveLength(1);
  });

  it('403 FORBIDDEN_ORIGIN from another site, 415 for a form post, 400 for bad JSON', async () => {
    const { app, mail } = makeApp();
    let res = await postJson(app, '/api/contact', contact, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN_ORIGIN');
    res = await app.request('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...{ Origin: ENV.SITE_URL } },
      body: 'kind=contact',
    });
    expect(res.status).toBe(415);
    res = await postJson(app, '/api/contact', '{nope');
    expect(res.status).toBe(400);
    expect(mail.sent).toHaveLength(0);
  });

  it('413 PAYLOAD_TOO_LARGE above 16 KB', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/contact', { ...contact, message: 'x'.repeat(17_000) });
    expect(res.status).toBe(413);
  });

  it('502 MAIL_FAILED when the e-mail cannot be sent', async () => {
    const { app, mail } = makeApp();
    mail.send.mockRejectedValueOnce(new MailerError('down', 503));
    const res = await postJson(app, '/api/contact', contact);
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('MAIL_FAILED');
  });

  it('404 FEATURE_DISABLED without ORDER_EMAIL_TO', async () => {
    const { app } = makeApp({ env: { ...ENV, ORDER_EMAIL_TO: '' } });
    const res = await postJson(app, '/api/contact', contact);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
  });

  it('rate limited by the forms limiter', async () => {
    const forms = fakeLimiter(1);
    const { app } = makeApp({ limiters: { forms: forms.limiter } });
    expect((await postJson(app, '/api/contact', contact)).status).toBe(202);
    const res = await postJson(app, '/api/contact', contact);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });
});

describe('POST /api/newsletter', () => {
  const body = { email: 'awa.diallo@example.com', locale: 'fr', website: '' };

  it('202 and a confirmation e-mail with a signed 48 h link', async () => {
    const { app, mail } = makeApp({ audience: fakeAudience().audience });
    const res = await postJson(app, '/api/newsletter', body);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    const [m] = mail.sent;
    expect(m!.to).toBe('awa.diallo@example.com');
    expect(m!.idempotencyKey).toMatch(/^newsletter:/);
    expect(m!.subject).toBe('Confirmez votre inscription à la newsletter');
    const url = m!.text.match(/https:\/\/\S+/)![0];
    // The static page, not the API: a link scanner opening it subscribes nobody.
    expect(url).toMatch(/^https:\/\/racinesenpartage\.fr\/newsletter\/\?t=[\w.-]+$/);
    expect(m!.template).toBe('newsletter_confirmation');
    const token = new URL(url).searchParams.get('t')!;
    expect(await verifyToken(token, ENV.FORMS_SECRET!, NOW)).toEqual({
      t: 'newsletter',
      m: 'awa.diallo@example.com',
      l: 'fr',
      e: NOW.getTime() / 1000 + 48 * 3600,
    });
    expect(m!.html).toContain(`href="${url}"`);
    expect(m!.text).not.toContain('code de réduction');
  });

  const features = (overrides: Partial<WorkerCatalog['features']>) =>
    catalogFixture({
      features: { newsletter: true, reviews: true, newsletterWelcomeCode: '', ...overrides },
    });

  it('prints the welcome code from the CMS settings (catalogue features)', async () => {
    const { app, mail } = makeApp(
      { audience: fakeAudience().audience },
      features({ newsletterWelcomeCode: 'BIENVENUE10' }),
    );
    await postJson(app, '/api/newsletter', { ...body, locale: 'en' });
    expect(mail.sent[0]!.text).toContain('discount code to enter at checkout: BIENVENUE10');
    expect(mail.sent[0]!.html).toContain('<strong>BIENVENUE10</strong>');
  });

  it('a refused address still answers 202 (no enumeration); a transient failure is 502', async () => {
    const { app, mail } = makeApp({ audience: fakeAudience().audience });
    mail.send.mockRejectedValueOnce(new MailerError('invalid', 422));
    expect((await postJson(app, '/api/newsletter', body)).status).toBe(202);
    mail.send.mockRejectedValueOnce(new MailerError('down', 500));
    const res = await postJson(app, '/api/newsletter', body);
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('MAIL_FAILED');
  });

  it('honeypot: 202, nothing sent', async () => {
    const { app, mail } = makeApp({ audience: fakeAudience().audience });
    expect((await postJson(app, '/api/newsletter', { ...body, website: 'x' })).status).toBe(202);
    expect(mail.sent).toHaveLength(0);
  });

  it('400 CAPTCHA_FAILED and 400 VALIDATION_ERROR', async () => {
    const { app } = makeApp({
      audience: fakeAudience().audience,
      captcha: fakeCaptcha(false).captcha,
    });
    expect(await errorCode(await postJson(app, '/api/newsletter', body))).toBe('CAPTCHA_FAILED');
    expect(
      await errorCode(await postJson(app, '/api/newsletter', { ...body, email: 'nope' })),
    ).toBe('VALIDATION_ERROR');
  });

  it('404 FEATURE_DISABLED when the owner turned the newsletter off, nothing sent', async () => {
    const audience = fakeAudience();
    const { app, mail } = makeApp({ audience: audience.audience }, features({ newsletter: false }));
    const res = await postJson(app, '/api/newsletter', body);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
    expect(mail.sent).toHaveLength(0);
    // Turned off by choice: not logged as a configuration error.
    expect(console.error).not.toHaveBeenCalled();
  });

  it('an older catalogue without features keeps the newsletter on', async () => {
    const { features: _features, ...old } = catalogFixture();
    const { app, mail } = makeApp(
      { audience: fakeAudience().audience },
      parseCatalog(JSON.parse(JSON.stringify(old))),
    );
    expect((await postJson(app, '/api/newsletter', body)).status).toBe(202);
    expect(mail.sent).toHaveLength(1);
  });

  it('404 FEATURE_DISABLED without an audience or without FORMS_SECRET', async () => {
    let { app } = makeApp();
    let res = await postJson(app, '/api/newsletter', body);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
    ({ app } = makeApp({ audience: fakeAudience().audience, env: { ...ENV, FORMS_SECRET: '' } }));
    res = await postJson(app, '/api/newsletter', body);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
  });
});

describe('POST /api/newsletter/confirm', () => {
  const token = (payload: object) => signToken(payload, ENV.FORMS_SECRET!);
  const valid = (l = 'fr') =>
    token({ t: 'newsletter', m: 'awa.diallo@example.com', l, e: NOW.getTime() / 1000 + 60 });
  const confirm = async (
    app: ReturnType<typeof makeApp>['app'],
    t: unknown,
    headers?: Record<string, string>,
  ) => postJson(app, '/api/newsletter/confirm', { token: t }, headers);

  it('200 { ok: true } and the contact added', async () => {
    const audience = fakeAudience();
    const { app, mail } = makeApp({ audience: audience.audience });
    const res = await confirm(app, await valid('en'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(audience.added).toEqual(['awa.diallo@example.com']);
    expect(mail.sent).toHaveLength(0);
  });

  it('does not spend the daily budget (it sends nothing)', async () => {
    const budget = fakeBudget(0);
    const { app } = makeApp({ audience: fakeAudience().audience, budget: budget.budget });
    expect((await confirm(app, await valid())).status).toBe(200);
    expect(budget.take).not.toHaveBeenCalled();
  });

  it('400 INVALID_TOKEN for an expired, tampered, foreign-type or malformed token', async () => {
    const audience = fakeAudience();
    const { app } = makeApp({ audience: audience.audience });
    const exp = NOW.getTime() / 1000;
    const cases = [
      await token({ t: 'newsletter', m: 'a@example.com', l: 'en', e: exp }),
      await signToken({ t: 'newsletter', m: 'a@example.com', l: 'en', e: 9e9 }, 'nope'),
      await token({ t: 'newsletter', m: 'nope', l: 'fr', e: 9e9 }),
      // A review token cannot confirm a subscription, nor can an untyped one.
      await token({ t: 'review', m: 'a@example.com', l: 'fr', e: 9e9 }),
      await token({ m: 'a@example.com', l: 'fr', e: 9e9 }),
      'garbage',
    ];
    for (const t of cases) {
      const res = await confirm(app, t);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('INVALID_TOKEN');
    }
    const res = await postJson(app, '/api/newsletter/confirm', {});
    expect(await errorCode(res)).toBe('VALIDATION_ERROR');
    expect(audience.added).toEqual([]);
  });

  it('502 MAIL_FAILED when Resend is unavailable', async () => {
    const audience = fakeAudience();
    audience.addContact.mockRejectedValueOnce(new MailerError('down', 500));
    const { app } = makeApp({ audience: audience.audience });
    const res = await confirm(app, await valid());
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('MAIL_FAILED');
  });

  it('404 FEATURE_DISABLED when the owner turned the newsletter off, nothing added', async () => {
    const audience = fakeAudience();
    const { app } = makeApp(
      { audience: audience.audience },
      catalogFixture({
        features: { newsletter: false, reviews: true, newsletterWelcomeCode: '' },
      }),
    );
    const res = await confirm(app, await valid());
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
    expect(audience.added).toEqual([]);
  });

  it('404 FEATURE_DISABLED without an audience', async () => {
    const { app } = makeApp();
    const res = await confirm(app, await valid());
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
  });

  it('403 from another origin; 405 for a GET (the old link shape)', async () => {
    const { app } = makeApp({ audience: fakeAudience().audience });
    const res = await confirm(app, await valid(), { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    const get = await app.request(`/api/newsletter/confirm?t=${await valid()}`);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  it('rate limited by the forms limiter', async () => {
    const forms = fakeLimiter(0);
    const { app } = makeApp({
      audience: fakeAudience().audience,
      limiters: { forms: forms.limiter },
    });
    expect((await confirm(app, await valid())).status).toBe(429);
  });
});

describe('production guards of the e-mail forms', () => {
  it('without a Turnstile secret (captcha null): contact and newsletter are 404, logged', async () => {
    const { app, mail } = makeApp({ captcha: null, audience: fakeAudience().audience });
    for (const [path, body] of [
      ['/api/contact', contact],
      ['/api/newsletter', { email: 'a@example.com', locale: 'fr' }],
    ] as const) {
      const res = await postJson(app, path, body);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('FEATURE_DISABLED');
    }
    expect(mail.sent).toHaveLength(0);
    const logged = vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
    expect(logged.filter((l) => l.includes('TURNSTILE_SECRET_KEY'))).toHaveLength(2);
  });

  it('contact without RESEND_API_KEY (null mailer): 404 instead of a dropped message', async () => {
    const { app } = makeApp({ mailer: new NullMailer() });
    const res = await postJson(app, '/api/contact', contact);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
  });

  it('daily budget: one unit per e-mail, then 429 RATE_LIMITED and nothing sent', async () => {
    const budget = fakeBudget(2);
    const { app, mail } = makeApp({ budget: budget.budget, audience: fakeAudience().audience });
    expect((await postJson(app, '/api/contact', contact)).status).toBe(202);
    expect((await postJson(app, '/api/contact', stockAlert)).status).toBe(202);
    const res = await postJson(app, '/api/newsletter', {
      email: 'a@example.com',
      locale: 'fr',
    });
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe('RATE_LIMITED');
    expect(mail.sent).toHaveLength(2);
    expect(budget.take).toHaveBeenCalledTimes(3);
  });

  it('the budget is not spent by a honeypot, an invalid body or a failed captcha', async () => {
    const budget = fakeBudget(10);
    const { app } = makeApp({ budget: budget.budget, captcha: fakeCaptcha(false).captcha });
    await postJson(app, '/api/contact', { website: 'x' });
    await postJson(app, '/api/contact', { ...contact, email: 'nope' });
    await postJson(app, '/api/contact', contact);
    expect(budget.take).not.toHaveBeenCalled();
  });
});

describe('KV budget', () => {
  function memoryStore() {
    const data = new Map<string, string>();
    const put = vi.fn(async (key: string, value: string, _o?: { expirationTtl?: number }) => {
      data.set(key, value);
    });
    return { data, put, store: { get: async (k: string) => data.get(k) ?? null, put } };
  }

  it('counts per UTC day under forms:<day> with a two-day TTL, refuses past the limit', async () => {
    const mem = memoryStore();
    let now = new Date('2026-11-08T23:59:00Z');
    const budget = createKvBudget(mem.store, 2, () => now);
    expect(await budget.take()).toBe(true);
    expect(await budget.take()).toBe(true);
    expect(await budget.take()).toBe(false);
    expect(mem.data.get('forms:2026-11-08')).toBe('2');
    expect(mem.put).toHaveBeenCalledWith('forms:2026-11-08', '1', { expirationTtl: 172_800 });
    now = new Date('2026-11-09T00:01:00Z');
    expect(budgetKey(now)).toBe('forms:2026-11-09');
    expect(await budget.take()).toBe(true);
  });

  it('a KV failure lets the form through (logged)', async () => {
    const budget = createKvBudget(
      { get: async () => Promise.reject(new Error('kv down')), put: async () => {} },
      1,
      () => NOW,
    );
    expect(await budget.take()).toBe(true);
  });

  it('FORMS_DAILY_LIMIT parses to a positive integer, 60 otherwise', () => {
    expect(dailyLimit('25')).toBe(25);
    for (const v of [undefined, '', '0', '-3', '2.5', 'abc']) expect(dailyLimit(v)).toBe(60);
  });
});
