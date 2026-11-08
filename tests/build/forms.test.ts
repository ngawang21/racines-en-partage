// Forms and cart over dist/ (iteration 3, forms and cart): the contact,
// newsletter and stock-alert forms follow the markup src/forms/kit.ts
// enhances, the footer links, the new pages, the cross-sell shells, and no
// third-party script is referenced while the settings leave the keys empty.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement } from 'node-html-parser';
import { beforeAll, describe, expect, it } from 'vitest';
import { settingsSchema } from '../../src/content/schemas';
import { routePath, type RouteKey } from '../../src/i18n/routing';
import { CONTENT, readYaml, yamlFolder } from '../unit/helpers';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const LOCALES = ['fr', 'en'] as const;
const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));
const products = [...yamlFolder('products', 'fr')].map(
  ([slug, raw]) => ({ ...(raw as Record<string, any>), slug }) as Record<string, any>,
);

const fileOf = (path: string) => `${path.slice(1)}index.html`;
const cache = new Map<string, HTMLElement>();
const doc = (path: string) => {
  let d = cache.get(path);
  if (!d) {
    d = parse(readFileSync(join(dist, fileOf(path)), 'utf8'));
    cache.set(path, d);
  }
  return d;
};
const page = (key: RouteKey, locale: (typeof LOCALES)[number]) => doc(routePath(key, locale));

beforeAll(() => {
  if (!existsSync(dist)) throw new Error('dist/ is missing: run pnpm build first');
});

/** Every text field points at its error element, which exists in the form. */
function expectDescribedErrors(form: HTMLElement, label: string) {
  for (const field of form.querySelectorAll(
    'input:not([data-honeypot]):not([type="radio"]), textarea',
  )) {
    const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    const errors = ids.filter((id) =>
      form.querySelector(`#${id}`)?.hasAttribute('data-field-error'),
    );
    expect(errors.length, `${label}: ${field.getAttribute('name')}`).toBe(1);
    const id = field.getAttribute('id');
    expect(form.querySelector(`label[for="${id}"]`), `${label}: label for ${id}`).not.toBeNull();
  }
}

function expectHoneypot(form: HTMLElement, label: string) {
  const hp = form.querySelector('input[name="website"]');
  expect(hp, label).not.toBeNull();
  expect(hp!.hasAttribute('data-honeypot')).toBe(true);
  expect(hp!.getAttribute('tabindex')).toBe('-1');
  expect(hp!.getAttribute('autocomplete')).toBe('off');
  expect(hp!.getAttribute('aria-hidden')).toBe('true');
  expect(hp!.closest('[aria-hidden="true"]')).not.toBeNull();
}

function expectFormShell(form: HTMLElement, label: string) {
  expect(form.getAttribute('novalidate'), label).not.toBeNull();
  expect(form.querySelector('[data-form-fields]'), label).not.toBeNull();
  expect(form.querySelector('[data-form-status]')?.getAttribute('role'), label).toBe('status');
  const done = form.querySelector('[data-form-done]');
  expect(done?.hasAttribute('hidden'), label).toBe(true);
  expect(done?.getAttribute('tabindex'), label).toBe('-1');
  expect(form.querySelector('button[type="submit"][data-form-submit]'), label).not.toBeNull();
  expect(form.querySelector('noscript'), `${label}: noscript note`).not.toBeNull();
  // No site key in the settings: no widget box and no key attribute.
  if (!settings.forms.turnstileSiteKey) {
    expect(form.getAttribute('data-turnstile-sitekey'), label).toBeUndefined();
    expect(form.querySelector('[data-turnstile]'), label).toBeNull();
  }
}

describe('contact form', () => {
  for (const locale of LOCALES) {
    it(`${locale}: fields, honeypot, consent with the privacy link`, () => {
      const form = page('contact', locale).querySelector('form[data-form="contact"]');
      expect(form).not.toBeNull();
      for (const name of ['name', 'email', 'message'])
        expect(form!.querySelector(`[name="${name}"][required]`), name).not.toBeNull();
      expect(form!.querySelector('input[name="email"]')?.getAttribute('type')).toBe('email');
      expectHoneypot(form!, `contact ${locale}`);
      expectFormShell(form!, `contact ${locale}`);
      expectDescribedErrors(form!, `contact ${locale}`);
      expect(form!.querySelector('.form-consent a')?.getAttribute('href')).toBe(
        routePath('privacy', locale),
      );
      // The contact cards stay next to the form.
      expect(page('contact', locale).querySelector('.contact a[href^="tel:"]')).not.toBeNull();
    });
  }
});

describe('footer', () => {
  const paths = LOCALES.flatMap((l) => [
    routePath('home', l),
    routePath('shop', l),
    routePath('cart', l),
  ]);
  it('links to the order lookup and the recipes in the shop column', () => {
    for (const path of paths) {
      const locale = path.startsWith('/en/') ? 'en' : 'fr';
      const hrefs = doc(path)
        .querySelectorAll('.site-footer nav a')
        .map((a) => a.getAttribute('href'));
      expect(hrefs, path).toContain(routePath('lookup', locale));
      expect(hrefs, path).toContain(routePath('recipes', locale));
    }
  });
  it('carries the newsletter signup when the settings enable it', () => {
    for (const path of paths) {
      const form = doc(path).querySelector('.site-footer form[data-form="newsletter"]');
      if (!settings.newsletter.enabled) {
        expect(form, path).toBeNull();
        continue;
      }
      expect(form, path).not.toBeNull();
      expect(form!.querySelector('input[name="email"][type="email"][required]')).not.toBeNull();
      expect(
        form!.querySelector('input[name="website"]'),
        'no honeypot in the newsletter contract',
      ).toBeNull();
      expectFormShell(form!, path);
      expectDescribedErrors(form!, path);
    }
  });
  it('embeds the form strings once per page', () => {
    for (const path of paths) {
      const blocks = doc(path).querySelectorAll('script#rep-form-strings');
      expect(blocks.length, path).toBe(1);
      const data = JSON.parse(blocks[0]!.text);
      expect(data.forms.required, path).toBeTruthy();
      expect(data.errors.orderNotFound, path).toBeTruthy();
    }
  });
});

