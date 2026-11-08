// Product search over the embedded client catalogue (spec 2.7). Pure: no DOM,
// unit tested; src/scripts/search.ts wires it to the header dialog.
//
// A product matches when every word of the query starts a word of its name,
// its category name or one of its keywords, ignoring case, accents and
// punctuation ("hibis" finds "Fleurs d'hibiscus", "karkade" finds "karkadé").
import type { ClientCatalog, ClientProduct } from '../catalog/build';

/** Lower case, accents and ligatures folded, every non-alphanumeric run to one space. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const words = (text: string): string[] => normalise(text).split(' ').filter(Boolean);

export interface IndexEntry {
  product: ClientProduct;
  /** Catalogue position, the tie-breaker. */
  position: number;
  name: string[];
  keywords: string[];
  category: string[];
}

export type SearchIndex = IndexEntry[];

/** One entry per product, in catalogue order. */
export function buildIndex(catalog: Pick<ClientCatalog, 'products'>): SearchIndex {
  return Object.values(catalog.products).map((product, position) => ({
    product,
    position,
    name: words(product.name),
    keywords: product.keywords.flatMap(words),
    category: words(product.categoryName),
  }));
}

/**
 * Weight of the best word a query term starts. A whole word beats a prefix, the
 * name beats the keywords, which beat the category; an earlier word in the
 * name beats a later one. 0 when the term starts no word.
 */
function termScore(term: string, entry: IndexEntry): number {
  let best = 0;
  const consider = (list: string[], base: number, byPosition: boolean) => {
    list.forEach((word, i) => {
      if (!word.startsWith(term)) return;
      const score = base + (word === term ? 20 : 0) - (byPosition ? Math.min(i, 9) : 0);
      if (score > best) best = score;
    });
  };
  consider(entry.name, 100, true);
  consider(entry.keywords, 70, false);
  consider(entry.category, 40, false);
  return best;
}

/**
 * The products matching `query`, best first (then catalogue order), at most
 * `limit`. An empty query matches nothing.
 */
export function search(index: SearchIndex, query: string, limit = 8): ClientProduct[] {
  const terms = [...new Set(words(query))];
  if (terms.length === 0 || limit <= 0) return [];
  const scored: Array<{ entry: IndexEntry; score: number }> = [];
  for (const entry of index) {
    let total = 0;
    for (const term of terms) {
      const s = termScore(term, entry);
      if (s === 0) {
        total = 0;
        break;
      }
      total += s;
    }
    if (total > 0) scored.push({ entry, score: total });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.position - b.entry.position)
    .slice(0, limit)
    .map((s) => s.entry.product);
}
