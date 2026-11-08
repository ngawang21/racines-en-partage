import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailerError, NullMailer } from '../../worker/email/resend';
import { signToken, verifyToken } from '../../worker/tokens';
import {
  ENV,
  NOW,
  SESSION_ID,
  catalogFixture,
  fakeBudget,
  fakeCaptcha,
  fakeLimiter,
  makeApp,
  postJson,
  sessionFixture,
  sessionPage,
  type ErrorJson,
} from './fixtures';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const SECRET = ENV.FORMS_SECRET!;
const nowSeconds = NOW.getTime() / 1000;
const EMAIL = 'awa.diallo@example.com';
const errorCode = async (res: Response) => ((await res.json()) as ErrorJson).error.code;

const sessionToken = (overrides: Record<string, unknown> = {}) =>
  signToken({ t: 'session', m: EMAIL, e: nowSeconds + 3600, ...overrides }, SECRET);
const withCookie = async (token?: string) => ({
  Origin: 'https://racinesenpartage.fr',
  Cookie: `theme=x; rep_session=${token ?? (await sessionToken())}`,
});

function getOrders(app: ReturnType<typeof makeApp>['app'], headers: Record<string, string>) {
  return app.request('/api/account/orders', { headers });
}

describe('POST /api/account/login', () => {
  const body = { email: '  Awa.Diallo@Example.com ', locale: 'fr', website: '' };

  it('202 and a 15-minute sign-in link to /mon-compte/?t=, address as typed (trimmed)', async () => {
    const { app, mail } = makeApp();
    const res = await postJson(app, '/api/account/login', body);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    const [m] = mail.sent;
    expect(m!.to).toBe('Awa.Diallo@Example.com');
    expect(m!.subject).toBe('Votre lien de connexion');
    expect(m!.template).toBe('account_login');
    expect(m!.idempotencyKey).toMatch(/^login:/);
    const url = m!.text.match(/https:\/\/\S+/)![0];
    expect(url).toMatch(/^https:\/\/racinesenpartage\.fr\/mon-compte\/\?t=[\w.-]+$/);
    expect(await verifyToken(new URL(url).searchParams.get('t'), SECRET, NOW)).toEqual({
      t: 'login',
      m: 'Awa.Diallo@Example.com',
      l: 'fr',
      e: nowSeconds + 15 * 60,
    });
  });

  it('English: /en/account/ and the English e-mail', async () => {
    const { app, mail } = makeApp();
    await postJson(app, '/api/account/login', { ...body, locale: 'en' });
    expect(mail.sent[0]!.subject).toBe('Your sign-in link');
    expect(mail.sent[0]!.text).toContain('https://racinesenpartage.fr/en/account/?t=');
  });

  it('no enumeration: a refused address still answers 202; a transient failure is 502', async () => {
    const { app, mail } = makeApp();
    mail.send.mockRejectedValueOnce(new MailerError('invalid', 422));
    expect((await postJson(app, '/api/account/login', body)).status).toBe(202);
    mail.send.mockRejectedValueOnce(new MailerError('down', 503));
    const res = await postJson(app, '/api/account/login', body);
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('MAIL_FAILED');
  });

  it('honeypot: 202, nothing sent; captcha failure: 400; production without Turnstile: 404', async () => {
    let { app, mail } = makeApp();
    expect((await postJson(app, '/api/account/login', { ...body, website: 'x' })).status).toBe(202);
    expect(mail.sent).toHaveLength(0);
    ({ app } = makeApp({ captcha: fakeCaptcha(false).captcha }));
    expect(await errorCode(await postJson(app, '/api/account/login', body))).toBe('CAPTCHA_FAILED');
    ({ app } = makeApp({ captcha: null }));
    expect(await errorCode(await postJson(app, '/api/account/login', body))).toBe(
      'FEATURE_DISABLED',
    );
  });

  it('counts in the daily budget and is rate limited by the forms limiter', async () => {
    const budget = fakeBudget(0);
    let { app } = makeApp({ budget: budget.budget });
    expect((await postJson(app, '/api/account/login', body)).status).toBe(429);
    expect(budget.take).toHaveBeenCalledOnce();
    ({ app } = makeApp({ limiters: { forms: fakeLimiter(0).limiter } }));
    expect((await postJson(app, '/api/account/login', body)).status).toBe(429);
  });

  it('404 FEATURE_DISABLED without FORMS_SECRET or without RESEND_API_KEY; 400 for a bad e-mail', async () => {
    let { app } = makeApp({ env: { ...ENV, FORMS_SECRET: '' } });
    expect(await errorCode(await postJson(app, '/api/account/login', body))).toBe(
      'FEATURE_DISABLED',
    );
    ({ app } = makeApp({ mailer: new NullMailer() }));
    expect(await errorCode(await postJson(app, '/api/account/login', body))).toBe(
      'FEATURE_DISABLED',
    );
    ({ app } = makeApp());
    expect(
      await errorCode(await postJson(app, '/api/account/login', { ...body, email: 'nope' })),
    ).toBe('VALIDATION_ERROR');
  });

  it('logs only masked addresses', async () => {
    const { app } = makeApp();
    await postJson(app, '/api/account/login', body);
    const lines = [
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ].map((c) => String(c[0]));
    expect(lines.join('\n').toLowerCase()).not.toContain('awa.diallo');
    expect(lines.some((l) => l.includes('A***@***.com'))).toBe(true);
  });
});

