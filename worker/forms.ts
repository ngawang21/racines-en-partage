// POST /api/contact, POST /api/newsletter and GET /api/newsletter/confirm
// (spec 2.2, 2.3, 2.10): request schemas, text cleaning and the handlers.
import { z } from 'zod';
import { LOCALES, isLocale } from '../src/consts';
import { ROUTES } from '../src/i18n/routing';
import type { AppDeps } from './app';
import type { WorkerCatalog } from './catalog';
import { toIssues } from './checkout';
import {
  renderContactEmail,
  renderNewsletterConfirmation,
  renderStockAlertEmail,
} from './email/templates';
import { ApiError } from './errors';
import { describeError, logError, logInfo, maskEmail } from './log';
import { expiresIn, peekToken, signToken, verifyToken } from './tokens';
import { MAX_TURNSTILE_TOKEN } from './turnstile';
import type { Locale } from './types';
import { isPermanentMailError } from './webhook';

/** Body cap of every form endpoint. */
export const MAX_FORM_BYTES = 16 * 1024;
export const CONTACT_LIMITS = { name: 80, message: 3000 } as const;
/** The newsletter confirmation link works for 48 hours. */
export const NEWSLETTER_TOKEN_TTL_SECONDS = 48 * 60 * 60;

/** HTML tags: removed from anything a customer types. */
const TAG = /<[^>]*>/g;
/** C0 and C1 controls except tab and line feed, bidi overrides, BOM. */
const CONTROL =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Customer text as it may be stored or e-mailed: tags stripped, control
 * characters removed, tabs as spaces, at most one blank line in a row,
 * trimmed. Single-line fields also fold line breaks into spaces.
 */
export function cleanText(value: string, multiline = false): string {
  let out = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(TAG, '')
    .replace(CONTROL, '')
    .replace(LONE_SURROGATE, '')
    .replace(/\t/g, ' ');
  out = multiline
    ? out
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
    : out.replace(/\s*\n\s*/g, ' ');
  return out.trim();
}

/** A locale read from an untrusted value (a token payload). */
export const isLocaleValue = (value: unknown): value is Locale =>
  typeof value === 'string' && isLocale(value);

export const emailField = z.string().trim().max(254).pipe(z.email());

const turnstileField = z.string().max(MAX_TURNSTILE_TOKEN).optional();
/** The honeypot; checked on the raw body before the schema runs. */
const websiteField = z.string().max(1000).optional();

export const contactRequestSchema = z
  .object({
    kind: z.enum(['contact', 'stock_alert']),
    locale: z.enum(LOCALES),
    name: z
      .string()
      .max(1000)
      .optional()
      .transform((v) => cleanText(v ?? '')),
    email: emailField,
    message: z
      .string()
      .max(20_000)
      .optional()
      .transform((v) => cleanText(v ?? '', true)),
    sku: z.string().trim().max(64).optional(),
    turnstile: turnstileField,
    website: websiteField,
  })
  .superRefine((req, ctx) => {
    if (req.name.length > CONTACT_LIMITS.name) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name too long' });
    }
    if (req.message.length > CONTACT_LIMITS.message) {
      ctx.addIssue({ code: 'custom', path: ['message'], message: 'Message too long' });
    }
    if (req.kind === 'contact') {
      if (!req.name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Required' });
      if (!req.message) ctx.addIssue({ code: 'custom', path: ['message'], message: 'Required' });
    } else if (!req.sku) {
      ctx.addIssue({ code: 'custom', path: ['sku'], message: 'Required' });
    }
  });

export type ContactRequest = z.infer<typeof contactRequestSchema>;

export const newsletterRequestSchema = z.object({
  email: emailField,
  locale: z.enum(LOCALES),
  turnstile: turnstileField,
  website: websiteField,
});

