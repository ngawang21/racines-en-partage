import { describe, expect, it } from 'vitest';
import {
  frenchTypographyDeep,
  frenchTypographyHtml,
  frenchTypographyText,
} from '../../src/i18n/typography';

const NBSP = ' ';
const NNBSP = ' ';

describe('frenchTypographyText', () => {
  it('puts a narrow no-break space before ; ! ? and %', () => {
    expect(frenchTypographyText('Bonjour ! Ça va ? Oui ; 100 %')).toBe(
      `Bonjour${NNBSP}! Ça va${NNBSP}? Oui${NNBSP}; 100${NNBSP}%`,
    );
  });
  it('puts an ordinary no-break space before the colon and inside guillemets', () => {
    expect(frenchTypographyText('Note : « bien »')).toBe(`Note${NBSP}: «${NBSP}bien${NBSP}»`);
  });
  it('glues a number to its unit and groups digits', () => {
    expect(frenchTypographyText('100 g, 1,5 kg, 4,90 €, de 9 h à 19 h, 3 000 sachets')).toBe(
      `100${NNBSP}g, 1,5${NNBSP}kg, 4,90${NNBSP}€, de 9${NNBSP}h à 19${NNBSP}h, 3${NNBSP}000 sachets`,
    );
    expect(frenchTypographyText('3 à 5 jours ouvrés')).toBe(`3 à 5${NNBSP}jours ouvrés`);
    expect(frenchTypographyText('commande n° 1234, art. 3')).toBe(
      `commande n°${NBSP}1234, art.${NBSP}3`,
    );
  });
  it('leaves words that merely start like a unit alone', () => {
    expect(frenchTypographyText('2 grands verres, 10 minutes, 1 litre')).toBe(
      '2 grands verres, 10 minutes, 1 litre',
    );
  });
  it('is idempotent and keeps placeholders', () => {
    const once = frenchTypographyText('Livraison : {price}, offerte dès {threshold} !');
    expect(frenchTypographyText(once)).toBe(once);
    expect(once).toBe(`Livraison${NBSP}: {price}, offerte dès {threshold}${NNBSP}!`);
  });
});

describe('frenchTypographyText hyphens', () => {
  it('writes e-mail with a non-breaking hyphen unless told otherwise', () => {
    expect(frenchTypographyText('un e-mail, deux e-mails, email')).toBe(
      'un e\u2011mail, deux e\u2011mails, email',
    );
    expect(frenchTypographyText('un e-mail', { nonBreakingHyphens: false })).toBe('un e-mail');
  });
});

describe('frenchTypographyHtml', () => {
  it('touches text nodes only', () => {
    expect(frenchTypographyHtml('<a href="/x?y=1" title="Note :">Note : « oui » !</a>')).toBe(
      `<a href="/x?y=1" title="Note :">Note${NBSP}: «${NBSP}oui${NBSP}»${NNBSP}!</a>`,
    );
  });
});

describe('frenchTypographyDeep', () => {
  it('walks objects and arrays and keeps other values', () => {
    expect(frenchTypographyDeep({ a: 'Oui !', b: ['100 g', 3], c: null, d: true })).toEqual({
      a: `Oui${NNBSP}!`,
      b: [`100${NNBSP}g`, 3],
      c: null,
      d: true,
    });
  });
});
