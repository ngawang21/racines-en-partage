// One JSON object per line, read by Workers Logs (observability). Callers pass
// identifiers and amounts only, never names, addresses, e-mails or secrets.
type Fields = Record<string, string | number | boolean | null | undefined>;

export function logInfo(msg: string, fields: Fields = {}): void {
  console.log(JSON.stringify({ level: 'info', msg, ...fields }));
}

export function logError(msg: string, fields: Fields = {}): void {
  console.error(JSON.stringify({ level: 'error', msg, ...fields }));
}

/**
 * "marie@outlook.com" to "m***@***.com": the first character and the
 * top-level domain only. Anything that is not an address becomes "***".
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot >= 0 ? domain.slice(dot).replace(/[^\w.-]/g, '') : '';
  return `${email[0]}***@***${tld}`;
}

/** Stripe, webhook and Resend key shapes, and e-mail addresses. */
const SENSITIVE =
  /\b(?:sk|rk|pk)_(?:test|live)_[\w*]+|\bwhsec_\w+|\bre_\w{8,}|[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Strips anything that looks like a key or an e-mail address. */
export function redact(text: string): string {
  return text.replace(SENSITIVE, '[redacted]');
}

/** Name, Stripe error type when present, and message of an error, redacted, for logs. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const type = 'type' in err && typeof err.type === 'string' ? ` [${err.type}]` : '';
    return redact(`${err.name}${type}: ${err.message}`).slice(0, 300);
  }
  return redact(String(err)).slice(0, 300);
}
