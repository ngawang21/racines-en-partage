// The passwordless customer space (spec 8.6): a 15-minute sign-in link by
// e-mail, a 30-day session cookie, the orders of that e-mail from Stripe and
// review tokens for them. No database: every token is signed with FORMS_SECRET.
import type Stripe from 'stripe';
import { z } from 'zod';
import { LOCALES } from '../src/consts';
import { ROUTES } from '../src/i18n/routing';
import type { AppDeps } from './app';
import type { WorkerCatalog } from './catalog';
import { SESSION_COOKIE, readCookie } from './cookies';
import { NullMailer } from './email/resend';
import { renderLoginEmail } from './email/templates';
import { ApiError } from './errors';
import {
  checkCaptcha,
  emailField,
  featureDisabled,
  isHoneypotFilled,
  isLocaleValue,
  parseBody,
  requireCaptchaSetup,
  switchedOff,
  takeBudget,
} from './forms';
import { describeError, logError, logInfo, maskEmail } from './log';
import {
  SESSION_ID_PATTERN,
  deliveryFromMetadata,
  isPaid,
  isResourceMissing,
  publicOrder,
  summariseSession,
  withLineItems,
} from './orders';
import { issueReviewToken, orderSkus, unreviewedSkus } from './reviews';
import { expiresIn, signToken, verifyToken } from './tokens';
import type { Locale } from './types';
import { isPermanentMailError } from './webhook';

/** The sign-in link works for 15 minutes. */
export const LOGIN_TOKEN_TTL_SECONDS = 15 * 60;
/** The session cookie and its token last 30 days. */
export const SESSION_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Three pages of 100: far more orders than one customer places. */
export const ACCOUNT_MAX_PAGES = 3;
/** Line items are fetched for the most recent orders only. */
export const ACCOUNT_LINES_LIMIT = 20;

export interface LoginToken {
  t: 'login';
  m: string;
  l: Locale;
  e: number;
}

export interface SessionToken {
  t: 'session';
  m: string;
  e: number;
}

/** "Awa@Example.com " to "awa@example.com": for comparisons only, never for Stripe queries. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

function secretOrDisabled(deps: AppDeps): string {
  const secret = deps.env.FORMS_SECRET;
  if (!secret) throw featureDisabled('FORMS_SECRET');
  return secret;
}

export const unauthenticated = () =>
  new ApiError(401, 'UNAUTHENTICATED', 'Sign in again to see your orders');

// POST /api/account/login ----------------------------------------------------

export const loginRequestSchema = z.object({
  email: emailField,
  locale: z.enum(LOCALES),
  turnstile: z.string().max(2048).optional(),
  website: z.string().max(1000).optional(),
});

export function accountUrl(siteUrl: string, locale: Locale, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${ROUTES.account[locale]}?t=${token}`;
}

/** Always resolves for a valid request, whether or not the address ever ordered. */
export async function handleLogin(body: unknown, deps: AppDeps, ip: string | null): Promise<void> {
  const secret = secretOrDisabled(deps);
  if (deps.mailer instanceof NullMailer) throw featureDisabled('RESEND_API_KEY');
  requireCaptchaSetup(deps, 'account_login');
  if (isHoneypotFilled(body)) {
    logInfo('account.honeypot');
    return;
  }
  const req = parseBody(loginRequestSchema, body, 'sign-in request');
  await checkCaptcha(deps, req.turnstile, ip);
  await takeBudget(deps, 'account_login');

  // As typed (trimmed by the schema): Stripe stores the address as the customer typed it.
  const email = req.email;
  const payload: LoginToken = {
    t: 'login',
    m: email,
    l: req.locale,
    e: expiresIn(deps.now(), LOGIN_TOKEN_TTL_SECONDS),
  };
  const token = await signToken(payload, secret);
  const message = renderLoginEmail({
    locale: req.locale,
    url: accountUrl(deps.env.SITE_URL, req.locale, token),
  });
  try {
    await deps.mailer.send({
      to: email,
      ...message,
      idempotencyKey: `login:${crypto.randomUUID()}`,
      template: 'account_login',
    });
  } catch (err) {
    // A refused address answers like a sent one: the endpoint never tells which addresses work.
    if (isPermanentMailError(err)) {
      logError('account.mail_refused', { to: maskEmail(email), error: describeError(err) });
      return;
    }
    logError('account.mail_failed', { error: describeError(err) });
    throw new ApiError(502, 'MAIL_FAILED', 'The sign-in e-mail could not be sent');
  }
  logInfo('account.link_sent', { to: maskEmail(email), locale: req.locale });
}

// POST /api/account/session ----------------------------------------------------

export const sessionRequestSchema = z.object({ token: z.string().min(1).max(4096) });

function isLoginToken(value: unknown): value is LoginToken {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.t === 'login' &&
    typeof v.m === 'string' &&
    emailField.safeParse(v.m).success &&
    isLocaleValue(v.l)
  );
}

/** Exchanges a sign-in token for a session token (the cookie value) and the masked address. */
export async function openSession(
  body: unknown,
  deps: AppDeps,
): Promise<{ cookieToken: string; email: string }> {
  const secret = secretOrDisabled(deps);
  const { token } = parseBody(sessionRequestSchema, body, 'session request');
  const login = await verifyToken<unknown>(token, secret, deps.now());
  if (!isLoginToken(login)) {
    throw new ApiError(400, 'INVALID_TOKEN', 'Invalid or expired link');
  }
  const email = login.m.trim();
  const session: SessionToken = {
    t: 'session',
    m: email,
    e: expiresIn(deps.now(), SESSION_TOKEN_TTL_SECONDS),
  };
  logInfo('account.signed_in', { to: maskEmail(email) });
  return { cookieToken: await signToken(session, secret), email: maskEmail(email)! };
}

