// Order lookup page (spec iteration 3, 2.6): posts the order number and the
// e-mail to POST /api/orders/lookup and renders the answer with the thanks
// page renderer (src/cart/order-view.ts).
import {
  errorMessage,
  isBusy,
  liveRevalidation,
  readFormStrings,
  setBusy,
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

  result.querySelector('[data-lookup-again]')?.addEventListener('click', () => {
    result.hidden = true;
    search.hidden = false;
    form.querySelector<HTMLInputElement>('input[name="number"]')?.focus();
  });
}