/** Payload of the newsletter confirmation token. */
export interface NewsletterToken {
  m: string;
  l: Locale;
  e: number;
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown, what: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid ${what}`, {
      issues: toIssues(parsed.error),
    });
  }
  return parsed.data;
}

/** A filled honeypot: a bot. It gets the success answer and nothing is sent. */
export function isHoneypotFilled(body: unknown): boolean {
  if (!body || typeof body !== 'object' || !('website' in body)) return false;
  const value = (body as { website?: unknown }).website;
  return typeof value === 'string' ? value.trim() !== '' : value != null;
}

export function featureDisabled(missing: string): ApiError {
  logError('config.missing', { name: missing });
  return new ApiError(404, 'FEATURE_DISABLED', 'This feature is not enabled');
}

/** The owner turned the feature off in the CMS settings: expected, not logged as an error. */
export function switchedOff(): ApiError {
  return new ApiError(404, 'FEATURE_DISABLED', 'This feature is turned off');
}

async function checkCaptcha(deps: AppDeps, token: string | undefined, ip: string | null) {
  if (!deps.captcha) return;
  if (!(await deps.captcha.verify(token, ip))) {
    throw new ApiError(400, 'CAPTCHA_FAILED', 'Captcha check failed');
  }
}

export async function handleContact(
  body: unknown,
  deps: AppDeps,
  ip: string | null,
  loadProductName: (sku: string) => Promise<string | null>,
): Promise<void> {
  if (isHoneypotFilled(body)) {
    logInfo('contact.honeypot');
    return;
  }
  const to = deps.env.ORDER_EMAIL_TO;
  if (!to) throw featureDisabled('ORDER_EMAIL_TO');
  const req = parseBody(contactRequestSchema, body, 'contact request');
  await checkCaptcha(deps, req.turnstile, ip);

  let email;
  if (req.kind === 'stock_alert') {
    const product = await loadProductName(req.sku!);
    if (!product) {
      throw new ApiError(409, 'UNKNOWN_SKU', 'Unknown product', { skus: [req.sku] });
    }
    email = renderStockAlertEmail({
      email: req.email,
      name: req.name,
      product,
      sku: req.sku!,
      locale: req.locale,
    });
  } else {
    email = renderContactEmail({
      email: req.email,
      name: req.name,
      message: req.message,
      locale: req.locale,
    });
  }
  try {
    await deps.mailer.send({
      to,
      ...email,
      replyTo: req.email,
      idempotencyKey: `${req.kind}:${crypto.randomUUID()}`,
    });
  } catch (err) {
    logError('contact.mail_failed', { kind: req.kind, error: describeError(err) });
    throw new ApiError(502, 'MAIL_FAILED', 'The message could not be sent');
  }
  logInfo('contact.sent', { kind: req.kind, locale: req.locale, sku: req.sku ?? null });
}

/** Absolute URL of the static newsletter page with its status. */
export function newsletterPage(siteUrl: string, locale: Locale, status: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${ROUTES.newsletter[locale]}?status=${status}`;
}

export async function handleNewsletter(
  body: unknown,
  deps: AppDeps,
  ip: string | null,
  loadCatalog: () => Promise<WorkerCatalog>,
): Promise<void> {
  const secret = deps.env.FORMS_SECRET;
  if (!secret) throw featureDisabled('FORMS_SECRET');
  if (!deps.audience) throw featureDisabled('RESEND_AUDIENCE_ID');
  const { features } = await loadCatalog();
  if (!features.newsletter) throw switchedOff();
  if (isHoneypotFilled(body)) {
    logInfo('newsletter.honeypot');
    return;
  }
  const req = parseBody(newsletterRequestSchema, body, 'newsletter request');
  await checkCaptcha(deps, req.turnstile, ip);

  const payload: NewsletterToken = {
    m: req.email,
    l: req.locale,
    e: expiresIn(deps.now(), NEWSLETTER_TOKEN_TTL_SECONDS),
  };
  const token = await signToken(payload, secret);
  const site = deps.env.SITE_URL.replace(/\/+$/, '');
  const email = renderNewsletterConfirmation({
    locale: req.locale,
    url: `${site}/api/newsletter/confirm?t=${token}`,
    welcomeCode: features.newsletterWelcomeCode,
  });
  try {
    await deps.mailer.send({
      to: req.email,
      ...email,
      ...(deps.env.ORDER_EMAIL_TO ? { replyTo: deps.env.ORDER_EMAIL_TO } : {}),
      idempotencyKey: `newsletter:${crypto.randomUUID()}`,
    });
  } catch (err) {
    // A refused address answers like a sent one: the endpoint never tells which addresses work.
    if (isPermanentMailError(err)) {
      logError('newsletter.mail_refused', { to: maskEmail(req.email), error: describeError(err) });
      return;
    }
    logError('newsletter.mail_failed', { error: describeError(err) });
    throw new ApiError(502, 'MAIL_FAILED', 'The confirmation e-mail could not be sent');
  }
  logInfo('newsletter.requested', { locale: req.locale });
}

function isNewsletterToken(value: unknown): value is NewsletterToken {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.m === 'string' && emailField.safeParse(v.m).success && isLocaleValue(v.l);
}

/** The redirect target of a confirmation link (303 to the static newsletter page). */
export async function confirmNewsletter(
  token: string | undefined,
  deps: AppDeps,
  loadCatalog: () => Promise<WorkerCatalog>,
): Promise<string> {
  const secret = deps.env.FORMS_SECRET;
  if (!secret) throw featureDisabled('FORMS_SECRET');
  if (!deps.audience) throw featureDisabled('RESEND_AUDIENCE_ID');
  if (!(await loadCatalog()).features.newsletter) throw switchedOff();
  const site = deps.env.SITE_URL;
  const payload = await verifyToken<unknown>(token, secret, deps.now());
  if (!isNewsletterToken(payload)) {
    // Unverified, only to answer in the reader's language.
    const peeked = peekToken(token)?.l;
    return newsletterPage(site, isLocaleValue(peeked) ? peeked : 'fr', 'invalid');
  }
  try {
    await deps.audience.addContact(payload.m);
  } catch (err) {
    logError('newsletter.contact_failed', { to: maskEmail(payload.m), error: describeError(err) });
    return newsletterPage(site, payload.l, 'error');
  }
  logInfo('newsletter.confirmed', { locale: payload.l });
  return newsletterPage(site, payload.l, 'ok');
}