// The cookie ------------------------------------------------------------------

function isSessionToken(value: unknown): value is SessionToken {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.t === 'session' && typeof v.m === 'string' && emailField.safeParse(v.m).success;
}

/** The signed-in address from the Cookie header; 401 UNAUTHENTICATED otherwise. */
export async function sessionEmail(
  cookieHeader: string | undefined,
  deps: AppDeps,
): Promise<string> {
  const secret = secretOrDisabled(deps);
  const value = readCookie(cookieHeader, SESSION_COOKIE);
  if (!value) throw unauthenticated();
  const session = await verifyToken<unknown>(value, secret, deps.now());
  if (!isSessionToken(session)) throw unauthenticated();
  return session.m;
}

// GET /api/account/orders -------------------------------------------------------

/** Sessions Stripe lists for one spelling of the address, at most 300. */
async function listForAddress(deps: AppDeps, email: string): Promise<Stripe.Checkout.Session[]> {
  const sessions: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < ACCOUNT_MAX_PAGES; page++) {
    const list = await deps.stripe.checkout.sessions.list({
      customer_details: { email },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(...list.data);
    const last = list.data.at(-1);
    if (!list.has_more || !last) break;
    startingAfter = last.id;
  }
  return sessions;
}

/**
 * Completed sessions of this shop for that address, newest first. Stripe's
 * filter compares the address as stored, so both spellings are listed (as
 * typed and lower-cased, when they differ) and merged by session id.
 */
async function listOrders(deps: AppDeps, email: string): Promise<Stripe.Checkout.Session[]> {
  const byId = new Map<string, Stripe.Checkout.Session>();
  for (const address of new Set([email, email.toLowerCase()])) {
    for (const s of await listForAddress(deps, address)) byId.set(s.id, s);
  }
  return [...byId.values()]
    .filter((s) => s.status === 'complete' && deliveryFromMetadata(s.metadata) !== null)
    .sort((a, b) => b.created - a.created);
}

/** `publicOrder` plus what the space needs: id, date, SKUs per line, review state. */
export function accountOrder(
  session: Stripe.Checkout.Session,
  options: { linesOmitted: boolean; reviewsOn: boolean },
) {
  const summary = summariseSession(session);
  const skus = orderSkus(summary.lines, session.metadata);
  const reviewable =
    options.reviewsOn &&
    isPaid(session.payment_status) &&
    Boolean(summary.customer.email) &&
    unreviewedSkus(skus, session.metadata).length > 0;
  return {
    ...publicOrder(summary),
    id: session.id,
    createdAt: summary.createdAt.toISOString(),
    lines: summary.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitAmount: l.unitAmount,
      sku: l.sku,
    })),
    reviewable,
    ...(options.linesOmitted ? { linesOmitted: true } : {}),
  };
}

export type AccountOrder = ReturnType<typeof accountOrder>;

export async function accountOrders(
  email: string,
  deps: AppDeps,
  loadCatalog: () => Promise<WorkerCatalog>,
): Promise<{ email: string; orders: AccountOrder[] }> {
  let reviewsOn = false;
  try {
    reviewsOn = (await loadCatalog()).features.reviews && Boolean(deps.env.FORMS_SECRET);
  } catch {
    // The orders matter more than the review buttons: show them without.
  }
  let orders: AccountOrder[];
  try {
    const sessions = await listOrders(deps, email);
    const recent = await Promise.all(
      sessions.slice(0, ACCOUNT_LINES_LIMIT).map((s) => withLineItems(deps.stripe, s)),
    );
    orders = [
      ...recent.map((s) => accountOrder(s, { linesOmitted: false, reviewsOn })),
      ...sessions
        .slice(ACCOUNT_LINES_LIMIT)
        .map((s) =>
          accountOrder({ ...s, line_items: undefined }, { linesOmitted: true, reviewsOn }),
        ),
    ];
  } catch (err) {
    logError('account.stripe_failed', { to: maskEmail(email), error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
  }
  return { email: maskEmail(email)!, orders };
}

// POST /api/account/review-token --------------------------------------------------

export const reviewTokenRequestSchema = z.object({
  sessionId: z.string().max(255).regex(SESSION_ID_PATTERN),
});

/** The invitation's review token for one of the signed-in customer's paid orders. */
export async function accountReviewToken(
  body: unknown,
  email: string,
  deps: AppDeps,
  loadCatalog: () => Promise<WorkerCatalog>,
): Promise<string> {
  const secret = secretOrDisabled(deps);
  if (!(await loadCatalog()).features.reviews) throw switchedOff();
  const { sessionId } = parseBody(reviewTokenRequestSchema, body, 'review token request');
  // Someone else's order answers exactly like an unknown one.
  const notFound = () => new ApiError(404, 'ORDER_NOT_FOUND', 'No order matches');

  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (isResourceMissing(err)) throw notFound();
    logError('account.stripe_failed', { to: maskEmail(email), error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
  }
  const owner = session.customer_details?.email;
  if (!owner || normaliseEmail(owner) !== normaliseEmail(email)) throw notFound();
  if (!deliveryFromMetadata(session.metadata) || !isPaid(session.payment_status)) {
    throw notFound();
  }
  let summary;
  try {
    summary = summariseSession(await withLineItems(deps.stripe, session));
  } catch (err) {
    logError('account.stripe_failed', { to: maskEmail(email), error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
  }
  const remaining = unreviewedSkus(orderSkus(summary.lines, session.metadata), session.metadata);
  if (remaining.length === 0) {
    throw new ApiError(409, 'ALREADY_REVIEWED', 'Every product of this order is reviewed');
  }
  return issueReviewToken(session.id, remaining, summary.locale, deps.now(), secret);
}
