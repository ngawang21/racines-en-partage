// A minimal inline link syntax for owner-written text (FAQ answers):
// `[texte](/chemin/)` becomes a link, for internal paths only. Pure: no Astro
// import, unit tested. The page renders the parts as text and <a> elements,
// so Astro escapes every character; nothing is ever inserted as HTML. The
// structured data and any plain-text use (JSON-LD, search) take
// `inlineLinksText`, the labels without the paths.

/** One run of text, or a link when `href` is set. */
export interface InlinePart {
  text: string;
  href?: string;
}

/**
 * `[label](/path/)`: a label without brackets or line breaks, and a
 * root-relative path (one leading slash, not two) made of URL path, query and
 * fragment characters. Anything else, an external URL or `javascript:`
 * included, stays as plain text.
 */
const LINK = /\[([^[\]\n]+)\]\((\/(?!\/)[A-Za-z0-9\-._~/?#=&%+‑]*)\)/g;

/** The French typesetting turns "e-mail" into "e‑mail": paths keep the plain hyphen. */
const plainHyphens = (path: string) => path.replace(/‑/g, '-');

/** The text split into plain runs and internal links, in order; empty runs are dropped. */
export function parseInlineLinks(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: match[1]!, href: plainHyphens(match[2]!) });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** The text with each link reduced to its label: "Sur la [page Recettes](/recettes/)" to "Sur la page Recettes". */
export function inlineLinksText(text: string): string {
  return parseInlineLinks(text)
    .map((p) => p.text)
    .join('');
}
