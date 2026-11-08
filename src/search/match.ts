// Product search over the embedded client catalogue (spec 2.7). Pure: no DOM,
// unit tested; src/scripts/search.ts wires it to the header dialog.
//
// A product matches when every word of the query starts a word of its name,
// its category name or one of its keywords, ignoring case, accents and
// punctuation ("hibis" finds "Fleurs d'hibiscus", "karkade" finds "karkadé",
// "the" finds the "thé" keyword). Synonyms live in the product `keywords`.
// When nothing matches exactly, a second pass forgives one typo per word of
// four letters or more ("hibicus", "moringua", "cacoa").
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

/** Shortest query word that may carry a typo: shorter ones match exactly. */
export const FUZZY_MIN_LENGTH = 4;

/**
 * Whether `term` is at most one edit (an insertion, a deletion, a substitution
 * or two neighbouring letters swapped) away from `word` or from a beginning of
 * `word`: "hibicus" and "hibiscus", "moringua" and "moringa", "hibsi" and
 * "hibiscus". Both are normalised.
 */
export function nearPrefix(term: string, word: string): boolean {
  const m = term.length;
  const n = word.length;
  if (n < m - 1) return false;
  // Optimal string alignment distance between term and each prefix of word,
  // row by row over term; the answer is the smallest value of the last row.
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const row = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = term[i - 1] === word[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && term[i - 1] === word[j - 2] && term[i - 2] === word[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1);
      }
      row.push(d);
    }
    if (Math.min(...row) > 1) return false;
    prev2 = prev;
    prev = row;
  }
  return Math.min(...prev) <= 1;
}

/**
 * Weight of the best word a query term starts. A whole word beats a prefix, the
 * name beats the keywords, which beat the category; an earlier word in the
 * name beats a later one. 0 when the term starts no word. With `fuzzy`, a term
 * of FUZZY_MIN_LENGTH letters or more may be one edit away (nearPrefix).
 */
function termScore(term: string, entry: IndexEntry, fuzzy = false): number {
  let best = 0;
  const tolerant = fuzzy && term.length >= FUZZY_MIN_LENGTH;
  const consider = (list: string[], base: number, byPosition: boolean) => {
    list.forEach((word, i) => {
      const exact = word.startsWith(term);
      if (!exact && !(tolerant && nearPrefix(term, word))) return;
      const score =
        base + (word === term ? 20 : 0) - (exact ? 0 : 10) - (byPosition ? Math.min(i, 9) : 0);
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
 * `limit`. An empty query matches nothing. Exact prefixes first; only when
 * they find nothing does a second pass forgive one typo per word, so a
 * correct query never brings in near misses.
 */
export function search(index: SearchIndex, query: string, limit = 8): ClientProduct[] {
  const terms = [...new Set(words(query))];
  if (terms.length === 0 || limit <= 0) return [];
  const exact = rank(index, terms, false);
  return (exact.length > 0 ? exact : rank(index, terms, true))
    .slice(0, limit)
    .map((s) => s.entry.product);
}

function rank(
  index: SearchIndex,
  terms: string[],
  fuzzy: boolean,
): Array<{ entry: IndexEntry; score: number }> {
  const scored: Array<{ entry: IndexEntry; score: number }> = [];
  for (const entry of index) {
    let total = 0;
    for (const term of terms) {
      const s = termScore(term, entry, fuzzy);
      if (s === 0) {
        total = 0;
        break;
      }
      total += s;
    }
    if (total > 0) scored.push({ entry, score: total });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.position - b.entry.position);
}
