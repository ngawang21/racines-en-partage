// Shared behaviour of the enhanced forms (contact, newsletter, stock alert,
// order lookup, review): inline field validation tied to each field with
// aria-describedby, a busy state that keeps the focus on the submit button,
// one polite status line per form and the API error messages.
//
// Markup contract (server-rendered by the form components):
//   <form data-form="..." novalidate>
//     <div data-form-fields> ... fields ...
//       <input id="x" aria-describedby="x-error"> <p id="x-error" data-field-error></p>
//       <button type="submit" data-form-submit>
//     </div>
//     <p data-form-status role="status"></p>        sending (polite); an error
//                                                    turns it into an alert
//     <div data-form-done tabindex="-1" hidden>      success, takes the focus
//       <p data-form-done-text>...</p>
//     </div>
//   </form>
import { ERROR_KEY, type ApiError } from '../cart/api';
import { readJson } from '../cart/dom';
import { interpolate } from '../i18n/fallback';
import type { FormStrings } from '../cart/strings';

export type { FormStrings };

export function readFormStrings(): FormStrings | null {
  return readJson<FormStrings>('rep-form-strings');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Text fields of a form that take part in validation (not the honeypot, not radios). */
export function fieldsOf(form: HTMLFormElement): Field[] {
  return [...form.querySelectorAll<Field>('input, textarea')].filter(
    (el) =>
      !el.disabled &&
      !el.hasAttribute('data-honeypot') &&
      el.type !== 'radio' &&
      el.type !== 'hidden' &&
      !el.closest('[data-turnstile]'),
  );
}

/** The message for one field, or '' when it is valid. */
export function fieldMessage(el: Field, s: FormStrings): string {
  const value = el.value.trim();
  if (value === '') return el.required ? s.forms.required : '';
  if (el.type === 'email' && !EMAIL.test(value)) return s.forms.emailInvalid;
  const min = el.minLength;
  if (min > 0 && value.length < min) return interpolate(s.forms.tooShort, { min });
  const max = el.maxLength;
  if (max > 0 && value.length > max) return interpolate(s.forms.tooLong, { max });
  return '';
}

function errorElementOf(el: Element): HTMLElement | null {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/);
  for (const id of ids) {
    const node = id ? document.getElementById(id) : null;
    if (node?.hasAttribute('data-field-error')) return node;
  }
  return null;
}

export function setFieldError(el: Element, message: string): void {
  if (message) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
  const error = errorElementOf(el);
  if (error) error.textContent = message;
}

/** Validates every field; returns the first invalid one (focused by the caller). */
export function validateFields(form: HTMLFormElement, s: FormStrings): HTMLElement | null {
  let first: HTMLElement | null = null;
  for (const el of fieldsOf(form)) {
    const message = fieldMessage(el, s);
    setFieldError(el, message);
    if (message && !first) first = el;
  }
  return first;
}

/**
 * Once a field has shown an error, it is re-checked as the customer types, so
 * the message goes away as soon as the value is right (never earlier: no error
 * while typing a first time).
 */
export function liveRevalidation(form: HTMLFormElement, s: FormStrings): void {
  form.addEventListener('input', (event) => {
    const el = event.target as Field;
    if (el.getAttribute?.('aria-invalid') === 'true' && fieldsOf(form).includes(el))
      setFieldError(el, fieldMessage(el, s));
  });
}

/**
 * The status line under a form. Information (sending) is polite; an error is
 * an alert that takes the focus and scrolls into view (review 14: a failure
 * below the fold was announced but never seen). `email`, when given, becomes
 * a mailto link wherever the message prints it.
 */
export function setStatus(
  form: HTMLElement,
  text: string,
  kind: 'info' | 'error' = 'info',
  email?: string,
): void {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  if (!status) return;
  const error = kind === 'error' && text !== '';
  status.classList.toggle('is-error', kind === 'error');
  status.setAttribute('role', error ? 'alert' : 'status');
  if (email && error && text.includes(email)) {
    const parts = text.split(email);
    const nodes: Array<Node | string> = [];
    parts.forEach((part, index) => {
      if (index > 0) {
        const link = document.createElement('a');
        link.href = `mailto:${email}`;
        link.textContent = email;
        nodes.push(link);
      }
      if (part) nodes.push(part);
    });
    status.replaceChildren(...nodes);
  } else {
    status.textContent = text;
  }
  if (!error) return;
  status.tabIndex = -1;
  status.focus({ preventScroll: true });
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  status.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
}

/** Busy: aria-disabled (not disabled, which would drop the focus) and a status line. */
export function setBusy(form: HTMLFormElement, busy: boolean, s: FormStrings): void {
  if (busy) form.setAttribute('aria-busy', 'true');
  else form.removeAttribute('aria-busy');
  for (const btn of form.querySelectorAll<HTMLButtonElement>('[data-form-submit]')) {
    if (busy) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }
  if (busy) setStatus(form, s.forms.sending);
}

export const isBusy = (form: HTMLFormElement): boolean => form.hasAttribute('aria-busy');

/**
 * Errors that only mean "it did not go through": nothing for the customer to
 * correct. The contact, newsletter, stock alert and sign-in forms then say so
 * in plain words, with the shop's address (`forms.sendFailed`).
 */
const NOT_SENT = new Set(['generic', 'mailFailed', 'unavailable', 'payment']);

/**
 * The customer-facing message of an API error, in the form's words. With
 * `sendFailed`, a failure the customer cannot fix reads "Nous n’avons pas pu
 * envoyer votre message. Réessayez dans un instant, ou écrivez‑nous
 * directement à {email}." rather than the generic error.
 */
export function errorMessage(
  error: ApiError,
  s: FormStrings,
  options: { sendFailed?: boolean } = {},
): string {
  if (error.code === 'VALIDATION_ERROR' || error.code === 'PAYLOAD_TOO_LARGE')
    return s.forms.validation;
  const key = ERROR_KEY[error.code] as keyof FormStrings['errors'];
  if (options.sendFailed && s.forms.sendFailed && (NOT_SENT.has(key) || !s.errors[key]))
    return interpolate(s.forms.sendFailed, { email: s.email });
  return s.errors[key] || s.errors.generic;
}

/** Success: the fields go, the success text appears and takes the focus. */
export function showDone(form: HTMLElement, text?: string): void {
  const fields = form.querySelector<HTMLElement>('[data-form-fields]');
  const done = form.querySelector<HTMLElement>('[data-form-done]');
  setStatus(form, '');
  if (!done) return;
  if (text) (done.querySelector<HTMLElement>('[data-form-done-text]') ?? done).textContent = text;
  if (fields) fields.hidden = true;
  done.hidden = false;
  done.focus();
}

export function value(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value.trim() : '';
}

/** The honeypot as typed (bots fill it); the Worker drops the message when it is not empty. */
export function honeypot(form: HTMLFormElement): string {
  return form.querySelector<HTMLInputElement>('[data-honeypot]')?.value ?? '';
}
