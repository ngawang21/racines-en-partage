import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { reviewSchema } from '../../src/content/schemas';
import { MailerError } from '../../worker/email/resend';
import { GitHubError } from '../../worker/github';
import {
  INVITE_WINDOW_DAYS,
  inviteReviews,
  inviteSkipReason,
  parisDay,
  type ReviewToken,
} from '../../worker/reviews';
import { signToken, verifyToken } from '../../worker/tokens';
import {
  ENV,
  NOW,
  SESSION_ID,
  catalogFixture,
  fakeMailer,
  fakeRepo,
  fakeStripe,
  fr,
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

const nowSeconds = NOW.getTime() / 1000;
const reviewToken = (overrides: Partial<ReviewToken> = {}, secret = ENV.FORMS_SECRET!) =>
  signToken(
    {
      t: 'review',
      s: SESSION_ID,
      k: ['REP-MOR-100', 'REP-BAO-100'],
      l: 'fr',
      e: nowSeconds + 3600,
      ...overrides,
    },
    secret,
  );

const review = async (overrides: Record<string, unknown> = {}) => ({
  token: await reviewToken(),
  sku: 'REP-MOR-100',
  rating: 5,
  author: 'Awa',
  title: 'Un vrai goût de feuille',
  text: 'Une poudre très fraîche, parfaite dans mes jus du matin.',
  locale: 'fr',
  ...overrides,
});

const errorCode = async (res: Response) => ((await res.json()) as ErrorJson).error.code;

describe('POST /api/reviews', () => {
  it('201: commits the review file and marks the session', async () => {
    const repo = fakeRepo();
    const { app, stripe } = makeApp({ reviewRepo: repo.repo });
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const path = 'src/content/reviews/poudre-de-moringa-100g--E5F6G7H8.yml';
    expect(repo.createFile).toHaveBeenCalledOnce();
    const file = repo.files.get(path)!;
    expect(file.message).toBe('content: avis client sur poudre-de-moringa-100g');
    expect(reviewSchema.parse(parse(file.content))).toEqual({
      product: 'poudre-de-moringa-100g',
      rating: 5,
      author: 'Awa',
      locale: 'fr',
      date: '2026-11-01',
      order: 'E5F6G7H8',
      verified: true,
      published: false,
      title: 'Un vrai goût de feuille',
      text: 'Une poudre très fraîche, parfaite dans mes jus du matin.',
      reply: '',
    });
    expect(stripe.retrieve).toHaveBeenCalledWith(SESSION_ID);
    expect(stripe.update).toHaveBeenCalledWith(SESSION_ID, {
      metadata: { 'reviewed_REP-MOR-100': 'true' },
    });
  });

  it('the file takes its locale from the token, strips tags and control characters', async () => {
    const repo = fakeRepo();
    const { app } = makeApp({ reviewRepo: repo.repo });
    const res = await postJson(
      app,
      '/api/reviews',
      await review({
        token: await reviewToken({ l: 'en' }),
        locale: 'fr',
        author: '<b>John</b>\u0007',
        title: undefined,
        text: 'Lovely <script>alert(1)</script>powder,\r\n- great "taste"\n# really',
      }),
    );
    expect(res.status).toBe(201);
    const data = parse([...repo.files.values()][0]!.content);
    expect(data).toMatchObject({
      locale: 'en',
      author: 'John',
      title: '',
      text: 'Lovely alert(1)powder,\n- great "taste"\n# really',
    });
  });

  it('author accepts accents, apostrophes (typographic folded), hyphens and dots', async () => {
    const repo = fakeRepo();
    const { app } = makeApp({ reviewRepo: repo.repo });
    const res = await postJson(
      app,
      '/api/reviews',
      await review({ author: 'Marie-Ève O’Neil Jr.' }),
    );
    expect(res.status).toBe(201);
    expect(parse([...repo.files.values()][0]!.content).author).toBe("Marie-Ève O'Neil Jr.");
  });

  it('409 ALREADY_REVIEWED when the session says so, nothing committed', async () => {
    const repo = fakeRepo();
    const { app, stripe } = makeApp({ reviewRepo: repo.repo });
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({
        metadata: { ...sessionFixture().metadata, 'reviewed_REP-MOR-100': 'true' },
      }),
    );
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('ALREADY_REVIEWED');
    expect(repo.createFile).not.toHaveBeenCalled();
  });

  it('409 ALREADY_REVIEWED when GitHub says the file exists (422)', async () => {
    const repo = fakeRepo();
    repo.createFile.mockResolvedValueOnce('exists');
    const { app, stripe } = makeApp({ reviewRepo: repo.repo });
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('ALREADY_REVIEWED');
    // The session is marked anyway, so the next attempt stops before GitHub.
    expect(stripe.update).toHaveBeenCalled();
  });

  it.each([
    ['another secret', () => reviewToken({}, 'other-secret')],
    ['expired', () => reviewToken({ e: nowSeconds })],
    ['bad session id', () => reviewToken({ s: 'pi_123' })],
    ['no SKU list', () => reviewToken({ k: [] })],
    ['sku not in the order', () => reviewToken({ k: ['REP-BAO-100'] })],
    ['garbage', async () => 'abc.def'],
    [
      'a newsletter token',
      () =>
        signToken(
          { t: 'newsletter', m: 'a@example.com', l: 'fr', e: nowSeconds + 3600 },
          ENV.FORMS_SECRET!,
        ),
    ],
    [
      'no type',
      () =>
        signToken(
          { s: SESSION_ID, k: ['REP-MOR-100'], l: 'fr', e: nowSeconds + 3600 },
          ENV.FORMS_SECRET!,
        ),
    ],
  ])('400 INVALID_TOKEN: %s', async (_label, make) => {
    const repo = fakeRepo();
    const { app, stripe } = makeApp({ reviewRepo: repo.repo });
    const res = await postJson(app, '/api/reviews', await review({ token: await make() }));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('INVALID_TOKEN');
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(repo.createFile).not.toHaveBeenCalled();
  });

  it('400 INVALID_TOKEN when the session is gone or not this shop', async () => {
    const { app, stripe } = makeApp({ reviewRepo: fakeRepo().repo });
    stripe.retrieve.mockRejectedValueOnce(Object.assign(new Error('No such'), { statusCode: 404 }));
    expect(await errorCode(await postJson(app, '/api/reviews', await review()))).toBe(
      'INVALID_TOKEN',
    );
    stripe.retrieve.mockResolvedValueOnce(sessionFixture({ metadata: {} }));
    expect(await errorCode(await postJson(app, '/api/reviews', await review()))).toBe(
      'INVALID_TOKEN',
    );
  });

  it('502 PAYMENT_PROVIDER_ERROR when Stripe fails', async () => {
    const { app, stripe } = makeApp({ reviewRepo: fakeRepo().repo });
    stripe.retrieve.mockRejectedValueOnce(new Error('boom'));
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('PAYMENT_PROVIDER_ERROR');
  });

  it('502 when GitHub refuses (expired token), session not marked', async () => {
    const repo = fakeRepo();
    repo.createFile.mockRejectedValueOnce(new GitHubError('HTTP 401', 401));
    const { app, stripe } = makeApp({ reviewRepo: repo.repo });
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('INTERNAL_ERROR');
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('a failed metadata mark still answers 201 (the file is the truth)', async () => {
    const { app, stripe } = makeApp({ reviewRepo: fakeRepo().repo });
    stripe.update.mockRejectedValueOnce(new Error('down'));
    expect((await postJson(app, '/api/reviews', await review())).status).toBe(201);
  });

  it('409 UNKNOWN_SKU when the product left the catalogue', async () => {
    const { app } = makeApp({ reviewRepo: fakeRepo().repo });
    const res = await postJson(
      app,
      '/api/reviews',
      await review({ token: await reviewToken({ k: ['REP-OLD-1'] }), sku: 'REP-OLD-1' }),
    );
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('UNKNOWN_SKU');
  });

  it.each([
    ['rating 0', { rating: 0 }, 'rating'],
    ['rating 4.5', { rating: 4.5 }, 'rating'],
    ['author too short', { author: 'A' }, 'author'],
    ['author only tags', { author: '<i></i>' }, 'author'],
    ['author too long', { author: 'x'.repeat(41) }, 'author'],
    ['author with a URL', { author: 'https://spam.example' }, 'author'],
    ['author with an emoji', { author: 'Awa 🌿' }, 'author'],
    ['author with punctuation', { author: 'Awa!' }, 'author'],
    ['title too long', { title: 'x'.repeat(81) }, 'title'],
    ['text too short', { text: 'Trop court' }, 'text'],
    ['text too long', { text: 'x'.repeat(1201) }, 'text'],
    ['bad locale', { locale: 'de' }, 'locale'],
  ])('400 VALIDATION_ERROR: %s', async (_label, overrides, path) => {
    const { app } = makeApp({ reviewRepo: fakeRepo().repo });
    const res = await postJson(app, '/api/reviews', await review(overrides));
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect((json.error.details!.issues as Array<{ path: string }>).map((i) => i.path)).toContain(
      path,
    );
  });

  it('404 FEATURE_DISABLED when the owner turned reviews off, nothing committed', async () => {
    const repo = fakeRepo();
    const { app, stripe } = makeApp(
      { reviewRepo: repo.repo },
      catalogFixture({ features: { newsletter: true, reviews: false, newsletterWelcomeCode: '' } }),
    );
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(repo.createFile).not.toHaveBeenCalled();
  });

  it('404 FEATURE_DISABLED without GITHUB_TOKEN or FORMS_SECRET', async () => {
    let { app } = makeApp();
    expect(await errorCode(await postJson(app, '/api/reviews', await review()))).toBe(
      'FEATURE_DISABLED',
    );
    ({ app } = makeApp({ reviewRepo: fakeRepo().repo, env: { ...ENV, FORMS_SECRET: '' } }));
    const res = await postJson(app, '/api/reviews', await review());
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('FEATURE_DISABLED');
  });

  it('403 from another origin', async () => {
    const { app } = makeApp({ reviewRepo: fakeRepo().repo });
    const res = await postJson(app, '/api/reviews', await review(), {
      Origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
  });

  it('parisDay is the calendar day in Paris', () => {
    expect(parisDay(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-09');
    expect(parisDay(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(parisDay(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });
});

// Cron -----------------------------------------------------------------------

const RUN = new Date('2026-11-08T09:00:00Z');
const daysAgo = (d: number) => Math.floor((RUN.getTime() - d * 86_400_000) / 1000);

function listed(id: string, overrides: Record<string, unknown> = {}) {
  return sessionFixture({ id, created: daysAgo(7.5), line_items: undefined, ...overrides });
}

function cron(catalog = catalogFixture()) {
  const stripe = fakeStripe();
  const mail = fakeMailer();
  const loadCatalog = vi.fn(async () => catalog);
  const deps = { stripe: stripe.stripe, mailer: mail.mailer, loadCatalog, env: ENV };
  return { stripe, mail, deps, loadCatalog };
}

describe('inviteReviews (cron)', () => {
  it('lists the window from 8 to 7 days ago, completed sessions only', async () => {
    const { stripe, deps } = cron();
    await inviteReviews(deps, RUN);
    expect(stripe.list).toHaveBeenCalledWith({
      created: { gte: daysAgo(INVITE_WINDOW_DAYS.from), lt: daysAgo(INVITE_WINDOW_DAYS.to) },
      status: 'complete',
      limit: 100,
    });
  });

  it('invites a paid order: e-mail with a 60-day token, idempotency key, then the mark', async () => {
    const { stripe, mail, deps } = cron();
    stripe.list.mockResolvedValueOnce(sessionPage([listed(SESSION_ID)]));
    const report = await inviteReviews(deps, RUN);
    expect(report).toEqual({ listed: 1, invited: 1, skipped: 0, failed: 0 });

    const [m] = mail.sent;
    expect(m!.to).toBe('awa.diallo@example.com');
    expect(m!.replyTo).toBe(ENV.ORDER_EMAIL_TO);
    expect(m!.idempotencyKey).toBe(`${SESSION_ID}:review`);
    expect(m!.subject).toBe('Votre avis compte pour nous');
    expect(m!.text).toContain(fr('- Poudre de moringa 100 g\n- Poudre de baobab 100 g'));
    const url = m!.text.match(/https:\/\/\S+/)![0];
    expect(url).toMatch(/^https:\/\/racinesenpartage\.fr\/avis\/\?t=[\w.-]+$/);
    const token = await verifyToken(new URL(url).searchParams.get('t'), ENV.FORMS_SECRET!, RUN);
    expect(token).toEqual({
      t: 'review',
      s: SESSION_ID,
      k: ['REP-MOR-100', 'REP-BAO-100'],
      l: 'fr',
      e: RUN.getTime() / 1000 + 60 * 86_400,
    });
    expect(stripe.update).toHaveBeenCalledWith(SESSION_ID, {
      metadata: { review_invited: 'true' },
    });
  });

  it('English order: English e-mail and /en/review/', async () => {
    const { stripe, mail, deps } = cron();
    stripe.list.mockResolvedValueOnce(
      sessionPage([listed(SESSION_ID, { metadata: { locale: 'en', delivery_method: 'home' } })]),
    );
    await inviteReviews(deps, RUN);
    expect(mail.sent[0]!.subject).toBe('How are you enjoying your order?');
    expect(mail.sent[0]!.text).toContain('https://racinesenpartage.fr/en/review/?t=');
    expect(mail.sent[0]!.html).toContain('>Leave a review</a>');
  });

  it('skips already invited, unpaid, foreign and address-less sessions', async () => {
    const { stripe, mail, deps } = cron();
    const meta = sessionFixture().metadata!;
    const sessions = [
      listed('cs_test_invited', { metadata: { ...meta, review_invited: 'true' } }),
      listed('cs_test_unpaid', { payment_status: 'unpaid' }),
      listed('cs_test_foreign', { metadata: {} }),
      listed('cs_test_noemail', {
        customer_details: { ...sessionFixture().customer_details, email: null },
      }),
    ];
    expect(sessions.map(inviteSkipReason)).toEqual([
      'already_invited',
      'unpaid',
      'not_ours',
      'no_email',
    ]);
    stripe.list.mockResolvedValueOnce(sessionPage(sessions));
    const report = await inviteReviews(deps, RUN);
    expect(report).toEqual({ listed: 4, invited: 0, skipped: 4, failed: 0 });
    expect(mail.sent).toHaveLength(0);
    expect(stripe.listLineItems).not.toHaveBeenCalled();
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('a 100 % promotion code order (no_payment_required) is invited', async () => {
    const { stripe, mail, deps } = cron();
    stripe.list.mockResolvedValueOnce(
      sessionPage([listed(SESSION_ID, { payment_status: 'no_payment_required' })]),
    );
    await inviteReviews(deps, RUN);
    expect(mail.sent).toHaveLength(1);
  });

  it('pages through with starting_after', async () => {
    const { stripe, deps } = cron();
    stripe.list
      .mockResolvedValueOnce(sessionPage([listed('cs_test_page1')], true))
      .mockResolvedValueOnce(sessionPage([listed('cs_test_page2')]));
    const report = await inviteReviews(deps, RUN);
    expect(report.invited).toBe(2);
    expect(stripe.list).toHaveBeenCalledTimes(2);
    expect(stripe.list.mock.calls[1]![0]).toMatchObject({ starting_after: 'cs_test_page1' });
  });

  it('stops paging at the cap', async () => {
    const { stripe, deps } = cron();
    stripe.list.mockImplementation(async () => sessionPage([], true));
    await inviteReviews(deps, RUN);
    expect(stripe.list).toHaveBeenCalledTimes(1);
    stripe.list.mockReset();
    let n = 0;
    stripe.list.mockImplementation(async () =>
      sessionPage([listed(`cs_test_p${n++}`, { metadata: {} })], true),
    );
    const report = await inviteReviews(deps, RUN);
    expect(stripe.list).toHaveBeenCalledTimes(10);
    expect(report.listed).toBe(10);
  });

  it('a failed e-mail leaves the session unmarked and the run goes on', async () => {
    const { stripe, mail, deps } = cron();
    stripe.list.mockResolvedValueOnce(
      sessionPage([listed('cs_test_first'), listed('cs_test_second')]),
    );
    mail.send.mockRejectedValueOnce(new MailerError('down', 500));
    const report = await inviteReviews(deps, RUN);
    expect(report).toEqual({ listed: 2, invited: 1, skipped: 0, failed: 1 });
    expect(stripe.update).toHaveBeenCalledTimes(1);
    expect(stripe.update).toHaveBeenCalledWith('cs_test_second', expect.anything());
  });

  it('a session without SKUs is skipped', async () => {
    const { stripe, mail, deps } = cron();
    stripe.list.mockResolvedValueOnce(sessionPage([listed(SESSION_ID)]));
    stripe.listLineItems.mockResolvedValueOnce({
      object: 'list',
      has_more: false,
      url: '',
      data: [{ id: 'li', description: 'x', quantity: 1, amount_subtotal: 1, price: null }],
    } as unknown as Stripe.ApiList<Stripe.LineItem>);
    const report = await inviteReviews(deps, RUN);
    expect(report.skipped).toBe(1);
    expect(mail.sent).toHaveLength(0);
  });

  it('does nothing when the owner turned reviews off (one info line)', async () => {
    const { stripe, mail, deps } = cron(
      catalogFixture({ features: { newsletter: true, reviews: false, newsletterWelcomeCode: '' } }),
    );
    stripe.list.mockResolvedValue(sessionPage([listed(SESSION_ID)]));
    expect(await inviteReviews(deps, RUN)).toEqual({
      listed: 0,
      invited: 0,
      skipped: 0,
      failed: 0,
    });
    expect(stripe.list).not.toHaveBeenCalled();
    expect(mail.sent).toHaveLength(0);
    const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes('review.invites_off'))).toHaveLength(1);
  });

  it('sends nothing when the catalogue cannot be read', async () => {
    const { stripe, deps, loadCatalog } = cron();
    loadCatalog.mockRejectedValueOnce(new Error('404'));
    expect((await inviteReviews(deps, RUN)).failed).toBe(1);
    expect(stripe.list).not.toHaveBeenCalled();
  });

  it('does nothing without FORMS_SECRET; a list failure is counted', async () => {
    const { stripe, deps } = cron();
    expect(await inviteReviews({ ...deps, env: { ...ENV, FORMS_SECRET: '' } }, RUN)).toEqual({
      listed: 0,
      invited: 0,
      skipped: 0,
      failed: 0,
    });
    expect(stripe.list).not.toHaveBeenCalled();
    stripe.list.mockRejectedValueOnce(new Error('down'));
    expect((await inviteReviews(deps, RUN)).failed).toBe(1);
  });
});
