// Order lookup page (spec iteration 3, 2.6): posts the order number and the
// e-mail to POST /api/orders/lookup and renders the answer with the thanks
// page renderer (src/cart/order-view.ts).
import {
  errorMessage,
  isBusy,
  liveRevalidation,
  readFormStrings,
  setBusy,
  setFieldError,
  setStatus,
  validateFields,
  value,
} from '../forms/kit';
import { lookupOrder } from './api';
import type { CartContext } from './context';
import { renderOrder } from './order-view';

export function initLookup(ctx: CartContext): void {
  const root = document.querySelector<HTMLElement>('[data-lookup]');
  const form = root?.querySelector<HTMLFormElement>('[data-lookup-form]');
  const search = root?.querySelector<HTMLElement>('[data-lookup-search]');
  const result = root?.querySelector<HTMLElement>('[data-lookup-result]');
  const s = readFormStrings();
  if (!root || !form || !search || !result || !s || !ctx.t.thanks) return;
  form.noValidate = true;
  liveRevalidation(form, s);
  // The static shell, restored when the page is left (see pagehide below).
  const blank = result.innerHTML;

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
    setStatus(form, form.dataset.searching ?? s.forms.sending);
    const answer = await lookupOrder(value(form, 'number'), value(form, 'email'));
    setBusy(form, false, s);
    if (answer.status === 'error') {
      setStatus(form, errorMessage(answer.error, s), 'error');
      return;
    }
    setStatus(form, '');
    renderOrder(result, answer.order, ctx);
    search.hidden = true;
    result.hidden = false;
    // The order number and its status are read first.
    result.querySelector<HTMLElement>('[data-thanks-number]')?.focus();
  });

  const showForm = () => {
    result.hidden = true;
    search.hidden = false;
  };
  // Delegated: the result's content is replaced on pagehide.
  result.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('[data-lookup-again]')) return;
    showForm();
    form.querySelector<HTMLInputElement>('input[name="number"]')?.focus();
  });

  // Leaving the page: no order, number or address may come back from the
  // back/forward cache on a shared device.
  window.addEventListener('pagehide', () => {
    form.reset();
    for (const el of form.querySelectorAll('[aria-invalid]')) setFieldError(el, '');
    setStatus(form, '');
    result.innerHTML = blank;
    showForm();
  });
}
