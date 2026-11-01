// A small reader of Cloudflare's `_headers` file, shared by the build test
// (tests/build/headers.test.ts) and the local static server of
// scripts/relay-capture.mjs. Semantics follow Cloudflare's documentation:
// a rule is a path pattern on its own line followed by indented
// `Name: value` lines; `*` matches any run of characters (the empty one
// included); every matching rule applies, in file order; `! Name` removes a
// header set by an earlier matching rule.

/**
 * @typedef {{ name: string, value: string }} HeaderSet
 * @typedef {{ pattern: string, detach: string[], set: HeaderSet[] }} HeaderRule
 */

/**
 * @param {string} text the content of `_headers`
 * @returns {HeaderRule[]}
 */
export function parseHeaders(text) {
  /** @type {HeaderRule[]} */
  const rules = [];
  /** @type {HeaderRule | null} */
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), detach: [], set: [] };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error(`_headers: header line before any path: ${raw.trim()}`);
    const line = raw.trim();
    if (line.startsWith('!')) {
      current.detach.push(line.slice(1).trim().toLowerCase());
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 1) throw new Error(`_headers: malformed line: ${line}`);
    current.set.push({
      name: line.slice(0, colon).trim().toLowerCase(),
      value: line.slice(colon + 1).trim(),
    });
  }
  return rules;
}

/**
 * @param {string} pattern a `_headers` path pattern ("/commande/*")
 * @param {string} path a URL path ("/commande/")
 */
export function matchesPattern(pattern, path) {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(path);
}

/**
 * Headers Cloudflare would send for `path`, as name to list of values (a
 * header set by two rules without a "!" in between ends up with two values).
 * @param {HeaderRule[]} rules
 * @param {string} path
 * @returns {Map<string, string[]>}
 */
export function headersFor(rules, path) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const rule of rules) {
    if (!matchesPattern(rule.pattern, path)) continue;
    for (const name of rule.detach) out.delete(name);
    for (const { name, value } of rule.set) out.set(name, [...(out.get(name) ?? []), value]);
  }
  return out;
}

/**
 * "default-src 'self'; script-src 'self' https://a" to a map of directive to
 * sources.
 * @param {string} policy
 * @returns {Map<string, string[]>}
 */
export function parseCsp(policy) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), sources);
  }
  return out;
}
