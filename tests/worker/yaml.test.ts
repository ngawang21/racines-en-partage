import { format } from 'prettier';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { reviewSchema } from '../../src/content/schemas';
import { renderReviewFile } from '../../worker/reviews';
import { toYaml, yamlString } from '../../worker/yaml';

/** The repository's Prettier options for YAML (.prettierrc). */
const prettierYaml = (text: string) =>
  format(text, { parser: 'yaml', singleQuote: true, printWidth: 100 });

const TRICKY = [
  'plain',
  'Un "vrai" goût',
  "l'été",
  'both \' and "',
  'Ligne un\nLigne deux',
  'C:\\chemin\\fichier',
  '- commence par un tiret',
  '# pas un commentaire',
  '{ pas: une mapping }',
  '[pas, une liste]',
  'yes',
  'null',
  '2026-11-08',
  '123',
  ': deux points',
  'a: b',
  '  espaces autour  ',
  '&ancre *alias !tag %dir @at `tick` |pipe >gt',
  'emoji 🌿 et accents éèàç',
  '',
];

describe('YAML serializer', () => {
  it.each(TRICKY)('quotes and round trips %j', async (value) => {
    const text = toYaml({ value });
    expect(parse(text)).toEqual({ value });
    // Prettier would leave the committed file as it is.
    expect(await prettierYaml(text)).toBe(text);
  });

  it('writes numbers and booleans bare, strings always quoted', () => {
    expect(toYaml({ rating: 5, verified: true, published: false, date: '2026-11-08' })).toBe(
      "rating: 5\nverified: true\npublished: false\ndate: '2026-11-08'\n",
    );
  });

  it('escapes in double quotes only when a line break or a backslash needs it', () => {
    expect(yamlString('a\nb')).toBe('"a\\nb"');
    expect(yamlString('say "hi"\nnow')).toBe('"say \\"hi\\"\\nnow"');
    expect(yamlString('back\\slash')).toBe('"back\\\\slash"');
    expect(yamlString('Un "vrai"')).toBe('\'Un "vrai"\'');
    expect(yamlString("it's")).toBe('"it\'s"');
    expect(yamlString('it\'s "x"')).toBe("'it''s \"x\"'");
  });

  it('drops control characters, line separators and lone surrogates', () => {
    const text = toYaml({ v: 'a\u0000b\u0007c\u2028d\ufeffe\ud800f\tg' });
    expect(parse(text)).toEqual({ v: 'a b c d ef g' });
  });

  it('refuses keys that are not plain identifiers and non-finite numbers', () => {
    expect(() => toYaml({ 'a: b': 'x' })).toThrow();
    expect(() => toYaml({ n: Number.NaN })).toThrow();
  });

  it('a review file parses with reviewSchema and keeps the spec field order', async () => {
    const text = renderReviewFile({
      product: 'poudre-de-moringa-100g',
      rating: 4,
      author: 'Awa "la gourmande"',
      locale: 'fr',
      date: '2026-11-08',
      order: 'E5F6G7H8',
      title: "Un vrai goût d'été",
      text: 'Très bon produit.\n\n- en smoothie\n# chaque matin',
    });
    expect(Object.keys(parse(text))).toEqual([
      'product',
      'rating',
      'author',
      'locale',
      'date',
      'order',
      'verified',
      'published',
      'title',
      'text',
      'reply',
    ]);
    expect(reviewSchema.parse(parse(text))).toEqual({
      product: 'poudre-de-moringa-100g',
      rating: 4,
      author: 'Awa "la gourmande"',
      locale: 'fr',
      date: '2026-11-08',
      order: 'E5F6G7H8',
      verified: true,
      published: false,
      title: "Un vrai goût d'été",
      text: 'Très bon produit.\n\n- en smoothie\n# chaque matin',
      reply: '',
    });
    expect(await prettierYaml(text)).toBe(text);
  });
});
