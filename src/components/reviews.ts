// Pure helpers of the review components (spec 2.1 display).
import type { Locale } from '../consts';
import type { LocaleContent } from '../content/locale-schema';
import { interpolate } from '../i18n/fallback';
import { formatRating } from '../i18n/format';

/** "12 avis", "1 review". */
export function reviewCountLabel(count: number, t: LocaleContent, locale: Locale): string {
  const one = locale === 'fr' ? count <= 1 : count === 1;
  return interpolate(one ? t.reviews.countOne : t.reviews.countMany, { count });
}

/** "4,5 sur 5". */
export function ratingLabel(rating: number, t: LocaleContent, locale: Locale): string {
  return interpolate(t.reviews.outOf, { average: formatRating(rating, locale) });
}

/** "anglais" on a French page, "French" on an English one. */
export function languageName(code: string, locale: Locale): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
}
