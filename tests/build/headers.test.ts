// dist/_headers (copied from public/_headers): the strict global CSP, the two
// checkout relaxations limited to the hosts the Mondial Relay loader names,
// and the admin block pinned to the Sveltia version of public/admin/index.html.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  JQUERY_URL,
  LEAFLET_CSS_URL,
  LEAFLET_JS_URL,
  PLUGIN_URL,
  REMOTE_HOSTS,
} from '../../src/cart/relay-widget';
import { headersFor, parseCsp, parseHeaders } from '../../scripts/lib/headers.mjs';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const text = readFileSync(join(dist, '_headers'), 'utf8');
const rules = parseHeaders(text);

const CSP = 'content-security-policy';
const CHECKOUT_PATTERNS = ['/commande/*', '/en/checkout/*'];
const CHECKOUT_PATHS = ['/commande/', '/en/checkout/'];

/** Sources of a directive without keywords and schemes ('self', 'unsafe-inline', data:). */
const hostsOf = (sources: string[] = []) => sources.filter((s) => s.startsWith('https://')).sort();

/** The raw header lines of a rule, in file order. */
function rawBlock(pattern: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === pattern && !/^\s/.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    out.push(line.trim());
  }
  return out;
}

function ruleCsp(pattern: string): Map<string, string[]> {
  const rule = rules.find((r) => r.pattern === pattern);
  expect(rule, pattern).toBeDefined();
  const csp = rule!.set.filter((h) => h.name === CSP);
  expect(csp, `${pattern}: one CSP`).toHaveLength(1);
  return parseCsp(csp[0]!.value);
}

describe('dist/_headers', () => {
  it('global block: script-src is self only, HSTS covers subdomains', () => {
    const csp = ruleCsp('/*');
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    const hsts = rules
      .find((r) => r.pattern === '/*')!
      .set.find((h) => h.name === 'strict-transport-security');
    expect(hsts?.value).toBe('max-age=31536000; includeSubDomains');
  });

  it('jQuery and Leaflet are same-origin files of the build; only the plugin is remote', () => {
    for (const url of [JQUERY_URL, LEAFLET_JS_URL, LEAFLET_CSS_URL]) {
      expect(url).toMatch(/^\/vendor\//);
      expect(existsSync(join(dist, url)), url).toBe(true);
    }
    for (const image of ['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-shadow.png']) {
      expect(existsSync(join(dist, 'vendor/leaflet/images', image)), image).toBe(true);
    }
    expect(REMOTE_HOSTS['script-src']).toContain(new URL(PLUGIN_URL).origin);
  });

  for (const pattern of CHECKOUT_PATTERNS) {
    it(`${pattern}: detaches the global CSP first, then allows exactly REMOTE_HOSTS`, () => {
      const lines = rawBlock(pattern);
      expect(lines[0]).toBe('! Content-Security-Policy');
      const csp = ruleCsp(pattern);
      expect(csp.get('script-src')![0]).toBe("'self'");
      expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
      expect(csp.get('script-src')).not.toContain("'unsafe-eval'");
      const expected = REMOTE_HOSTS as Record<string, readonly string[]>;
      for (const [directive, sources] of csp) {
        expect(hostsOf(sources), directive).toEqual([...(expected[directive] ?? [])].sort());
      }
      for (const directive of Object.keys(expected)) {
        expect(csp.has(directive), directive).toBe(true);
      }
      expect(csp.get('default-src')).toEqual(["'self'"]);
      expect(csp.get('form-action')).toEqual(["'none'"]);
    });
  }

  it('admin block: detaches the global CSP and allows the pinned Sveltia script and its unpkg helpers', () => {
    const lines = rawBlock('/admin/*');
    expect(lines[0]).toBe('! Content-Security-Policy');
    const page = readFileSync(join(dist, 'admin/index.html'), 'utf8');
    const src = /<script\s+src="(https:\/\/unpkg\.com\/@sveltia\/cms@\d+\.\d+\.\d+\/[^"]+)"/.exec(
      page,
    )?.[1];
    expect(src).toBeDefined();
    expect(page).toMatch(/integrity="sha384-[A-Za-z0-9+/=]{64}"/);
    expect(page).toContain('crossorigin="anonymous"');
    const scriptSrc = ruleCsp('/admin/*').get('script-src')!;
    expect(scriptSrc[0]).toBe("'self'");
    const remote = scriptSrc.slice(1);
    // The whole unpkg host: after sign-in Sveltia imports helper packages
    // (image encoders, date locales) from other unpkg paths. The main script
    // itself stays pinned by version and integrity in the admin page.
    expect(remote).toEqual(['https://unpkg.com']);
    expect(src!.startsWith('https://unpkg.com/@sveltia/cms@')).toBe(true);
  });

  it('each route gets exactly its own policy', () => {
    const one = (path: string) => {
      const values = headersFor(rules, path).get(CSP) ?? [];
      expect(values, path).toHaveLength(1);
      return values[0]!;
    };
    const globalCsp = rules.find((r) => r.pattern === '/*')!.set.find((h) => h.name === CSP)!;
    const checkoutCsp = rules
      .find((r) => r.pattern === '/commande/*')!
      .set.find((h) => h.name === CSP)!;
    const adminCsp = rules.find((r) => r.pattern === '/admin/*')!.set.find((h) => h.name === CSP)!;
    for (const path of CHECKOUT_PATHS) expect(one(path), path).toBe(checkoutCsp.value);
    expect(one('/admin/')).toBe(adminCsp.value);
    for (const path of ['/', '/boutique/', '/en/', '/merci/', '/panier/']) {
      expect(one(path), path).toBe(globalCsp.value);
    }
    // Two identical checkout blocks.
    const en = rules.find((r) => r.pattern === '/en/checkout/*')!.set.find((h) => h.name === CSP)!;
    expect(en.value).toBe(checkoutCsp.value);
  });
});
