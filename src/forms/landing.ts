// Newsletter confirmation page (spec iteration 3, 2.2): the confirmation
// e-mail links to /newsletter/?t=<token>. The page shows a button; the click
// posts { token } to POST /api/newsletter/confirm. Without a token the page
// shows the invalid-link state. `?status=ok` (links of the first version)
// still shows the success state.
import { postJson } from '../cart/api';

type State = 'confirm' | 'ok' | 'invalid' | 'disabled';

export function initLanding(root: HTMLElement, token: string | null, status: string | null): void {
  const show = (state: State) => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-landing-when]')) {
      const when = (el.dataset.landingWhen ?? '').split(/\s+/);
      el.hidden = !when.includes(state);
    }
  };
  if (!token) {
    show(status === 'ok' ? 'ok' : 'invalid');
    return;
  }
  show('confirm');
  const button = root.querySelector<HTMLButtonElement>('[data-landing-confirm]');
  const error = root.querySelector<HTMLElement>('[data-landing-error]');
  const retry = error?.dataset.retry ?? '';
  if (!button) return;

  button.addEventListener('click', async () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    button.setAttribute('aria-disabled', 'true');
    root.setAttribute('aria-busy', 'true');
    if (error) error.textContent = '';
    const result = await postJson('/api/newsletter/confirm', { token });
    button.removeAttribute('aria-disabled');
    root.removeAttribute('aria-busy');
    const code = result.ok ? null : result.error.code;
    const next: State | null = result.ok
      ? 'ok'
      : code === 'INVALID_TOKEN' || code === 'VALIDATION_ERROR'
        ? 'invalid'
        : code === 'FEATURE_DISABLED'
          ? 'disabled'
          : null;
    if (next) {
      show(next);
      // The new state's heading is read first.
      root
        .querySelector<HTMLElement>(`[data-landing-when~="${next}"] [data-landing-focus]`)
        ?.focus();
      return;
    }
    // MAIL_FAILED, rate limit, network: the button stays for another try.
    if (error) error.textContent = retry;
  });
}
