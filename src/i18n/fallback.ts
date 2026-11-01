/**
 * Fill empty strings, empty arrays and missing keys from the fallback,
 * recursively. Pure: vitest imports it without the Astro runtime.
 */
export function deepFallback<T>(value: T, fallback: T): T {
  if (typeof value === 'string') return (value.trim() === '' ? fallback : value) as T;
  if (Array.isArray(value)) {
    if (value.length === 0) return fallback;
    const fb = Array.isArray(fallback) ? fallback : [];
    return value.map((v, i) => deepFallback(v, (fb[i] ?? v) as typeof v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const fb = (fallback ?? {}) as Record<string, unknown>;
    const src = value as Record<string, unknown>;
    for (const key of new Set([...Object.keys(fb), ...Object.keys(src)])) {
      out[key] = deepFallback(src[key] ?? fb[key], fb[key]);
    }
    return out as T;
  }
  return (value ?? fallback) as T;
}

/** A settings label `{ fr, en }` in one locale; an empty translation falls back to French. */
export function pickLabel(label: { fr: string; en: string }, locale: 'fr' | 'en'): string {
  const value = label[locale];
  return value && value.trim() !== '' ? value : label.fr;
}

/**
 * Replace `{name}` tokens with the matching value. Unknown tokens stay as they
 * are, so a build test can catch them.
 */
export function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{([a-zA-Z][\w]*)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** interpolate() for rendered HTML: every value is escaped first. */
export function interpolateHtml(html: string, vars: Record<string, string | number>): string {
  const escaped = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, escapeHtml(String(v))]),
  );
  return interpolate(html, escaped);
}