describe('POST /api/account/session', () => {
  const login = (overrides: Record<string, unknown> = {}) =>
    signToken({ t: 'login', m: EMAIL, l: 'fr', e: nowSeconds + 60, ...overrides }, SECRET);

  it('200 with the masked e-mail and a 30-day session cookie', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/account/session', { token: await login() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: 'a***@***.com' });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(
      /^rep_session=[\w-]+\.[\w-]+; Max-Age=2592000; Path=\/api\/account; HttpOnly; Secure; SameSite=Lax$/,
    );
    const value = cookie.split(';')[0]!.split('=')[1]!;
    expect(await verifyToken(value, SECRET, NOW)).toEqual({
      t: 'session',
      m: EMAIL,
      e: nowSeconds + 30 * 86_400,
    });
  });

  it('no Secure flag on a local http:// SITE_URL', async () => {
    const { app } = makeApp({ env: { ...ENV, SITE_URL: 'http://localhost:8787' } });
    const res = await postJson(
      app,
      '/api/account/session',
      { token: await login() },
      { Origin: 'http://localhost:8787' },
    );
    expect(res.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('400 INVALID_TOKEN for expired, foreign or tampered tokens, no cookie', async () => {
    const { app } = makeApp();
    for (const token of [
      await login({ e: nowSeconds }),
      await login({ t: 'session' }),
      await signToken({ t: 'newsletter', m: EMAIL, l: 'fr', e: nowSeconds + 60 }, SECRET),
      await signToken({ t: 'login', m: EMAIL, l: 'fr', e: nowSeconds + 60 }, 'other'),
      await login({ m: 'not-an-email' }),
      'garbage',
    ]) {
      const res = await postJson(app, '/api/account/session', { token });
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('INVALID_TOKEN');
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('403 from another origin', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/account/session',
      { token: await login() },
      { Origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/account/orders', () => {
  const listed = (id: string, created: number, overrides: Record<string, unknown> = {}) =>
    sessionFixture({ id, created, line_items: undefined, ...overrides });

  it('lists the completed orders of the cookie address, newest first, with review state', async () => {
    const { app, stripe } = makeApp();
    const meta = sessionFixture().metadata!;
    stripe.list.mockResolvedValueOnce(
      sessionPage([
        listed('cs_test_old00000000AAAA1111', 1_700_000_000, {
          metadata: { ...meta, 'reviewed_REP-MOR-100': 'true', 'reviewed_REP-BAO-100': 'true' },
        }),
        listed(SESSION_ID, 1_760_000_000),
        listed('cs_test_open0000000BBBB2222', 1_765_000_000, { status: 'open' }),
        listed('cs_test_foreign0000CCCC3333', 1_765_000_000, { metadata: {} }),
      ]),
    );
    const res = await getOrders(app, await withCookie());
    expect(res.status).toBe(200);
    expect(stripe.list).toHaveBeenCalledWith({
      customer_details: { email: EMAIL },
      limit: 100,
    });
    const json = (await res.json()) as {
      email: string;
      orders: Array<Record<string, unknown>>;
    };
    expect(json.email).toBe('a***@***.com');
    expect(json.orders.map((o) => o.id)).toEqual([SESSION_ID, 'cs_test_old00000000AAAA1111']);
    const [latest, old] = json.orders;
    expect(latest).toMatchObject({
      id: SESSION_ID,
      number: 'E5F6G7H8',
      status: 'paid',
      createdAt: new Date(1_760_000_000 * 1000).toISOString(),
      reviewable: true,
      email: 'a***@***.com',
      amounts: { total: 3060 },
      delivery: { method: 'relay' },
      lines: [
        { name: 'Poudre de moringa 100 g', quantity: 2, unitAmount: 890, sku: 'REP-MOR-100' },
        { name: 'Poudre de baobab 100 g', quantity: 1, unitAmount: 790, sku: 'REP-BAO-100' },
      ],
    });
    expect(latest).not.toHaveProperty('linesOmitted');
    expect(old!.reviewable).toBe(false);
  });

  describe('capitalisation: both spellings are listed and merged', () => {
    const STORED = 'Marie.Dupont@Gmail.com';
    const LOWER = 'marie.dupont@gmail.com';
    /** A fake Stripe filter that compares the address exactly, as stored. */
    function stripeByAddress(stripe: ReturnType<typeof makeApp>['stripe'], stored: string[]) {
      const sessions = stored.map((address, i) =>
        listed(`cs_test_case${i}000000000000AAAA`, 1_760_000_000 + i, {
          customer_details: { ...sessionFixture().customer_details, email: address },
        }),
      );
      stripe.list.mockImplementation(async (params) =>
        sessionPage(
          sessions.filter((s) => s.customer_details!.email === params!.customer_details!.email),
        ),
      );
    }
    const ids = async (app: ReturnType<typeof makeApp>['app'], email: string) => {
      const res = await getOrders(app, await withCookie(await sessionToken({ m: email })));
      return ((await res.json()) as { orders: Array<{ id: string }> }).orders.map((o) => o.id);
    };

    it('an order stored as "Marie.Dupont@Gmail.com" is found from a login typed the same way', async () => {
      const { app, stripe } = makeApp();
      stripeByAddress(stripe, [STORED, LOWER]);
      // Both spellings are queried and merged, newest first, without duplicates.
      expect(await ids(app, STORED)).toEqual([
        'cs_test_case1000000000000AAAA',
        'cs_test_case0000000000000AAAA',
      ]);
      expect(stripe.list.mock.calls.map((c) => c[0]!.customer_details!.email)).toEqual([
        STORED,
        LOWER,
      ]);
    });

    it('an order stored lower-cased is found from a capitalised login', async () => {
      const { app, stripe } = makeApp();
      stripeByAddress(stripe, [LOWER]);
      expect(await ids(app, STORED)).toEqual(['cs_test_case0000000000000AAAA']);
    });

    it('a lower-cased login queries once (one spelling)', async () => {
      const { app, stripe } = makeApp();
      stripeByAddress(stripe, [LOWER, STORED]);
      expect(await ids(app, LOWER)).toEqual(['cs_test_case0000000000000AAAA']);
      expect(stripe.list).toHaveBeenCalledOnce();
    });

    it('review-token matches the stored capitals from a lower-cased session', async () => {
      const { app, stripe } = makeApp();
      stripe.retrieve.mockResolvedValueOnce(
        sessionFixture({
          customer_details: { ...sessionFixture().customer_details, email: STORED },
        }),
      );
      const res = await postJson(
        app,
        '/api/account/review-token',
        { sessionId: SESSION_ID },
        await withCookie(await sessionToken({ m: LOWER })),
      );
      expect(res.status).toBe(200);
    });
  });

  it('paginates up to 300 sessions; lines for the 20 most recent only', async () => {
    const { app, stripe } = makeApp();
    const page = (p: number) =>
      Array.from({ length: 100 }, (_, i) =>
        listed(`cs_test_p${p}n${String(i).padStart(3, '0')}XXXXXX`, 1_760_000_000 - p * 100 - i),
      );
    stripe.list
      .mockResolvedValueOnce(sessionPage(page(0), true))
      .mockResolvedValueOnce(sessionPage(page(1), true))
      .mockResolvedValueOnce(sessionPage(page(2), true));
    const res = await getOrders(app, await withCookie());
    const json = (await res.json()) as { orders: Array<Record<string, unknown>> };
    expect(stripe.list).toHaveBeenCalledTimes(3);
    expect(stripe.list.mock.calls[1]![0]).toMatchObject({
      starting_after: 'cs_test_p0n099XXXXXX',
    });
    expect(json.orders).toHaveLength(300);
    expect(stripe.listLineItems).toHaveBeenCalledTimes(20);
    expect(json.orders[19]).not.toHaveProperty('linesOmitted');
    expect(json.orders[20]).toMatchObject({ lines: [], linesOmitted: true });
    // Without lines, the review state comes from metadata.skus.
    expect(json.orders[20]!.reviewable).toBe(true);
  });

  it('nothing reviewable when the owner turned reviews off', async () => {
    const { app, stripe } = makeApp(
      {},
      catalogFixture({ features: { newsletter: true, reviews: false, newsletterWelcomeCode: '' } }),
    );
    stripe.list.mockResolvedValueOnce(sessionPage([listed(SESSION_ID, 1_760_000_000)]));
    const json = (await (await getOrders(app, await withCookie())).json()) as {
      orders: Array<{ reviewable: boolean }>;
    };
    expect(json.orders[0]!.reviewable).toBe(false);
  });

  it('unpaid orders are listed but not reviewable; an empty list is fine', async () => {
    const { app, stripe } = makeApp();
    stripe.list.mockResolvedValueOnce(
      sessionPage([listed(SESSION_ID, 1, { payment_status: 'unpaid' })]),
    );
    let json = (await (await getOrders(app, await withCookie())).json()) as {
      orders: Array<{ reviewable: boolean; status: string }>;
    };
    expect(json.orders[0]).toMatchObject({ status: 'pending', reviewable: false });
    json = (await (await getOrders(app, await withCookie())).json()) as typeof json;
    expect(json.orders).toEqual([]);
  });

  it('401 UNAUTHENTICATED without, with an expired, a foreign or a tampered cookie', async () => {
    const { app, stripe } = makeApp();
    const cases = [
      { Origin: 'https://racinesenpartage.fr' },
      await withCookie(await sessionToken({ e: nowSeconds })),
      await withCookie(await sessionToken({ t: 'login' })),
      await withCookie(
        await signToken({ t: 'session', m: EMAIL, e: nowSeconds + 60 }, 'other-secret'),
      ),
      await withCookie('garbage'),
    ];
    for (const headers of cases) {
      const res = await getOrders(app, headers);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('UNAUTHENTICATED');
    }
    expect(stripe.list).not.toHaveBeenCalled();
  });

  it('502 when Stripe fails; ORDERS_LIMITER applies', async () => {
    let { app, stripe } = makeApp();
    stripe.list.mockRejectedValueOnce(new Error('down'));
    expect((await getOrders(app, await withCookie())).status).toBe(502);
    ({ app, stripe } = makeApp({ limiters: { orders: fakeLimiter(0).limiter } }));
    expect((await getOrders(app, await withCookie())).status).toBe(429);
  });
});

describe('POST /api/account/review-token', () => {
  const post = async (app: ReturnType<typeof makeApp>['app'], sessionId = SESSION_ID) =>
    postJson(app, '/api/account/review-token', { sessionId }, await withCookie());

  it('answers the invitation review token for the SKUs not yet reviewed', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({
        line_items: undefined,
        metadata: { ...sessionFixture().metadata, 'reviewed_REP-MOR-100': 'true' },
      }),
    );
    const res = await post(app);
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(await verifyToken(token, SECRET, NOW)).toEqual({
      t: 'review',
      s: SESSION_ID,
      k: ['REP-BAO-100'],
      l: 'fr',
      e: nowSeconds + 60 * 86_400,
    });
  });

  it('the address matches case-insensitively', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({
        customer_details: { ...sessionFixture().customer_details, email: 'Awa.Diallo@Example.COM' },
      }),
    );
    expect((await post(app)).status).toBe(200);
  });

  it('404 ORDER_NOT_FOUND for another address, an unknown, unpaid or foreign session', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve
      .mockResolvedValueOnce(
        sessionFixture({
          customer_details: { ...sessionFixture().customer_details, email: 'x@example.com' },
        }),
      )
      .mockRejectedValueOnce(Object.assign(new Error('No such'), { statusCode: 404 }))
      .mockResolvedValueOnce(sessionFixture({ payment_status: 'unpaid' }))
      .mockResolvedValueOnce(sessionFixture({ metadata: {} }));
    for (let i = 0; i < 4; i++) {
      const res = await post(app);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('ORDER_NOT_FOUND');
    }
  });

  it('409 ALREADY_REVIEWED when every product is reviewed', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({
        metadata: {
          ...sessionFixture().metadata,
          'reviewed_REP-MOR-100': 'true',
          'reviewed_REP-BAO-100': 'true',
        },
      }),
    );
    const res = await post(app);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('ALREADY_REVIEWED');
  });

  it('404 FEATURE_DISABLED when reviews are off; 401 without cookie; 400 for a bad id', async () => {
    let { app } = makeApp(
      {},
      catalogFixture({ features: { newsletter: true, reviews: false, newsletterWelcomeCode: '' } }),
    );
    expect(await errorCode(await post(app))).toBe('FEATURE_DISABLED');
    ({ app } = makeApp());
    expect(
      await errorCode(await postJson(app, '/api/account/review-token', { sessionId: SESSION_ID })),
    ).toBe('UNAUTHENTICATED');
    expect(await errorCode(await post(app, 'pi_123'))).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/account/logout', () => {
  it('clears the cookie', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/account/logout', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toBe(
      'rep_session=; Max-Age=0; Path=/api/account; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('403 from another origin; 405 for GET', async () => {
    const { app } = makeApp();
    expect(
      (await postJson(app, '/api/account/logout', {}, { Origin: 'https://evil.example' })).status,
    ).toBe(403);
    const res = await app.request('/api/account/logout');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});
