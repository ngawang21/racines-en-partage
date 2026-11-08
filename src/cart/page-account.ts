// Customer space (spec iteration 3, 8.6). States: `loading`, `out` (the
// sign-in form, enhanced by src/forms/forms.ts) and `in` (greeting, logout,
// order cards). A ?t= sign-in token, already removed from the address by
// ui.ts, is traded for the session cookie; without one the page asks for the
// orders directly (the cookie lasts 30 days) and a 401 means "logged out". A
// refused token (opened twice, older than 15 minutes) never hides a valid
// cookie: the page then asks for the orders, and says "link expired" only when
// the cookie does not open the space either.
import { addOutcome } from './add-outcome';
import { linesToCart } from './reorder';
import {
  ERROR_KEY,
  accountFailure,
  getAccountOrders,
  postJson,
  type AccountOrder,
  type ApiError,
} from './api';
import type { CartContext } from './context';
import { readJson, stampIds } from './dom';
import { renderOrder } from './order-view';
import { formatDate } from '../i18n/format';

interface AccountStrings {
  greeting: string;
  orderDate: string;
  reordered: string;
  reorderedCapped: string;
  reorderMissing: string;
  reorderNone: string;
  reorderOf: string;
  reviewOf: string;
  alreadyReviewed: string;
  expired: string;
  loadFailed: string;
  signingIn: string;
  loading: string;
  loggedOut: string;
}

type State = 'loading' | 'out' | 'in';

