// Contact, newsletter and stock-alert forms (spec iteration 3, 2.2 and 2.3).
// Plain HTML forms rendered by src/components/forms/*.astro; this module,
// loaded on demand by src/cart/ui.ts when a `form[data-form]` exists, posts
// them as JSON to the Worker and shows the answer inline. It also reads the
// ?status= of the newsletter landing page.
import { postJson } from '../cart/api';
import {
  errorMessage,
  honeypot,
  isBusy,
  liveRevalidation,
  readFormStrings,
  setBusy,
  setStatus,
  showDone,
  validateFields,
  value,
  type FormStrings,
} from './kit';
import { mountTurnstile, type TurnstileWidget } from './turnstile';

type Kind = 'contact' | 'newsletter' | 'stock_alert';
const KINDS: readonly Kind[] = ['contact', 'newsletter', 'stock_alert'];

const ENDPOINT: Record<Kind, string> = {
  contact: '/api/contact',
  stock_alert: '/api/contact',
  newsletter: '/api/newsletter',
};

function pageLocale(): 'fr' | 'en' {
  return document.body.dataset.locale === 'en' ? 'en' : 'fr';
}

/** The request body of each kind (the Worker contract of spec section 5). */
export function bodyOf(kind: Kind, form: HTMLFormElement, locale: 'fr' | 'en') {
  if (kind === 'newsletter') return { email: value(form, 'email'), locale };
  if (kind === 'stock_alert')
    return {
      kind,
      locale,
      name: '',
      email: value(form, 'email'),
      sku: form.dataset.sku ?? '',
      website: honeypot(form),
    };
  return {
    kind,
    locale,
    name: value(form, 'name'),
    email: value(form, 'email'),
    message: value(form, 'message'),
    website: honeypot(form),
  };
}

function enhance(form: HTMLFormElement, kind: Kind, s: FormStrings): void {
  const locale = pageLocale();
  form.noValidate = true;
  liveRevalidation(form, s);

  // Turnstile: only when the page was built with a site key.
  const siteKey = form.dataset.turnstileSitekey;
  const box = form.querySelector<HTMLElement>('[data-turnstile]');
  let widget: TurnstileWidget | null = null;
  const ensureWidget = () => {
    if (!widget && siteKey && box)
      widget = mountTurnstile(box, siteKey, { action: kind.replace('_', '-'), language: locale });
    return widget;
  };
  if (siteKey && box) form.addEventListener('focusin', () => ensureWidget(), { once: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isBusy(form)) return;
    const invalid = validateFields(form, s);
    if (invalid) {
      setStatus(form, '');
      invalid.focus();
      return;
    }
    setBusy(form, true, s);
    const body: Record<string, unknown> = bodyOf(kind, form, locale);
    const w = ensureWidget();
    if (w) {
      const token = await w.token();
      if (token) body.turnstile = token;
    }
    const result = await postJson(ENDPOINT[kind], body);
    w?.reset();
    setBusy(form, false, s);
    if (result.ok) {
      form.reset();
      showDone(form);
      return;
    }
    setStatus(form, errorMessage(result.error, s), 'error');
  });
}

/** /newsletter/?status=ok|invalid: shows the matching message, hides the others. */
function initLanding(root: HTMLElement): void {
  const status = new URLSearchParams(window.location.search).get('status');
  const shown = status === 'ok' || status === 'invalid' ? status : 'none';
  for (const el of root.querySelectorAll<HTMLElement>('[data-landing-when]')) {
    const when = (el.dataset.landingWhen ?? '').split(/\s+/);
    el.hidden = !when.includes(shown);
  }
}

export function initForms(): void {
  const landing = document.querySelector<HTMLElement>('[data-newsletter-landing]');
  if (landing) initLanding(landing);
  const s = readFormStrings();
  if (!s) return;
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-form]')) {
    const kind = form.dataset.form as Kind;
    if (KINDS.includes(kind) && !form.dataset.enhanced) {
      form.dataset.enhanced = 'true';
      enhance(form, kind, s);
    }
  }
}
