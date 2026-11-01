// French typography applied at render time, so that content typed in the CMS
// with ordinary spaces prints with the right no-break spaces: before the
// double punctuation marks, inside guillemets, between a number and its unit
// and in digit groups. Pure: no Astro import, unit tested.

const NBSP = ' ';
const NNBSP = ' ';

const UNITS = '(?:k?g|mg|m?l|cl|€|%|h|min|s|kcal|kJ|cm|mm|km|j|jours?|ans?|mois)';

/** Typography rules for one run of plain text (no HTML tags inside). */
export function frenchTypographyText(text: string): string {
  return (
    text
      // Narrow no-break space before ; ! ? and the percent sign.
      .replace(/ ([;!?%])/g, `${NNBSP}$1`)
      // Ordinary no-break space before the colon.
      .replace(/ :/g, `${NBSP}:`)
      // Guillemets hug their content.
      .replace(/« /g, `«${NBSP}`)
      .replace(/ »/g, `${NBSP}»`)
      // "n° 12" and "art. 12".
      .replace(/(n°|N°|art\.) (?=\d)/g, `$1${NBSP}`)
      // A number and its unit ("100 g", "12 h", "4,90 €", "3 à 5 jours" stays).
      .replace(new RegExp(`(\\d) ${UNITS}(?![\\p{L}\\d])`, 'gu'), (m, d: string) =>
        m.replace(`${d} `, `${d}${NNBSP}`),
      )
      // Digit grouping "3 000".
      .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NNBSP}`)
  );
}

/**
 * The same rules over an HTML fragment, touching text nodes only: tags,
 * attributes and entities are left alone.
 */
export function frenchTypographyHtml(html: string): string {
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : frenchTypographyText(part)))
    .join('');
}

type Plain = string | number | boolean | null | undefined;
type Deep = Plain | Deep[] | { [key: string]: Deep };

/** Applies the text rules to every string inside an object or array. */
export function frenchTypographyDeep<T extends Deep>(value: T): T {
  if (typeof value === 'string') return frenchTypographyText(value) as T;
  if (Array.isArray(value)) return value.map((v) => frenchTypographyDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: { [key: string]: Deep } = {};
    for (const [k, v] of Object.entries(value)) out[k] = frenchTypographyDeep(v);
    return out as T;
  }
  return value;
}