export function initAccount(ctx: CartContext, token: string | null): void {
  const root = document.querySelector<HTMLElement>('[data-account]');
  const as = readJson<AccountStrings>('rep-account-strings');
  const tt = ctx.t.thanks;
  if (!root || !as || !tt) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const loading = q<HTMLElement>('[data-account-loading]');
  const notice = q<HTMLElement>('[data-account-notice]');
  const greeting = q<HTMLElement>('[data-account-greeting]');
  const list = q<HTMLElement>('[data-account-orders]');
  const empty = q<HTMLElement>('[data-account-empty]');
  const failure = q<HTMLElement>('[data-account-error]');
  const template = root.querySelector<HTMLTemplateElement>('template[data-account-order]');
  const heading = q<HTMLElement>('h1');
  const form = root.querySelector<HTMLFormElement>('form[data-form="account_login"]');
  if (!list || !template) return;

  const errorText = (error: ApiError) => {
    const te = ctx.t.errors;
    const key = ERROR_KEY[error.code] as keyof NonNullable<typeof te>;
    return (te && te[key]) || te?.generic || '';
  };

  const show = (state: State, message = '') => {
    if (state === 'loading') root.setAttribute('aria-busy', 'true');
    else root.removeAttribute('aria-busy');
    for (const el of root.querySelectorAll<HTMLElement>('[data-account-state]'))
      el.hidden = el.dataset.accountState !== state;
    if (loading) loading.textContent = state === 'loading' ? message : '';
    if (notice) {
      notice.textContent = state === 'out' ? message : '';
      notice.hidden = !(state === 'out' && message);
    }
  };

  // The failure message lives in a polite live region next to the orders
  // list; it is filled a moment after the signed-in view shows, so screen
  // readers announce it rather than skip a region that just appeared.
  let failureTimer: number | undefined;
  const setFailure = (message: string) => {
    window.clearTimeout(failureTimer);
    if (!failure) return;
    failure.textContent = '';
    if (message)
      failureTimer = window.setTimeout(() => {
        failure.textContent = message;
      }, 60);
  };

  /** Removes every personal detail from the page (logout, leaving the page). */
  const clear = () => {
    list.replaceChildren();
    if (greeting) greeting.textContent = '';
    if (empty) empty.hidden = true;
    setFailure('');
    form?.reset();
  };

  const loggedOut = (message = '', kind: 'info' | 'error' = 'error') => {
    clear();
    notice?.classList.toggle('notice--error', kind === 'error');
    show('out', message);
  };

  const buildCard = (order: AccountOrder, index: number): DocumentFragment => {
    const clone = template.content.cloneNode(true) as DocumentFragment;
    stampIds(clone, `order-${index + 1}`);
    const c = <T extends HTMLElement>(sel: string) => clone.querySelector<T>(sel);
    const set = (sel: string, text: string) => {
      const el = c<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    const number = ctx.fmt(tt.orderNumber, { number: order.number });
    set(
      '[data-o-date]',
      order.day ? ctx.fmt(as.orderDate, { date: formatDate(order.day, ctx.locale) }) : '',
    );
    set('[data-o-number]', number);
    const status = c<HTMLElement>('[data-o-status]');
    if (status) {
      status.textContent =
        order.status === 'paid'
          ? tt.statusPaid
          : order.status === 'pending'
            ? tt.statusPending
            : tt.statusUnpaid;
      status.classList.add(order.status === 'paid' ? 'badge-stock-in' : 'badge-stock-low');
    }
    set('[data-o-total]', ctx.price(order.amounts.total));
    set(
      '[data-o-delivery]',
      ctx.catalog.shipping.find((s) => s.id === order.delivery?.method)?.label ?? '',
    );
    const omitted = c<HTMLElement>('[data-o-omitted]');
    if (omitted) omitted.hidden = !order.linesOmitted;
    const details = c<HTMLElement>('[data-o-details]');
    if (details) renderOrder(details, order, ctx);

    const message = c<HTMLElement>('[data-o-message]')!;
    const reorder = c<HTMLButtonElement>('[data-o-reorder]')!;
    reorder.hidden = !ctx.shopOpen || order.lines.length === 0;
    reorder.setAttribute('aria-label', ctx.fmt(as.reorderOf, { number: order.number }));
    reorder.addEventListener('click', () => {
      const pick = linesToCart(order, ctx.catalog, ctx.store.maxQuantity);
      const quantityOf = (sku: string) =>
        ctx.store.getCart().lines.find((l) => l.sku === sku)?.quantity ?? 0;
      const outcomes = pick.lines.map((line) => {
        const before = quantityOf(line.sku);
        ctx.store.addLine(line.sku, line.quantity);
        return addOutcome(before, quantityOf(line.sku), line.quantity);
      });
      // The order asked for more than the per-line maximum, or the cart was
      // already near it: say so rather than "added".
      const capped = pick.capped || outcomes.some((o) => o !== 'added');
      const max = ctx.store.maxQuantity;
      const added =
        outcomes.length === 0
          ? as.reorderNone
          : outcomes.every((o) => o === 'none')
            ? ctx.fmt(ctx.t.cart.maxReached, { max })
            : capped
              ? ctx.fmt(as.reorderedCapped || as.reordered, { max })
              : as.reordered;
      const parts = [
        added,
        pick.unavailable.length > 0
          ? ctx.fmt(as.reorderMissing, { names: pick.unavailable.join(', ') })
          : '',
      ].filter(Boolean);
      message.classList.toggle('is-error', pick.unavailable.length > 0);
      message.textContent = parts.join(' ');
      if (pick.lines.length > 0) {
        ctx.openDrawer(reorder);
        ctx.announce(parts.join(' '));
      }
    });

    const review = c<HTMLButtonElement>('[data-o-review]')!;
    review.hidden = !order.reviewable;
    review.setAttribute('aria-label', ctx.fmt(as.reviewOf, { number: order.number }));
    review.addEventListener('click', async () => {
      if (review.getAttribute('aria-disabled') === 'true') return;
      review.setAttribute('aria-disabled', 'true');
      message.textContent = '';
      const result = await postJson('/api/account/review-token', { sessionId: order.id });
      review.removeAttribute('aria-disabled');
      const reviewToken = result.ok ? (result.data as { token?: unknown } | null)?.token : null;
      if (typeof reviewToken === 'string' && reviewToken) {
        window.location.assign(`${ctx.path('review')}?t=${encodeURIComponent(reviewToken)}`);
        return;
      }
      const error: ApiError = result.ok ? { code: 'UNKNOWN', status: 200, skus: [] } : result.error;
      if (error.code === 'UNAUTHENTICATED') return loggedOut();
      const already = error.code === 'ALREADY_REVIEWED';
      message.classList.toggle('is-error', !already);
      message.textContent = already ? as.alreadyReviewed : errorText(error);
    });
    return clone;
  };

  /**
   * Lists the orders. `signedInAs` is the masked e-mail of a sign-in that just
   * succeeded: a failure then is real and shows in the signed-in view. Without
   * it, a failure that does not prove a session shows the bare sign-in form.
   */
  const load = async (signedInAs: string | null = null, signedOutMessage = '') => {
    show('loading', as.loading);
    setFailure('');
    const answer = await getAccountOrders();
    if (answer.status === 'error') {
      if (accountFailure(answer.error, signedInAs !== null) === 'signed-out')
        return loggedOut(signedOutMessage);
      list.replaceChildren();
      if (empty) empty.hidden = true;
      if (greeting)
        greeting.textContent = signedInAs ? ctx.fmt(as.greeting, { email: signedInAs }) : '';
      show('in');
      setFailure(as.loadFailed);
      return;
    }
    if (greeting) greeting.textContent = ctx.fmt(as.greeting, { email: answer.email });
    list.replaceChildren(...answer.orders.map(buildCard));
    if (empty) empty.hidden = answer.orders.length > 0;
    show('in');
  };

  const signIn = async (signInToken: string) => {
    show('loading', as.signingIn);
    const result = await postJson('/api/account/session', { token: signInToken });
    if (result.ok) {
      const email = (result.data as { email?: unknown } | null)?.email;
      return load(typeof email === 'string' ? email : '');
    }
    // The token was refused (or the call failed): a valid session cookie
    // still opens the space; the message only shows if it does not.
    const code = result.error.code;
    return load(
      null,
      code === 'INVALID_TOKEN' || code === 'VALIDATION_ERROR'
        ? as.expired
        : errorText(result.error),
    );
  };

  q<HTMLButtonElement>('[data-account-logout]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.getAttribute('aria-disabled') === 'true') return;
    button.setAttribute('aria-disabled', 'true');
    // Whatever the answer, this page forgets the orders; the cookie is HttpOnly.
    await postJson('/api/account/logout', {});
    button.removeAttribute('aria-disabled');
    loggedOut(as.loggedOut, 'info');
    heading?.focus();
  });

  // Leaving the page: nothing personal stays for the back/forward cache;
  // coming back from it asks the API again (the cookie decides).
  window.addEventListener('pagehide', () => {
    clear();
    show('loading', '');
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void load();
  });

  void (token ? signIn(token) : load());
}
