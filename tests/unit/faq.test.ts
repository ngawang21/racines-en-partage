// The FAQ in headed groups and the inline link syntax of its answers
// (review 17): the tiny formatter keeps only internal links and leaves
// everything else as text, the groups come products first, and the content
// files use both in each locale.
import { describe, expect, it } from 'vitest';
import { inlineLinksText, parseInlineLinks } from '../../src/content/inline-links';
import { faqGroups, mergePage } from '../../src/content/merge';
import { FAQ_GROUPS, type FaqPage } from '../../src/content/schemas';
import { frenchTypographyDeep } from '../../src/i18n/typography';
import { matchRoute } from '../../src/i18n/routing';
import { yamlFolder } from './helpers';

describe('parseInlineLinks', () => {
  it('turns [label](/path/) into a link between plain runs', () => {
    expect(parseInlineLinks('Sur la [page Recettes](/recettes/) : chaque produit.')).toEqual([
      { text: 'Sur la ' },
      { text: 'page Recettes', href: '/recettes/' },
      { text: ' : chaque produit.' },
    ]);
  });

  it('handles several links, a link at either end and text without links', () => {
    expect(parseInlineLinks('[A](/a/) et [B](/b/#x)')).toEqual([
      { text: 'A', href: '/a/' },
      { text: ' et ' },
      { text: 'B', href: '/b/#x' },
    ]);
    expect(parseInlineLinks('Rien à lier.')).toEqual([{ text: 'Rien à lier.' }]);
    expect(parseInlineLinks('')).toEqual([]);
  });

  it('keeps external, protocol-relative and script URLs as plain text', () => {
    for (const text of [
      '[site](https://example.com/)',
      '[proto](//example.com/)',
      '[js](javascript:alert(1))',
      '[mail](mailto:a@b.fr)',
      '[relatif](recettes/)',
      '[espace](/a b/)',
      '[guillemet](/a"onmouseover="x/)',
    ])
      expect(parseInlineLinks(text), text).toEqual([{ text }]);
  });

  it('leaves markup as text: escaping is the renderer’s (Astro escapes every part)', () => {
    expect(parseInlineLinks('<b>[x](/x/)</b>')).toEqual([
      { text: '<b>' },
      { text: 'x', href: '/x/' },
      { text: '</b>' },
    ]);
  });

  it('gives a typeset "e‑mail" path its plain hyphen back', () => {
    expect(parseInlineLinks('[ici](/e‑mail/)')[0]).toEqual({ text: 'ici', href: '/e-mail/' });
  });

  it('inlineLinksText keeps the labels only, for the JSON-LD', () => {
    expect(inlineLinksText('Ouvrez [Mon espace](/mon-compte/) puis [ici](https://x.fr).')).toBe(
      'Ouvrez Mon espace puis [ici](https://x.fr).',
    );
  });
});

describe('faqGroups', () => {
  it('orders the groups products then orders, keeps file order inside, drops empty ones', () => {
    const items = [
      { q: 1, group: 'orders' as const },
      { q: 2, group: 'products' as const },
      { q: 3 },
      { q: 4, group: 'products' as const },
    ];
    expect(faqGroups(items)).toEqual([
      { group: 'products', items: [items[1], items[3]] },
      { group: 'orders', items: [items[0], items[2]] },
    ]);
    // An empty group is left out, so the page prints no heading for it.
    expect(faqGroups([{ group: 'orders' as const }]).map((g) => g.group)).toEqual(['orders']);
  });
});

describe('FAQ content', () => {
  const fr = yamlFolder('pages', 'fr').get('faq');
  const en = yamlFolder('pages', 'en').get('faq');
  const pages = {
    // The loader typesets French content; the links must survive it.
    fr: frenchTypographyDeep(mergePage('faq', fr) as never) as FaqPage,
    en: mergePage('faq', fr, en),
  } as const;

  it('puts every question in a group, products first, the same groups in both locales', () => {
    for (const [locale, page] of Object.entries(pages)) {
      for (const item of page.items) expect(item.group, `${locale} ${item.question}`).toBeDefined();
      expect(
        faqGroups(page.items).map((g) => g.group),
        locale,
      ).toEqual([...FAQ_GROUPS]);
      expect(page.groupTitles, locale).toBeDefined();
    }
    expect(pages.fr.groupTitles).toEqual({
      products: 'Nos produits',
      orders: 'Commande et livraison',
    });
    expect(pages.fr.items).toHaveLength(13);
    expect(pages.en.items).toHaveLength(13);
    expect(pages.en.items.map((i) => i.group)).toEqual(pages.fr.items.map((i) => i.group));
  });

  it('links the recipes page instead of printing its path, and every link is a route', () => {
    const where = {
      fr: pages.fr.items.find((i) => i.question.startsWith('Je découvre un produit'))!,
      en: pages.en.items.find(
        (i) => i.question === 'I am new to a product. Where should I start?',
      )!,
    };
    expect(parseInlineLinks(where.fr.answer)).toContainEqual({
      text: 'page Recettes',
      href: '/recettes/',
    });
    expect(parseInlineLinks(where.en.answer)).toContainEqual({
      text: 'Recipes page',
      href: '/en/recipes/',
    });
    for (const [locale, page] of Object.entries(pages)) {
      for (const item of page.items) {
        // No path printed as text: "(/recettes/)" was the review's complaint.
        expect(inlineLinksText(item.answer), item.question).not.toMatch(/\(\/[a-z]/);
        for (const part of parseInlineLinks(item.answer).filter((p) => p.href)) {
          const route = matchRoute(part.href!);
          expect(route, `${locale} ${part.href}`).not.toBeNull();
          expect(route!.locale, part.href).toBe(locale);
        }
      }
    }
  });
});
