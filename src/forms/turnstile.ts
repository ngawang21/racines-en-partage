// Cloudflare Turnstile (spec iteration 3, 2.3) for the contact, newsletter and
// stock-alert forms. Only forms rendered with `data-turnstile-sitekey` (the
// settings key is set) use it: the script loads once, on the first focus of
// such a form, and each form gets its own widget in its `[data-turnstile]`
// box. The CSP allows https://challenges.cloudflare.com in script-src and
// frame-src (public/_headers).

export const TURNSTILE_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileOptions {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: 'light' | 'dark' | 'auto';
  appearance?: 'always' | 'execute' | 'interaction-only';
  size?: 'normal' | 'flexible' | 'compact';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => boolean | void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi | null> | null = null;

/** Injects the script once; resolves null when it cannot load (blocked, offline). */
export function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.addEventListener('load', () => resolve(window.turnstile ?? null), { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        loader = null;
        resolve(null);
      },
      { once: true },
    );
    document.head.append(script);
  });
  return loader;
}

export interface TurnstileWidget {
  /** The current token, waiting for the challenge up to `timeoutMs`; '' when none. */
  token(timeoutMs?: number): Promise<string>;
  /** Tokens are single use: ask for a new one after each submission. */
  reset(): void;
}

export function mountTurnstile(
  container: HTMLElement,
  siteKey: string,
  options: { action: string; language: string },
): TurnstileWidget {
  let current = '';
  let failed = false;
  let waiters: Array<(token: string) => void> = [];
  const settle = (token: string) => {
    const list = waiters;
    waiters = [];
    for (const resolve of list) resolve(token);
  };

  let widgetId: string | undefined;
  const ready = loadTurnstile().then((api) => {
    if (!api) {
      failed = true;
      settle('');
      return null;
    }
    widgetId = api.render(container, {
      sitekey: siteKey,
      action: options.action,
      language: options.language,
      theme: 'light',
      appearance: 'interaction-only',
      size: 'flexible',
      callback: (token) => {
        current = token;
        settle(token);
      },
      'expired-callback': () => {
        current = '';
      },
      'error-callback': () => {
        current = '';
        settle('');
        // Handled: Turnstile retries by itself and the Worker answers CAPTCHA_FAILED.
        return true;
      },
    });
    return api;
  });

  return {
    token(timeoutMs = 10_000) {
      if (current) return Promise.resolve(current);
      if (failed) return Promise.resolve('');
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          waiters = waiters.filter((w) => w !== done);
          resolve('');
        }, timeoutMs);
        const done = (token: string) => {
          window.clearTimeout(timer);
          resolve(token);
        };
        waiters.push(done);
      });
    },
    reset() {
      current = '';
      void ready.then((api) => {
        if (api && widgetId !== undefined) api.reset(widgetId);
      });
    },
  };
}
