// Bearer links (review invitation, newsletter confirmation, customer space
// sign-in) carry their token in `?t=`. The cart entry reads it synchronously,
// before any page module or the analytics beacon runs, keeps it in memory and
// removes it from the address bar.
//
// The language pill links get the original query first, so switching language
// keeps a review or newsletter token (the page is useless without it). The
// customer space is the exception: its sign-in token is single use in spirit
// and short lived, the session cookie carries the visit, so the pill links
// get the query without it (a replay after 15 minutes would only show
// "link expired").

/** Copies `search` into the language pill links (`a[hreflang]`). */
export function carryQueryToLanguageLinks(search: string): void {
  if (!search || search === '?') return;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[hreflang]')) {
    try {
      const url = new URL(link.href);
      url.search = search;
      // Keep same-origin links root-relative, as rendered.
      link.setAttribute(
        'href',
        url.origin === window.location.origin
          ? `${url.pathname}${url.search}${url.hash}`
          : url.href,
      );
    } catch {
      // A malformed href: leave it.
    }
  }
}

export interface TakeTokenOptions {
  /** Copy the token into the language pill links too (default true). */
  keepInLanguageLinks?: boolean;
}

export function takeUrlToken(param = 't', options: TakeTokenOptions = {}): string | null {
  const search = window.location.search;
  if (!search) return null;
  const params = new URLSearchParams(search);
  const token = params.get(param);
  params.delete(param);
  const rest = params.toString();
  carryQueryToLanguageLinks(
    options.keepInLanguageLinks === false ? (rest ? `?${rest}` : '') : search,
  );
  if (token === null) return null;
  try {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
    );
  } catch {
    // History refused (sandboxed frame): the token stays in the address.
  }
  return token;
}
