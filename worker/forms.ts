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
import { NullMailer } from './email/resend';
import { expiresIn, signToken, verifyToken } from './tokens';
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
  /** Token type: a review token cannot confirm a subscription. */
  t: 'newsletter';
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

/** Refuses a form that would send e-mail without Turnstile in production. */
export function requireCaptchaSetup(deps: AppDeps, form: string): void {
  if (deps.captcha === null) {
    logError('config.missing', { name: 'TURNSTILE_SECRET_KEY', form });
    throw new ApiError(404, 'FEATURE_DISABLED', 'This feature is not enabled');
  }
}

export async function checkCaptcha(deps: AppDeps, token: string | undefined, ip: string | null) {
  if (!deps.captcha) return;
  if (!(await deps.captcha.verify(token, ip))) {
    throw new ApiError(400, 'CAPTCHA_FAILED', 'Captcha check failed');
  }
}

/** One unit of the daily e-mail budget, or 429 once it is spent. */
export async function takeBudget(deps: AppDeps, form: string): Promise<void> {
  if (!deps.budget || (await deps.budget.take())) return;
  logError('forms.budget_exhausted', { form });
  throw new ApiError(429, 'RATE_LIMITED', 'Daily form limit reached, try again tomorrow');
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
  // The message would only be logged: better to say the form is off.
  if (deps.mailer instanceof NullMailer) throw featureDisabled('RESEND_API_KEY');
  requireCaptchaSetup(deps, 'contact');
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
  await takeBudget(deps, req.kind);
  try {
    await deps.mailer.send({
      to,
      ...email,
      replyTo: req.email,
      idempotencyKey: `${req.kind}:${crypto.randomUUID()}`,
      template: req.kind,
    });
  } catch (err) {
    logError('contact.mail_failed', { kind: req.kind, error: describeError(err) });
    throw new ApiError(502, 'MAIL_FAILED', 'The message could not be sent');
  }
  logInfo('contact.sent', { kind: req.kind, locale: req.locale, sku: req.sku ?? null });
}

/** The confirmation link: the static newsletter page, which posts the token back. */
export function newsletterConfirmUrl(siteUrl: string, locale: Locale, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${ROUTES.newsletter[locale]}?t=${token}`;
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
  requireCaptchaSetup(deps, 'newsletter');
  if (isHoneypotFilled(body)) {
    logInfo('newsletter.honeypot');
    return;
  }
  const req = parseBody(newsletterRequestSchema, body, 'newsletter request');
  await checkCaptcha(deps, req.turnstile, ip);
  await takeBudget(deps, 'newsletter');

  const payload: NewsletterToken = {
    t: 'newsletter',
    m: req.email,
    l: req.locale,
    e: expiresIn(deps.now(), NEWSLETTER_TOKEN_TTL_SECONDS),
  };
  const token = await signToken(payload, secret);
  const email = renderNewsletterConfirmation({
    locale: req.locale,
    url: newsletterConfirmUrl(deps.env.SITE_URL, req.locale, token),
    welcomeCode: features.newsletterWelcomeCode,
  });
  try {
    await deps.mailer.send({
      to: req.email,
      ...email,
      ...(deps.env.ORDER_EMAIL_TO ? { replyTo: deps.env.ORDER_EMAIL_TO } : {}),
      idempotencyKey: `newsletter:${crypto.randomUUID()}`,
      template: 'newsletter_confirmation',
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
  return (
    v.t === 'newsletter' &&
    typeof v.m === 'string' &&
    emailField.safeParse(v.m).success &&
    isLocaleValue(v.l)
  );
}

export const confirmRequestSchema = z.object({ token: z.string().min(1).max(4096) });

/**
 * POST /api/newsletter/confirm `{ token }`, sent by the static newsletter
 * page when the person clicks the button (a link scanner opening the e-mail
 * link subscribes nobody). Resolves once the address is in the audience.
 */
export async function confirmNewsletter(
  body: unknown,
  deps: AppDeps,
  loadCatalog: () => Promise<WorkerCatalog>,
): Promise<void> {
  const secret = deps.env.FORMS_SECRET;
  if (!secret) throw featureDisabled('FORMS_SECRET');
  if (!deps.audience) throw featureDisabled('RESEND_AUDIENCE_ID');
  if (!(await loadCatalog()).features.newsletter) throw switchedOff();
  const { token } = parseBody(confirmRequestSchema, body, 'confirmation');
  const payload = await verifyToken<unknown>(token, secret, deps.now());
  if (!isNewsletterToken(payload)) {
    throw new ApiError(400, 'INVALID_TOKEN', 'Invalid or expired link');
  }
  try {
    await deps.audience.addContact(payload.m);
  } catch (err) {
    logError('newsletter.contact_failed', { to: maskEmail(payload.m), error: describeError(err) });
    throw new ApiError(502, 'MAIL_FAILED', 'The subscription could not be saved');
  }
  logInfo('newsletter.confirmed', { locale: payload.l });
}
