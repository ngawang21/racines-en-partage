// Mondial Relay Parcel Shop Picker payload mapping (spec 6.4). Pure.
//
// Payload keys observed in a live headless run of the v4 widget with the demo
// brand BDTEST: ID ("016741", six digits, no country prefix), Nom, Adresse1,
// Adresse2, CP, Ville, Pays ("FR"), Lat, Long (comma decimals), Nature,
// Available, HoursHtmlTable, Photo, Warning, Letter. The Target input
// receives "FR-016741".
import type { RelayPoint } from './store';

export interface ParcelShopPayload {
  ID?: unknown;
  Nom?: unknown;
  Adresse1?: unknown;
  Adresse2?: unknown;
  CP?: unknown;
  Ville?: unknown;
  Pays?: unknown;
  HoursHtmlTable?: unknown;
  [key: string]: unknown;
}

const clean = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '';

/**
 * Text the Worker accepts for a relay point (worker/checkout.ts, RELAY_TEXT):
 * letters, digits, spaces and ' - . , / & ( ). Anything else ("N°", quotes,
 * "+") becomes a space, so a real point is never refused; the ID is what the
 * label uses.
 */
const RELAY_REFUSED = /[^\p{L}\p{M}\d '\-.,/&()]/gu;
export const RELAY_TEXT_LIMITS = { name: 80, address: 120, city: 60 } as const;

const relayText = (v: unknown, max: number): string =>
  clean(
    clean(v)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(RELAY_REFUSED, ' '),
  )
    .slice(0, max)
    .trim();

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ucirc: 'û',
};

/** Decodes the few HTML entities the widget emits; unknown ones stay as text. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Reads the rows of the widget's opening hours table as plain text cells.
 * Nothing of the markup survives: tags inside a cell are dropped, entities
 * decoded, and rows without text are skipped.
 */
export function parseHoursTable(html: string): string[][] {
  const rows: string[][] = [];
  const source = html.slice(0, 20000);
  for (const row of source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells: string[] = [];
    for (const cell of row[1]!.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1\s*>/gi)) {
      const text = decodeEntities(cell[2]!.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(text);
    }
    if (cells.some((c) => c !== '')) rows.push(cells);
  }
  return rows;
}

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A clean table from parsed rows: the first cell of a row is its header (the day). */
export function hoursTableHtml(rows: string[][]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map(
      ([head = '', ...cells]) =>
        `<tr><th>${escapeText(head)}</th>${cells.map((c) => `<td>${escapeText(c)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table>${body}</table>`;
}

/** Re-sanitises a stored table (the value round-trips through localStorage). */
export function sanitizeHoursHtml(html: string | undefined): string {
  return html ? hoursTableHtml(parseHoursTable(html)) : '';
}

/** Normalises the widget's ID (with or without a country prefix) to "<CC>-<6 digits>". */
export function relayId(rawId: unknown, rawCountry: unknown): string | null {
  const id = clean(rawId).toUpperCase();
  const prefixed = /^([A-Z]{2})-?(\d{1,6})$/.exec(id);
  const country = (prefixed?.[1] ?? clean(rawCountry).toUpperCase()).slice(0, 2);
  const digits = prefixed?.[2] ?? (/^\d{1,6}$/.test(id) ? id : null);
  if (!digits || !/^[A-Z]{2}$/.test(country)) return null;
  return `${country}-${digits.padStart(6, '0')}`;
}

/** The widget's OnParcelShopSelected payload as a cart RelayPoint, or null when unusable. */
export function mapParcelShop(payload: ParcelShopPayload | null | undefined): RelayPoint | null {
  if (!payload || typeof payload !== 'object') return null;
  const id = relayId(payload.ID, payload.Pays);
  const name = relayText(payload.Nom, RELAY_TEXT_LIMITS.name);
  const address1 = relayText(payload.Adresse1, RELAY_TEXT_LIMITS.address);
  const postcode = clean(payload.CP);
  const city = relayText(payload.Ville, RELAY_TEXT_LIMITS.city);
  const country = clean(payload.Pays).toUpperCase() || id?.slice(0, 2) || '';
  if (!id || !name || !address1 || !postcode || !city || !/^[A-Z]{2}$/.test(country)) return null;
  const point: RelayPoint = { id, name, address1, postcode, city, country };
  const address2 = relayText(payload.Adresse2, RELAY_TEXT_LIMITS.address);
  if (address2) point.address2 = address2;
  const hours =
    typeof payload.HoursHtmlTable === 'string' ? sanitizeHoursHtml(payload.HoursHtmlTable) : '';
  if (hours) point.hoursHtml = hours;
  return point;
}

/**
 * The widget's markup carries inline handlers, which the checkout CSP blocks
 * (no 'unsafe-inline'). The client strips them and replays the few shapes
 * the widget uses (4.0.11) through this parser, never through eval:
 *   MR_jQuery("#rep-relay-widget").trigger("FocusOnMap",0)
 *   MR_jQuery("#close-pop").trigger("ClearSelection");
 *   MR_jQuery(this).parent().find('.MRW-RList').toggleClass('Hide');
 */
export type InlineAction =
  | { kind: 'trigger'; selector: string; event: string; arg?: number }
  | { kind: 'toggleClass'; find: string; className: string };

export function parseInlineHandler(code: string): InlineAction | null {
  const source = code.trim();
  const trigger =
    /^MR_jQuery\((["'])([#.][\w-]+)\1\)\.trigger\((["'])(\w+)\3(?:\s*,\s*(-?\d+))?\);?$/.exec(
      source,
    );
  if (trigger) {
    const action: InlineAction = { kind: 'trigger', selector: trigger[2]!, event: trigger[4]! };
    if (trigger[5] !== undefined) action.arg = Number(trigger[5]);
    return action;
  }
  const toggle =
    /^MR_jQuery\(this\)\.parent\(\)\.find\((["'])([.#][\w-]+)\1\)\.toggleClass\((["'])([\w-]+)\3\);?$/.exec(
      source,
    );
  if (toggle) return { kind: 'toggleClass', find: toggle[2]!, className: toggle[4]! };
  return null;
}

/**
 * Display form of the widget's upper-case labels: "LOCKER 24/7 LIDL
 * ARNOUVILLE" reads "Locker 24/7 Lidl Arnouville". Mixed-case text is kept.
 */
export function displayCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(
      /(^|[\s'’(/-])(\p{L})/gu,
      (_, sep: string, letter: string) => sep + letter.toUpperCase(),
    );
}
