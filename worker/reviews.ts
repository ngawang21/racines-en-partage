// Customer reviews (spec 2.1): the daily invitation run (`inviteReviews`, from
// the Cron Trigger) and POST /api/reviews, which commits a moderated review
// file to the repository through the GitHub Contents API.
import type Stripe from 'stripe';
import { z } from 'zod';
import { LOCALES } from '../src/consts';
import { REVIEW_LIMITS } from '../src/content/schemas';
import { ROUTES } from '../src/i18n/routing';
import type { AppDeps } from './app';
import type { WorkerCatalog } from './catalog';
import { renderReviewInvitation } from './email/templates';
import { ApiError } from './errors';
import { cleanText, featureDisabled, isLocaleValue, parseBody, switchedOff } from './forms';
import { GitHubError } from './github';
import { describeError, logError, logInfo } from './log';
import {
  SESSION_ID_PATTERN,
  deliveryFromMetadata,
  isPaid,
  isResourceMissing,
  orderNumber,
  summariseSession,
  withLineItems,
} from './orders';
import { expiresIn, signToken, verifyToken } from './tokens';
import type { AppEnv, Locale, Mailer, StripeLike } from './types';
import { toYaml } from './yaml';

/** The invitation link works for 60 days. */
export const REVIEW_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Sessions created between 10 and 7 days before the run get their
 * invitation: a session missed by a failed run is retried for two more days,
 * and `metadata.review_invited` keeps it from being invited twice.
 */
export const INVITE_WINDOW_DAYS = { from: 10, to: 7 } as const;
/** 100 sessions per page; 10 pages is far above a day of this shop's orders. */
export const MAX_INVITE_PAGES = 10;
/** Session metadata set once the invitation is out. */
export const REVIEW_INVITED_KEY = 'review_invited';
/** Session metadata set once a product of the order is reviewed. */
export const reviewedKey = (sku: string) => `reviewed_${sku}`;

export const REVIEWS_DIR = 'src/content/reviews';

/** Payload of the review invitation token. */
export interface ReviewToken {
  /** Token type: a newsletter token cannot post a review. */
  t: 'review';
  /** Checkout Session id. */
  s: string;
  /** SKUs of the order. */
  k: string[];
  l: Locale;
  e: number;
}

/** The review token of the invitation and of the customer space (60 days). */
export function issueReviewToken(
  sessionId: string,
  skus: string[],
  locale: Locale,
  now: Date,
  secret: string,
): Promise<string> {
  const payload: ReviewToken = {
    t: 'review',
    s: sessionId,
    k: skus,
    l: locale,
    e: expiresIn(now, REVIEW_TOKEN_TTL_SECONDS),
  };
  return signToken(payload, secret);
}

/** SKUs of an order, line items first, else the checkout's `metadata.skus`. */
export function orderSkus(
  lines: Array<{ sku: string | null }>,
  metadata: Stripe.Metadata | null,
): string[] {
  const fromLines = lines.flatMap((l) => (l.sku ? [l.sku] : []));
  const skus = fromLines.length
    ? fromLines
    : (metadata?.skus ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return [...new Set(skus)];
}

/** SKUs of the order still waiting for a review. */
export function unreviewedSkus(skus: string[], metadata: Stripe.Metadata | null): string[] {
  return skus.filter((sku) => metadata?.[reviewedKey(sku)] !== 'true');
}

export function isReviewToken(value: unknown): value is ReviewToken {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.t === 'review' &&
    typeof v.s === 'string' &&
    SESSION_ID_PATTERN.test(v.s) &&
    Array.isArray(v.k) &&
    v.k.length > 0 &&
    v.k.every((sku) => typeof sku === 'string' && sku.length > 0) &&
    isLocaleValue(v.l)
  );
}

// POST /api/reviews ----------------------------------------------------------

