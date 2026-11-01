import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatPhone,
  formatPrice,
  formatWeight,
  localiseNutrition,
  nowrapWeight,
  phoneE164,
  toCents,
} from '../../src/i18n/format';

describe('formatPrice', () => {
  it('prints French prices with a narrow no-break space before the euro sign', () => {
    expect(formatPrice(890, 'fr')).toBe('8,90 €');
    expect(formatPrice(0, 'fr')).toBe('0,00 €');
    expect(formatPrice(4900, 'fr')).toBe('49,00 €');
    expect(formatPrice(123456, 'fr')).toBe('1 234,56 €');
    expect(formatPrice(890, 'fr')).not.toContain(' ');
  });
  it('prints English prices with the sign first', () => {
    expect(formatPrice(890, 'en')).toBe('€8.90');
    expect(formatPrice(123456, 'en')).toBe('€1,234.56');
  });
  it('refuses fractional cents', () => {
    expect(() => formatPrice(8.9, 'fr')).toThrow();
  });
});

describe('toCents', () => {
  it('converts CMS euros to integer cents without float noise', () => {
    expect(toCents(8.9)).toBe(890);
    expect(toCents(4.9)).toBe(490);
    expect(toCents(15.9)).toBe(1590);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(49)).toBe(4900);
    expect(toCents(0)).toBe(0);
  });
  it('refuses NaN and infinities', () => {
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('nowrapWeight', () => {
  it('glues a trailing weight to its number and to the name', () => {
    expect(nowrapWeight('Fleurs d’hibiscus (bissap) 100 g')).toBe(
      'Fleurs d’hibiscus (bissap)\u00a0100\u00a0g',
    );
    expect(nowrapWeight('Moringa 1,5 kg')).toBe('Moringa\u00a01,5\u00a0kg');
  });
  it('leaves other labels alone', () => {
    expect(nowrapWeight('Gift card')).toBe('Gift card');
  });
});

describe('formatWeight', () => {
  it('uses grams below a kilo and a no-break space', () => {
    expect(formatWeight(100, 'fr')).toBe('100 g');
    expect(formatWeight(200, 'en')).toBe('200 g');
  });
  it('switches to kilos with the locale decimal mark', () => {
    expect(formatWeight(1500, 'fr')).toBe('1,5 kg');
    expect(formatWeight(1500, 'en')).toBe('1.5 kg');
    expect(formatWeight(1000, 'fr')).toBe('1 kg');
  });
});

describe('phones', () => {
  it('groups a French number by two and gives the E.164 form', () => {
    expect(formatPhone('0775689108')).toBe('07 75 68 91 08');
    expect(phoneE164('0775689108')).toBe('+33775689108');
    expect(phoneE164('07 75 68 91 08')).toBe('+33775689108');
  });
  it('leaves other shapes alone', () => {
    expect(formatPhone('+44 20 7946 0000')).toBe('+44 20 7946 0000');
    expect(phoneE164('+44 20 7946 0000')).toBe('+442079460000');
  });
});

describe('formatDate and localiseNutrition', () => {
  it('prints a day in words', () => {
    expect(formatDate('2026-11-01', 'fr')).toBe('1 novembre 2026');
    expect(formatDate('2026-11-01', 'en')).toBe('1 November 2026');
    expect(formatDate('not a date', 'fr')).toBe('not a date');
  });
  it('turns the French label values into English notation', () => {
    expect(localiseNutrition('< 2,5 g', 'en')).toBe('< 2.5 g');
    expect(localiseNutrition('400 à 450 kcal', 'en')).toBe('400 to 450 kcal');
    expect(localiseNutrition('< 2,5 g', 'fr')).toBe('< 2,5 g');
  });
});
