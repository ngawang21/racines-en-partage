// On-demand loader of the Mondial Relay Parcel Shop Picker v4 (spec 6.4).
// Nothing loads until the customer picks the relay method on the checkout
// page. jQuery and Leaflet are vendored under public/vendor/ (same origin,
// sources and hashes in public/vendor/README.md); only the plugin is remote.
// REMOTE_HOSTS is mirrored in the checkout CSP blocks of public/_headers
// (tests/build/headers.test.ts checks both).
import {
  closedUntil,
  displayCase,
  mapParcelShop,
  parseInlineHandler,
  type ParcelShopPayload,
} from './relay';
import type { RelayPoint } from './store';
// The widget's look in the shop's styles: an asset of its own, linked when
// the widget loads (a plain import would land in every page's stylesheet).
import RELAY_CSS_URL from '../styles/relay-widget.css?url';

export const JQUERY_URL = '/vendor/jquery/jquery-2.2.4.min.js';
export const LEAFLET_JS_URL = '/vendor/leaflet/leaflet.js';
export const LEAFLET_CSS_URL = '/vendor/leaflet/leaflet.css';
export const PLUGIN_URL =
  'https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js';

/**
 * The widget's own init always asks for these two unversioned unpkg URLs,
 * unless a `<script>` (or `<link>`) in `<head>` already has that exact `src`
 * (or `href`); see preemptWidgetLeaflet.
 */
export const WIDGET_LEAFLET_JS_URL = 'https://unpkg.com/leaflet/dist/leaflet.js';
export const WIDGET_LEAFLET_CSS_URL = 'https://unpkg.com/leaflet/dist/leaflet.css';

/**
 * Third-party hosts the widget reaches, per CSP directive (captured with
 * scripts/relay-capture.mjs, widget 4.0.11). 'self' is implied everywhere.
 * No font host: the widget is mounted with `CSS: '0'`, so its theme
 * stylesheet, which @imports Montserrat from fonts.googleapis.com (a request
 * carrying the visitor's IP to Google), never loads; src/styles/relay-widget.css
 * styles it instead.
 */
export const REMOTE_HOSTS = {
  'script-src': ['https://widget.mondialrelay.com'],
  'style-src': ['https://widget.mondialrelay.com'],
  'img-src': [
    'https://widget.mondialrelay.com',
    'https://www.mondialrelay.com',
    'https://a.tile.openstreetmap.org',
    'https://b.tile.openstreetmap.org',
    'https://c.tile.openstreetmap.org',
  ],
  'connect-src': ['https://widget.mondialrelay.com'],
} as const satisfies Record<string, readonly string[]>;

const PLUGIN = 'MR_ParcelShopPicker';
const LOAD_TIMEOUT_MS = 20000;

interface JQueryElement {
  [PLUGIN]: (options: Record<string, unknown>) => JQueryElement;
  trigger(event: string, args?: unknown[]): JQueryElement;
  data(key: string): unknown;
}
type JQueryLike = ((selector: string | Element) => JQueryElement) & {
  globalEval?: (code: string) => void;
};

declare global {
  interface Window {
    jQuery?: JQueryLike;
  }
}

const pending = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    const timer = window.setTimeout(() => {
      // Forget the attempt so a later search can retry, as after an error.
      pending.delete(src);
      reject(new Error(`timeout: ${src}`));
    }, LOAD_TIMEOUT_MS);
    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      resolve();
    });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      pending.delete(src);
      reject(new Error(`failed: ${src}`));
    });
    document.head.append(script);
  });
  pending.set(src, promise);
  return promise;
}

function loadStylesheet(href: string): void {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

/**
 * The widget appends server-sent HTML holding one inline script, which jQuery
 * runs through eval: the checkout CSP has no 'unsafe-eval', so the append
 * would throw and the picker would never render. jQuery's evaluator is
 * replaced by one that never evaluates; the two effects of that script
 * (observed with widget 4.0.11) are reproduced here without eval:
 *
 *   var MondialRelayLanguage = { Horaires: 'Horaires', Photo: 'Photo' };
 *   MR_jQuery(document).on('click', '.PR-List-Item', function () {
 *     var $RList = MR_jQuery(this).closest('.MRW-RList');
 *     var $ShowList = $RList.parent().find('.MRW-ShowList');
 *     if ($ShowList.is(':visible')) { $RList.addClass('Hide'); }
 *   });
 */
export function neutraliseGlobalEval(jq: JQueryLike): void {
  let listening = false;
  jq.globalEval = (code: string) => {
    const language = /MondialRelayLanguage\s*=\s*\{([^}]*)\}/.exec(code);
    if (language) {
      const entries = [...language[1]!.matchAll(/(\w+)\s*:\s*'([^']*)'/g)].map((m) => [
        m[1]!,
        m[2]!,
      ]);
      (window as unknown as Record<string, unknown>).MondialRelayLanguage =
        Object.fromEntries(entries);
    }
    if (/PR-List-Item/.test(code) && !listening) {
      listening = true;
      document.addEventListener('click', (event) => {
        const item = (event.target as Element | null)?.closest('.PR-List-Item');
        const list = item?.closest('.MRW-RList');
        const toggle = list?.parentElement?.querySelector<HTMLElement>('.MRW-ShowList');
        // The mobile layout shows the "list" button: picking a point returns to the map.
        if (list && toggle && toggle.offsetParent !== null) list.classList.add('Hide');
      });
    }
  };
}

