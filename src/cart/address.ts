// The shop's postal address and phone as printed on the pages (spec
// iteration 3, 8.4): the address ends with the country, the phone reads
// "07 75 68 91 08" in French and "+33 7 75 68 91 08" in English. The tel:
// link stays E.164 (phoneE164). Pure: server components and tests use it.
import { INTL_LOCALE, type Locale } from '../consts';
import { formatPhone, formatPhoneIntl } from '../i18n/format';
import { displayCase } from './relay';

export interface PostalAddress {
  street: string;
  postcode: string;
  city: string;
  country: string;
}

/** "France" for "FR", in the page locale; the code itself if Intl does not know it. */
export function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([INTL_LOCALE[locale]], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** ["9 Rue du Marché", "95400 Arnouville", "France"]. */
export function addressLines(address: PostalAddress, locale: Locale): [string, string, string] {
  return [
    address.street,
    `${address.postcode} ${address.city}`,
    countryName(address.country, locale),
  ];
}

/** "9 Rue du Marché, 95400 Arnouville, France". */
export const addressLine = (address: PostalAddress, locale: Locale): string =>
  addressLines(address, locale).join(', ');

export const displayPhone = (raw: string, locale: Locale): string =>
  locale === 'en' ? formatPhoneIntl(raw) : formatPhone(raw);

/**
 * The lines of a Point Relais address as the order pages print them: street,
 * second line, "95400 Arnouville", country. A payload missing a field (an
 * older order, an unexpected shape) yields the lines it can, never throws.
 */
export function relayAddressLines(
  point: Partial<Record<'address1' | 'address2' | 'postcode' | 'city' | 'country', unknown>>,
  locale: Locale,
): string[] {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const cityLine = [text(point.postcode), displayCase(text(point.city))].filter(Boolean).join(' ');
  const country = /^[A-Z]{2}$/.test(text(point.country))
    ? countryName(text(point.country), locale)
    : '';
  return [
    displayCase(text(point.address1)),
    displayCase(text(point.address2)),
    cityLine,
    country,
  ].filter(Boolean);
}
