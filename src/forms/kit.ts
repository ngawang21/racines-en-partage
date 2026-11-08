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
//     <p data-form-status role="status"></p>        polite: sending, errors
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

export function setStatus(form: HTMLElement, text: string, kind: 'info' | 'error' = 'info'): void {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  if (!status) return;
  status.classList.toggle('is-error', kind === 'error');
  status.textContent = text;
}

/** Busy: aria-disabled (not disabled, which would drop the focus) and a status line. */
export function setBusy(form: HTMLFormElement, busy: boolean, s: FormStrings): void {
  form.toggleAttribute('aria-busy', busy);
  for (const btn of form.querySelectorAll<HTMLButtonElement>('[data-form-submit]')) {
    if (busy) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }
  if (busy) setStatus(form, s.forms.sending);
}

export const isBusy = (form: HTMLFormElement): boolean => form.hasAttribute('aria-busy');

/** The customer-facing message of an API error, in the form's words. */
export function errorMessage(error: ApiError, s: FormStrings): string {
  if (error.code === 'VALIDATION_ERROR' || error.code === 'PAYLOAD_TOO_LARGE')
    return s.forms.validation;
  const key = ERROR_KEY[error.code] as keyof FormStrings['errors'];
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