describe('third parties', () => {
  it('no Turnstile and no analytics beacon while the settings leave them empty', () => {
    for (const locale of LOCALES)
      for (const key of ['home', 'contact', 'lookup'] as const) {
        const html = readFileSync(join(dist, fileOf(routePath(key, locale))), 'utf8');
        if (!settings.analytics.cloudflareToken)
          expect(html, `${key} ${locale}`).not.toContain('cloudflareinsights');
        if (!settings.forms.turnstileSiteKey)
          expect(html, `${key} ${locale}`).not.toContain('challenges.cloudflare.com');
      }
  });
});

describe('stock alert', () => {
  const out = products.filter((p) => p.stock === 'out' && !p.hidden);
  it.skipIf(out.length === 0)('an out-of-stock product page offers the alert form', () => {
    for (const locale of LOCALES)
      for (const p of out) {
        const d = doc(routePath('product', locale, p.slug));
        const form = d.querySelector('form[data-form="stock_alert"]');
        expect(form, p.slug).not.toBeNull();
        expect(form!.getAttribute('data-sku')).toBe(p.sku);
        expectHoneypot(form!, p.slug);
        expectFormShell(form!, p.slug);
      }
  });
});

describe('new pages', () => {
  it('order lookup: the form, then the shared order shell without the next steps', () => {
    for (const locale of LOCALES) {
      const d = page('lookup', locale);
      const form = d.querySelector('[data-lookup] form[data-lookup-form]');
      expect(form).not.toBeNull();
      expect(form!.querySelector('input[name="number"][required]')).not.toBeNull();
      expect(form!.querySelector('input[name="email"][type="email"][required]')).not.toBeNull();
      expectDescribedErrors(form!, `lookup ${locale}`);
      const result = d.querySelector('[data-lookup-result]');
      expect(result?.hasAttribute('hidden')).toBe(true);
      for (const hook of [
        'data-thanks-number',
        'data-thanks-lines',
        'data-thanks-total',
        'data-thanks-relay',
      ])
        expect(result!.querySelector(`[${hook}]`), hook).not.toBeNull();
      expect(result!.querySelector('[data-next]')).toBeNull();
      expect(d.querySelector('script#rep-page-strings')).not.toBeNull();
      expect(d.querySelector('meta[name="robots"]')?.getAttribute('content')).not.toContain(
        'noindex',
      );
    }
  });
  it('review: a template with five star radios and the token-free strings', () => {
    for (const locale of LOCALES) {
      const d = page('review', locale);
      expect(d.querySelector('[data-review-page]')).not.toBeNull();
      const template = d.querySelector('template[data-review-template]');
      expect(template).not.toBeNull();
      expect(template!.querySelectorAll('input[type="radio"][name="rating"]').length).toBe(5);
      for (const name of ['author', 'text'])
        expect(template!.querySelector(`[name="${name}"][required]`), name).not.toBeNull();
      expect(d.querySelector('[data-review-invalid]')?.hasAttribute('hidden')).toBe(true);
      expect(d.querySelector('[data-review-expired]')?.hasAttribute('hidden')).toBe(true);
      expect(JSON.parse(d.querySelector('script#rep-review-strings')!.text).textMax).toBe(1200);
      expect(d.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
    }
  });
  it('newsletter landing: a block per status, noindex', () => {
    for (const locale of LOCALES) {
      const d = page('newsletter', locale);
      const root = d.querySelector('[data-newsletter-landing]');
      expect(root).not.toBeNull();
      for (const status of ['ok', 'invalid'])
        expect(root!.querySelector(`[data-landing-when="${status}"]`)?.hasAttribute('hidden')).toBe(
          true,
        );
      expect(d.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
      expect(root!.querySelector(`a[href="${routePath('shop', locale)}"]`)).not.toBeNull();
    }
  });
  it('thanks keeps its order shell and next steps', () => {
    for (const locale of LOCALES) {
      const d = page('thanks', locale);
      for (const hook of [
        'data-thanks-order',
        'data-thanks-lines',
        'data-thanks-email',
        'data-thanks-cart',
      ])
        expect(d.querySelector(`[data-thanks] [${hook}]`), hook).not.toBeNull();
      expect(d.querySelectorAll('[data-thanks] [data-next]').length).toBe(3);
    }
  });
});

describe('cross-sell shells', () => {
  it('the drawer and the cart page carry a hidden "Complétez votre commande" list', () => {
    for (const locale of LOCALES) {
      const d = page('cart', locale);
      for (const scope of ['#cart-drawer', '[data-cart-page]']) {
        const section = d.querySelector(`${scope} [data-cross-sell]`);
        expect(section, scope).not.toBeNull();
        expect(section!.hasAttribute('hidden')).toBe(true);
        expect(section!.querySelector('[data-cross-sell-list]')).not.toBeNull();
        const title = d.querySelector(`#${section!.getAttribute('aria-labelledby')}`);
        expect(title?.text.length).toBeGreaterThan(5);
      }
    }
  });
});