const [AUTHOR_MIN, AUTHOR_MAX] = REVIEW_LIMITS.author;
/** A first name or pseudonym: letters (accents included), digits, spaces, ' - . only. */
export const AUTHOR_TEXT = /^[\p{L}\p{M}\d '.-]+$/u;
const [TEXT_MIN, TEXT_MAX] = REVIEW_LIMITS.text;

export const reviewRequestSchema = z.object({
  token: z.string().min(1).max(4096),
  sku: z.string().trim().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  author: z
    .string()
    .max(1000)
    .transform((v) => cleanText(v).replace(/[\u2018\u2019]/g, "'"))
    .pipe(
      z
        .string()
        .min(AUTHOR_MIN)
        .max(AUTHOR_MAX)
        .regex(AUTHOR_TEXT, 'Letters, digits, spaces, apostrophes, hyphens and dots only'),
    ),
  title: z
    .string()
    .max(1000)
    .optional()
    .transform((v) => cleanText(v ?? ''))
    .pipe(z.string().max(REVIEW_LIMITS.title)),
  text: z
    .string()
    .max(20_000)
    .transform((v) => cleanText(v, true))
    .pipe(z.string().min(TEXT_MIN).max(TEXT_MAX)),
  locale: z.enum(LOCALES),
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/** "2026-11-08": the day in Paris, where the owner reads the reviews. */
export function parisDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function reviewPath(slug: string, number: string): string {
  return `${REVIEWS_DIR}/${slug}--${number}.yml`;
}

/** The review file, in the field order of the spec; `reviewSchema` parses it. */
export function renderReviewFile(review: {
  product: string;
  rating: number;
  author: string;
  locale: Locale;
  date: string;
  order: string;
  title: string;
  text: string;
}): string {
  return toYaml({
    product: review.product,
    rating: review.rating,
    author: review.author,
    locale: review.locale,
    date: review.date,
    order: review.order,
    verified: true,
    published: false,
    title: review.title,
    text: review.text,
    reply: '',
  });
}

const invalidToken = () => new ApiError(400, 'INVALID_TOKEN', 'Invalid or expired link');

export async function submitReview(
  body: unknown,
  deps: AppDeps,
  loadCatalog: () => Promise<WorkerCatalog>,
): Promise<void> {
  const secret = deps.env.FORMS_SECRET;
  if (!secret) throw featureDisabled('FORMS_SECRET');
  if (!deps.reviewRepo) throw featureDisabled('GITHUB_TOKEN');
  const catalog = await loadCatalog();
  if (!catalog.features.reviews) throw switchedOff();
  const req = parseBody(reviewRequestSchema, body, 'review');

  const token = await verifyToken<unknown>(req.token, secret, deps.now());
  if (!isReviewToken(token) || !token.k.includes(req.sku)) throw invalidToken();

  const product = catalog.products.find((p) => p.sku === req.sku);
  if (!product) throw new ApiError(409, 'UNKNOWN_SKU', 'Unknown product', { skus: [req.sku] });

  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe.checkout.sessions.retrieve(token.s);
  } catch (err) {
    if (isResourceMissing(err)) throw invalidToken();
    logError('review.stripe_failed', { error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
  }
  if (!deliveryFromMetadata(session.metadata)) throw invalidToken();
  const key = reviewedKey(req.sku);
  if (session.metadata?.[key] === 'true') {
    throw new ApiError(409, 'ALREADY_REVIEWED', 'This product is already reviewed for this order');
  }

  const number = orderNumber(session.id);
  const content = renderReviewFile({
    product: product.slug,
    rating: req.rating,
    author: req.author,
    locale: token.l,
    date: parisDay(deps.now()),
    order: number,
    title: req.title,
    text: req.text,
  });
  let result: 'created' | 'exists';
  try {
    result = await deps.reviewRepo.createFile(
      reviewPath(product.slug, number),
      content,
      `content: avis client sur ${product.slug}`,
    );
  } catch (err) {
    const status = err instanceof GitHubError ? (err.status ?? null) : null;
    logError('review.github_failed', { sessionId: session.id, status, error: describeError(err) });
    throw new ApiError(502, 'INTERNAL_ERROR', 'The review could not be saved');
  }

  try {
    // Stripe merges metadata: the delivery keys stay.
    await deps.stripe.checkout.sessions.update(session.id, { metadata: { [key]: 'true' } });
  } catch (err) {
    // The file is the source of truth: a second attempt meets the existing file.
    logError('review.mark_failed', { sessionId: session.id, error: describeError(err) });
  }
  if (result === 'exists') {
    throw new ApiError(409, 'ALREADY_REVIEWED', 'This product is already reviewed for this order');
  }
  logInfo('review.received', { sessionId: session.id, sku: req.sku, rating: req.rating });
}

// Cron: invitations ----------------------------------------------------------

export interface InviteDeps {
  stripe: StripeLike;
  mailer: Mailer;
  /** Read for `features.reviews`, the owner's switch in the CMS settings. */
  loadCatalog: () => Promise<WorkerCatalog>;
  env: Pick<AppEnv, 'SITE_URL' | 'ORDER_EMAIL_TO' | 'FORMS_SECRET'>;
}

export interface InviteReport {
  listed: number;
  invited: number;
  skipped: number;
  failed: number;
}

/** Why a listed session gets no invitation, or null when it gets one. */
export function inviteSkipReason(session: Stripe.Checkout.Session): string | null {
  if (session.metadata?.[REVIEW_INVITED_KEY] === 'true') return 'already_invited';
  if (!isPaid(session.payment_status)) return 'unpaid';
  if (!deliveryFromMetadata(session.metadata)) return 'not_ours';
  if (!session.customer_details?.email?.trim()) return 'no_email';
  return null;
}

async function listWindow(stripe: StripeLike, now: Date): Promise<Stripe.Checkout.Session[]> {
  const created = {
    gte: Math.floor((now.getTime() - INVITE_WINDOW_DAYS.from * DAY_MS) / 1000),
    lt: Math.floor((now.getTime() - INVITE_WINDOW_DAYS.to * DAY_MS) / 1000),
  };
  const sessions: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_INVITE_PAGES; page++) {
    const list = await stripe.checkout.sessions.list({
      created,
      status: 'complete',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(...list.data);
    const last = list.data.at(-1);
    if (!list.has_more || !last) return sessions;
    startingAfter = last.id;
  }
  logError('review.invite_cap', { pages: MAX_INVITE_PAGES });
  return sessions;
}

/**
 * The daily run: one invitation per paid order of this shop created between
 * 8 and 7 days ago, then `metadata.review_invited`. Each session falls in
 * exactly one daily window; Resend's idempotency key `<session id>:review`
 * drops a duplicate if the run is retried the same day.
 */
export async function inviteReviews(deps: InviteDeps, now: Date): Promise<InviteReport> {
  const report: InviteReport = { listed: 0, invited: 0, skipped: 0, failed: 0 };
  const secret = deps.env.FORMS_SECRET;
  if (!secret) {
    logError('config.missing', { name: 'FORMS_SECRET' });
    return report;
  }
  try {
    if (!(await deps.loadCatalog()).features.reviews) {
      logInfo('review.invites_off', { reason: 'reviews.enabled is false' });
      return report;
    }
  } catch (err) {
    // Without the catalogue the owner's choice is unknown: send nothing this time.
    logError('review.catalog_failed', { error: describeError(err) });
    report.failed++;
    return report;
  }
  let sessions: Stripe.Checkout.Session[];
  try {
    sessions = await listWindow(deps.stripe, now);
  } catch (err) {
    logError('review.list_failed', { error: describeError(err) });
    report.failed++;
    return report;
  }
  report.listed = sessions.length;
  const site = deps.env.SITE_URL.replace(/\/+$/, '');

  for (const brief of sessions) {
    if (inviteSkipReason(brief)) {
      report.skipped++;
      continue;
    }
    try {
      const summary = summariseSession(await withLineItems(deps.stripe, brief));
      const skus = [...new Set(summary.lines.flatMap((l) => (l.sku ? [l.sku] : [])))];
      if (skus.length === 0) {
        report.skipped++;
        continue;
      }
      const products = [...new Set(summary.lines.map((l) => l.name).filter(Boolean))];
      const token = await issueReviewToken(brief.id, skus, summary.locale, now, secret);
      const email = renderReviewInvitation({
        locale: summary.locale,
        name: summary.customer.name,
        products,
        url: `${site}${ROUTES.review[summary.locale]}?t=${token}`,
      });
      await deps.mailer.send({
        to: summary.customer.email!.trim(),
        ...email,
        ...(deps.env.ORDER_EMAIL_TO ? { replyTo: deps.env.ORDER_EMAIL_TO } : {}),
        idempotencyKey: `${brief.id}:review`,
        template: 'review_invitation',
      });
    } catch (err) {
      logError('review.invite_failed', { sessionId: brief.id, error: describeError(err) });
      report.failed++;
      continue;
    }
    report.invited++;
    try {
      await deps.stripe.checkout.sessions.update(brief.id, {
        metadata: { [REVIEW_INVITED_KEY]: 'true' },
      });
    } catch (err) {
      // The e-mail is out; the next run no longer lists this session.
      logError('review.mark_failed', { sessionId: brief.id, error: describeError(err) });
    }
  }
  logInfo('review.invites', { ...report });
  return report;
}
