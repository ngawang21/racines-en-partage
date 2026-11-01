export const SITE = { url: 'https://racinesenpartage.fr', name: 'Racines en Partage' } as const;
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/** BCP 47 tags used for number, currency and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' };

/** Open Graph locale codes. */
export const OG_LOCALE: Record<Locale, string> = { fr: 'fr_FR', en: 'en_GB' };

/** Hosting provider named in the legal notice (`{host}` token). */
export const HOST =
  'Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, USA (cloudflare.com)';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
