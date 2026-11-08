// Bearer links (review invitation, newsletter confirmation) carry their token
// in `?t=`. The cart entry reads it synchronously, before any page module or
// the analytics beacon runs, keeps it in memory and removes it from the
// address bar. The language pill links get the original query first, so
// switching language keeps the token.

export function takeUrlToken(param = 't'): string | null {
  const search = window.location.search;
  if (!search) return null;
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
  const params = new URLSearchParams(search);
  const token = params.get(param);
  if (token === null) return null;
  params.delete(param);
  const rest = params.toString();
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