/**
 * Removes the widget's inline `on*` attributes as they appear (the CSP would
 * block them) and replays them from one delegated listener, through
 * parseInlineHandler only.
 */
export function disarmInlineHandlers(container: HTMLElement, jq: JQueryLike): () => void {
  const disarm = (el: Element) => {
    const code = el.getAttribute('onclick');
    if (code === null) return;
    el.removeAttribute('onclick');
    el.setAttribute('data-rep-onclick', code);
  };
  const sweep = (root: Element) => {
    disarm(root);
    for (const el of root.querySelectorAll('[onclick]')) disarm(el);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') disarm(record.target as Element);
      for (const node of record.addedNodes) if (node instanceof Element) sweep(node);
    }
  });
  observer.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['onclick'],
  });
  sweep(container);
  const onClick = (event: MouseEvent) => {
    const el = (event.target as Element | null)?.closest<HTMLElement>('[data-rep-onclick]');
    if (!el || !container.contains(el)) return;
    const action = parseInlineHandler(el.dataset.repOnclick ?? '');
    if (!action) return;
    if (action.kind === 'trigger') {
      jq(action.selector).trigger(action.event, action.arg === undefined ? [] : [action.arg]);
    } else {
      for (const target of el.parentElement?.querySelectorAll(action.find) ?? [])
        target.classList.toggle(action.className);
    }
  };
  container.addEventListener('click', onClick);
  return () => {
    observer.disconnect();
    container.removeEventListener('click', onClick);
  };
}

/**
 * Widget 4.0.11 (`MR_loadjscssfile` in its init) appends Leaflet from unpkg
 * even when `L` already exists, and skips the append only when an element of
 * `<head>` already carries the same URL. Two inert elements carry them: a
 * script of a non-JavaScript type is neither fetched nor run, and a link of
 * an unknown `rel` fetches nothing. The vendored Leaflet is the one in use;
 * no request reaches unpkg and the checkout CSP does not list it.
 */
export function preemptWidgetLeaflet(): void {
  const head = document.head;
  if (![...head.getElementsByTagName('script')].some((s) => s.src === WIDGET_LEAFLET_JS_URL)) {
    const script = document.createElement('script');
    script.type = 'text/x-rep-inert';
    script.src = WIDGET_LEAFLET_JS_URL;
    head.append(script);
  }
  if (![...head.getElementsByTagName('link')].some((l) => l.href === WIDGET_LEAFLET_CSS_URL)) {
    const link = document.createElement('link');
    link.rel = 'x-rep-inert';
    link.href = WIDGET_LEAFLET_CSS_URL;
    head.append(link);
  }
}

/** Loads jQuery, Leaflet (script and styles) and the plugin, in that order. */
export async function loadRelayWidget(): Promise<JQueryLike> {
  await loadScript(JQUERY_URL);
  if (window.jQuery) neutraliseGlobalEval(window.jQuery);
  loadStylesheet(LEAFLET_CSS_URL);
  loadStylesheet(RELAY_CSS_URL);
  await loadScript(LEAFLET_JS_URL);
  preemptWidgetLeaflet();
  await loadScript(PLUGIN_URL);
  if (!window.jQuery) throw new Error('jQuery missing after load');
  return window.jQuery;
}

export interface RelayWidgetOptions {
  /** Container selector, "#rep-relay-widget". */
  container: string;
  /** Hidden input that receives "FR-016741". */
  target: string;
  brand: string;
  country: string;
  allowedCountries: string[];
  postcode: string;
  onSelect(point: RelayPoint): void;
  /** Note of a closed point, `until` "11/11/2026" when the widget says so. */
  closedNote(until: string | null): string;
  /** A closed point was picked: the widget selects nothing, the page says why. */
  onClosedPick(note: string): void;
}

/** What the search results say about each point, by "FR-016741". */
interface PointInfo {
  available: boolean;
  until: string | null;
}

const ITEM = '.PR-List-Item';
const TIDY = 'data-rep-tidy';

/**
 * Brings the widget's result list to the shop's conventions as it renders:
 * "1 - LOCKER 24/7 LIDL ARNOUVILLE" reads "Locker 24/7 Lidl Arnouville"
 * (the numbers match nothing on the map), each point is a keyboard button,
 * and a closed point (the widget's PR-Disabled, "En vacances" in its map
 * card only) carries a visible note and moves to the end of the list. The
 * inline `font-family: 'Montserrat'` of the map card is dropped too, so the
 * card uses the shop's font.
 */
