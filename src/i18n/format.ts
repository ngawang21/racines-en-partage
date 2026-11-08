import { INTL_LOCALE, type Locale } from '../consts';

const NBSP = ' ';
const NNBSP = ' ';

const priceFormatters = new Map<Locale, Intl.NumberFormat>();

/**
 * A price in cents as the shop prints it: "8,90 €" (narrow no-break space
 * before the euro sign) in French, "€8.90" in English.
 */
export function formatPrice(cents: number, locale: Locale): string {
  if (!Number.isInteger(cents)) throw new Error(`formatPrice expects integer cents, got ${cents}`);
  let formatter = priceFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'EUR' });
    priceFormatters.set(locale, formatter);
  }
  const text = formatter.format(cents / 100);
  // ICU versions disagree on the separator; French typography wants U+202F.
  return locale === 'fr' ? text.replaceAll(NBSP, NNBSP) : text;
}

/**
 * Price per kilogram from a pack price in cents and its net weight (arrêté du
 * 16 novembre 1999): "65,00 €/kg" in French, "€65.00/kg" in English. The cents
 * per kilo are rounded half up. Pure, importable from client code.
 */
export function formatUnitPrice(cents: number, weightGrams: number, locale: Locale): string {
  if (!Number.isInteger(cents))
    throw new Error(`formatUnitPrice expects integer cents, got ${cents}`);
  if (!(weightGrams > 0))
    throw new Error(`formatUnitPrice expects a positive weight, got ${weightGrams}`);
  // Integer arithmetic first so 8,90 € for 137 g does not pick up float noise.
  const perKilo = Math.floor((cents * 1000 * 2 + weightGrams) / (2 * weightGrams));
  return `${formatPrice(perKilo, locale)}/kg`;
}

/** An average rating with one decimal: "4,5" in French, "4.5" in English. */
export function formatRating(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** A CMS price in euros (2 decimals) to integer cents, immune to float noise. */
export function toCents(price: number): number {
  if (!Number.isFinite(price)) throw new Error(`toCents expects a finite number, got ${price}`);
  return Math.round(price * 100);
}

/** "100 g", "1,5 kg" (fr) or "1.5 kg" (en), with a no-break space before the unit. */
export function formatWeight(grams: number, locale: Locale): string {
  if (grams < 1000) return `${grams}${NBSP}g`;
  const kg = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 2 }).format(
    grams / 1000,
  );
  return `${kg}${NBSP}kg`;
}

/**
 * Glues a trailing weight to its number for display ("Fleurs d’hibiscus
 * 100 g" never breaks before "g"). Product labels keep plain spaces for
 * Stripe and the e-mails; the cart views pass them through this.
 */
export function nowrapWeight(label: string): string {
  return label.replace(/ (\d+(?:[.,]\d+)?) (k?g)$/, `${NBSP}$1${NBSP}$2`);
}

/** "0775689108" to "07 75 68 91 08". Other shapes are returned unchanged. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10 || !digits.startsWith('0')) return raw;
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/** "0775689108" to "+33775689108" for tel: links and structured data. */
export function phoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return `+33${digits.slice(1)}`;
  if (raw.trim().startsWith('+')) return `+${digits}`;
  return raw;
}

/** An ISO day ("2026-11-01") as "1 novembre 2026" or "1 November 2026". */
export function formatDate(isoDay: string, locale: Locale): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Nutrition values are shared fields typed as printed on the French label
 * ("3,0 g", "400 à 450 kcal"). In English, swap the decimal comma and "à".
 */
export function localiseNutrition(value: string, locale: Locale): string {
  if (locale === 'fr') return value;
  return value.replace(/(\d),(\d)/g, '$1.$2').replace(/ à /g, ' to ');
}