export function tidyRelayList(
  container: HTMLElement,
  info: ReadonlyMap<string, PointInfo>,
  closedNote: (until: string | null) => string,
): () => void {
  const tidyItem = (item: HTMLElement) => {
    if (item.hasAttribute(TIDY)) return;
    item.setAttribute(TIDY, '');
    const name = item.querySelector<HTMLElement>('.PR-Name');
    if (name)
      name.textContent = displayCase((name.textContent ?? '').replace(/^\s*\d+\s*-\s*/, ''));
    for (const line of item.querySelectorAll<HTMLElement>(':scope > div:not(.PR-Name)'))
      line.textContent = displayCase(
        (line.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          // "95400 - ARNOUVILLE" reads "95400 Arnouville", as on the chosen card.
          .replace(/^(\S+) - /, '$1 '),
      );
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    if (!item.classList.contains('PR-Disabled')) return;
    item.setAttribute('aria-disabled', 'true');
    const id = item.querySelector<HTMLInputElement>('input.PR-Id')?.value ?? '';
    const note = document.createElement('p');
    note.className = 'rep-relay-closed';
    note.textContent = closedNote(info.get(id)?.until ?? null);
    item.append(note);
  };
  const sweep = () => {
    for (const el of container.querySelectorAll<HTMLElement>('[style*="Montserrat"]'))
      el.style.removeProperty('font-family');
    const list = container.querySelector<HTMLElement>('.MRW-RList');
    if (!list) return;
    for (const item of list.querySelectorAll<HTMLElement>(ITEM)) tidyItem(item);
    // Closed points last. Only moved when an open one follows, so the moves
    // (which notify this observer again) settle at once.
    for (const item of list.querySelectorAll<HTMLElement>(`${ITEM}.PR-Disabled`)) {
      let next = item.nextElementSibling;
      while (next && next.matches(`${ITEM}.PR-Disabled`)) next = next.nextElementSibling;
      if (next?.matches(ITEM)) list.append(item);
    }
  };
  const observer = new MutationObserver(sweep);
  observer.observe(container, { childList: true, subtree: true });
  sweep();
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = (event.target as Element | null)?.closest<HTMLElement>(ITEM);
    if (!item || !container.contains(item)) return;
    event.preventDefault();
    item.click();
  };
  container.addEventListener('keydown', onKey);
  return () => {
    observer.disconnect();
    container.removeEventListener('keydown', onKey);
  };
}

export interface RelayWidget {
  search(postcode: string, country: string): void;
  /** Leaflet measures its container: call after the map becomes visible again. */
  refresh(): void;
}

/** Mounts the widget once; later searches go through the plugin's MR_DoSearch event. */
export async function mountRelayWidget(options: RelayWidgetOptions): Promise<RelayWidget> {
  const $ = await loadRelayWidget();
  const node = document.querySelector<HTMLElement>(options.container);
  if (!node) throw new Error(`relay widget container missing: ${options.container}`);
  disarmInlineHandlers(node, $);
  const info = new Map<string, PointInfo>();
  tidyRelayList(node, info, options.closedNote);
  // A closed point: the widget opens its map card and selects nothing.
  node.addEventListener('click', (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(`${ITEM}.PR-Disabled`);
    if (!item || !node.contains(item)) return;
    const note = item.querySelector('.rep-relay-closed')?.textContent;
    if (note) options.onClosedPick(note);
  });
  const el = $(node);
  el[PLUGIN]({
    Target: options.target,
    Brand: options.brand,
    Country: options.country,
    AllowedCountries: options.allowedCountries.join(','),
    PostCode: options.postcode,
    ColLivMod: '24R',
    NbResults: 7,
    Responsive: true,
    ShowResultsOnMap: true,
    // No theme stylesheet (and so no Google Fonts request): see REMOTE_HOSTS.
    CSS: '0',
    OnSearchSuccess: (response: { PRList?: unknown }) => {
      if (!Array.isArray(response?.PRList)) return;
      for (const raw of response.PRList as ParcelShopPayload[]) {
        const id = `${String(raw.Pays ?? '')}-${String(raw.ID ?? '')}`;
        info.set(id, { available: raw.Available !== false, until: closedUntil(raw.Warning) });
      }
    },
    OnParcelShopSelected: (data: ParcelShopPayload) => {
      const point = mapParcelShop(data);
      if (point) options.onSelect(point);
    },
  });
  // The bootstrap queues the call until the versioned widget script has run.
  const ready = () => Boolean(el.data(`plugin_${PLUGIN}`));
  const whenReady = (fn: () => void, tries = 50) => {
    if (ready()) fn();
    else if (tries > 0) window.setTimeout(() => whenReady(fn, tries - 1), 100);
  };
  return {
    search(postcode, country) {
      whenReady(() => el.trigger('MR_DoSearch', [postcode, country]));
    },
    refresh() {
      whenReady(() => el.trigger('MR_RebindMap'));
    },
  };
}
