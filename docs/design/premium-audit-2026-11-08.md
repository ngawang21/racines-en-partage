# Premium audit, 2026-11-08

The site measured against `premium-standard.md`, sections 2 to 8 and 13, with
the layout and navigation changes of spec 8.1, 8.2 and 8.5 applied in the same
pass. Every page type was walked at 390 and 1280 px (home, shop, category,
product in and out of stock, recipes, about, FAQ, contact, cart, checkout,
thanks with a mocked paid order, 404, customer space), the home, shop and
product pages also at 320, 768, 1024, 1440 and 1920 px. Screenshots and the
scripts that produced them: `out/review/8/` (`shoot.mjs`, `measure.mjs` for
orphans, line lengths, tabular prices and target sizes, `axe.mjs`, `sizes.mjs`,
`menu.mjs`).

Result legend: **pass** (met before this pass), **fixed** (met after a change
made here), **handed** (in the forms and cart worker's files, handed over),
**accepted** (deliberate, with the reason).

## 2. Layout and width

| Check                                                  | Result | Fix or reason                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hybrid width: text column 1200 to 1320 px              | fixed  | `--container` 1280 px (was 1200).                                                                                                                                                                                                                                                                                  |
| Product grids wider, five columns                      | fixed  | `.container-wide` (1440 px) on the shop, category and home selection grids and on the shop and category heads, so title, filters and grid share one edge; five columns from 1600 px. The header bar uses the wide container too.                                                                                   |
| Cards never wider than 340 px                          | pass   | Measured: 268 px at 1920 (five columns), 314 to 342 px between 1440 and 1599 px (four columns). The home selection holds four featured products, so it keeps four columns; it moves to five when the owner features a fifth, and never leaves a lone card on its last row (three cards in the three-column range). |
| Gutters 20 / 40 / 56 px                                | fixed  | 56 px from 1440 px in `tokens.css`.                                                                                                                                                                                                                                                                                |
| Hero photograph and bands full-bleed                   | fixed  | The hero photo runs from its column to the window's right edge on desktop and edge to edge on phones (`overflow-x: clip`, no horizontal scroll). "Comment ça marche" became a full-bleed paper band; story, reviews and commitment bands already bled. The newsletter band and the footer bleed (forms and cart).  |
| No horizontal scroll at 320 px                         | pass   | Measured on every page type at 320, 390, 768, 1024, 1280, 1440 and 1920 px: no overflow.                                                                                                                                                                                                                           |
| Body measure 55 to 75 characters                       | fixed  | FAQ answers ran at 84 to 91 characters a line at 1280 px; `max-width` 56ch (Figtree's "0" is wider than its average glyph). Every other paragraph measured under 80, most under 72.                                                                                                                                |
| Section rhythm 64 to 96 px desktop, 48 to 64 px phones | pass   | `.section` is `clamp(3rem, 2rem + 4.5vw, 6rem)`: 50 px at 390, 90 px at 1280, 96 px from 1420.                                                                                                                                                                                                                     |
| Stable grids: prices and buttons do not jump           | fixed  | At 268 px card width the price per kilo wrapped under some prices only. The card now always prints the price over its price per kilo, so every card in a row has the same two lines.                                                                                                                               |

## 3. Typography

| Check                                                          | Result   | Fix or reason                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two families, Fraunces display, Figtree interface              | pass     |                                                                                                                                                                                                                                                                                                                                                                                     |
| No orphan on headings (balance), no widows (pretty)            | pass     | `text-wrap: balance` on h1 to h4 and eyebrows, `pretty` on paragraphs, list items, captions and quotes (global.css).                                                                                                                                                                                                                                                                |
| Measured orphans at 390 px                                     | accepted | Product names of three words in a 165 px card ("Poudre de / moringa") and two-word category names ("Poudres / végétales") cannot fill two lines evenly; balance already gives the most even break. "Questions fréquentes" at 40 px on a 350 px column is two words on two lines.                                                                                                    |
| Tabular figures on prices and counters                         | pass     | Every element that prints a price (cards, product page, sticky bar, search, formats, cart) uses `tabular-nums`; the cart count too.                                                                                                                                                                                                                                                 |
| Fonts self-hosted, subset, preloaded, metric-matched fallbacks | fixed    | Fraunces is now built by `scripts/subset-fonts.sh` from the fontsource files: SOFT 50 and WONK 1 pinned (the brand never varies them), weights 400 to 600, Latin and Latin Extended-A; the roman keeps optical sizing, the italic pins it at 48. 56 KB and 37 KB instead of 121 KB and 150 KB. The roman and Figtree are preloaded; the fallback faces were already metric-matched. |

## 4. Colour

| Check                               | Result                 | Fix or reason                                                                                                                   |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Contrast (axe) on every page        | pass                   | axe (WCAG 2.2 AA) clean on all page types at 390 and 1280 px, the open menu and the open search dialog, both languages sampled. |
| Stars and meaningful borders at 3:1 | fixed (previous round) | Stars outlined in kraft ink.                                                                                                    |
| One saturated accent per screen     | pass                   | Hibiscus only on the hero accent, badges and the focus ring.                                                                    |
| `color-scheme: only light`          | pass                   |                                                                                                                                 |

## 5. Imagery

| Check                                                               | Result   | Fix or reason                                                                                                                                                                           |
| ------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AVIF and WebP, explicit dimensions, lazy below the fold, eager hero | pass     |                                                                                                                                                                                         |
| Hero `sizes` matches its rendered width                             | fixed    | The bleeding hero is about 58 vw on desktop; `sizes` updated. On desktop its height is `min(75cqi, 76vh, 680px)` so the photo fills its column without becoming taller than the screen. |
| Intentional crops (object-position per frame)                       | pass     | Cards 50% 60%, recipes 50% 70%, hero 50% 55%.                                                                                                                                           |
| Blank frames in full-page captures                                  | accepted | Lazy images not yet requested at capture time; every image loads once scrolled (checked). The capture script now scrolls first.                                                         |

## 6. Motion

| Check                                 | Result | Fix or reason                                                                                                                                                                      |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every transition lists its properties | pass   | No `transition: all` and no transition without a property in the storefront files.                                                                                                 |
| Nothing in the interface above 400 ms | fixed  | Photo zoom on hover (cards, tiles, recipes) 600 to 400 ms; scroll reveal 640 to 480 ms (within the 300 to 500 ms reveal range); hero entrance 560 to 600 ms down to 440 to 500 ms. |
| Page transition 150 ms crossfade      | fixed  | 180 to 150 ms.                                                                                                                                                                     |
| Reduced motion removes movement       | pass   | Reveal, hero entrance, sticky bar slide, menu slide, header tuck and hover zooms are all off under `prefers-reduced-motion`.                                                       |
| Drawer opens under 300 ms             | pass   | 240 ms (`--dur-base`).                                                                                                                                                             |

## 7. Interaction and states

| Check                              | Result | Fix or reason                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hover only on hover devices        | fixed  | Twelve hover rules were not gated (link arrows, breadcrumbs, card titles, category tiles, gallery thumbnails, language pill, legal menu, accordion titles, sort select, FAQ contact links, product eyebrow, header links); all now sit under `@media (hover: hover)`.                                              |
| `:active` press on every pressable | fixed  | Added to the language pill, the format pills, the search close button and the accordion icon. Buttons, chips and pills scale to 0.97; 44 px icon buttons to 0.94 and the 32 px accordion icon to 0.92, where 0.97 would not be seen.                                                                               |
| Focus ring 3 px hibiscus, 2 px gap | pass   | Global `:focus-visible`; the search field shows an inset underline, card and recipe links ring the whole card.                                                                                                                                                                                                     |
| Targets at least 44 by 44 px       | fixed  | Language pill links were 40 by 36 (now at least 44 wide, 44 tall through their hit area); desktop "FAQ" was 34 px wide (header links now at least 44 wide). Card and recipe title links measure 23 to 39 px tall but their hit area is the whole card. Footer links "FAQ" and "Shop" are 32 to 37 px wide: handed. |
| Feedback within 100 ms, local      | pass   | Add to cart opens the drawer and announces; the sticky bar and the search results use the same contract.                                                                                                                                                                                                           |
| Readable without JavaScript        | pass   | The 404 search button stays hidden until the search script runs, so no dead control shows without it.                                                                                                                                                                                                              |
| Mobile menu scrim                  | fixed  | Found while testing: the menu button's press scale made it the containing block of its own fixed scrim, which shrank under the finger, so a tap on the backdrop never closed the menu. No press scale while the menu is open.                                                                                      |

## 8. Navigation and phones

| Check                                                                        | Result | Fix or reason                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header holds four links, search, account, cart                               | fixed  | "Recettes" left the header (desktop and mobile, spec 8.5); a quiet "Nos recettes" link sits in the shop head, the home recipes section keeps its link, the footer has it (forms and cart). Account icon (user outline, accessible name "Mon espace" / "My account") added before the cart.                                                                                                          |
| Phone header fits                                                            | fixed  | With three icons the wordmark stacks "Racines / en Partage" below 480 px with a 36 px medallion, and below 375 px only the medallion shows (the name stays for assistive technology).                                                                                                                                                                                                               |
| Desktop header from 1024 px                                                  | fixed  | At 900 px four links, the language pill and three icons clipped the wordmark; the burger menu now covers phones and small tablets up to 1023 px, and the header tucks on scroll in the same range.                                                                                                                                                                                                  |
| Full-height menu, 56 px rows, contact line and language at the bottom, scrim | fixed  | Panel from the header's bottom edge to the bottom of the screen (`--menu-top` set by `header-menu.ts`, so an announcement bar above the header is respected), 88 vw wide up to 400 px, display-face rows of 56 px, phone and e-mail links (French or international phone format by locale), the language switch, a scrim on the remaining width.                                                    |
| Closes on Escape, backdrop and navigation; scroll locked                     | fixed  | Tested: Escape returns focus to the button, a backdrop tap closes, a link closes, `html` does not scroll behind it. Opens in 240 ms.                                                                                                                                                                                                                                                                |
| Header hides on scroll down, returns on scroll up                            | fixed  | Phones only, transform only, 200 ms strong ease-out, 8 px threshold, never while the menu, the search or the drawer is open or while keyboard focus is in the header, never under reduced motion.                                                                                                                                                                                                   |
| Product essentials in the first phone viewport                               | fixed  | At 390 by 844 the price and the add button sat 1000 to 1250 px down. The sticky buy bar now shows whenever the buy block is off screen, below the fold on arrival included, and hides when the block itself is on screen; the deep breadcrumb shows only the parent as a back link ("‹ Poudres végétales") below 600 px. Photo, price, price per kilo and the add button are in the first viewport. |
| Breadcrumbs on inner pages, current section marked                           | pass   | `aria-current` on the header link and the last crumb; the panel marks the current page with a gold bar.                                                                                                                                                                                                                                                                                             |
| Page transitions                                                             | fixed  | 150 ms crossfade (section 6).                                                                                                                                                                                                                                                                                                                                                                       |

## 13. The five-minute pass

| Question                                                                            | Result                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home on a phone: what is this, what next, sharp photo, nothing moving for no reason | Yes: eyebrow, headline, lead, two actions, the trio photo edge to edge. The entrance is a single 440 to 500 ms rise, off under reduced motion.                                |
| Product: price, weight, origin and add without scrolling                            | Yes on desktop. On a phone the sticky bar holds price, price per kilo and add from arrival; weight and origin come in the first scroll (they are in the bar's name line too). |
| Cart drawer: fast, obvious close, total at a glance                                 | Yes (240 ms, close button in the drawer header, subtotal and free-shipping bar).                                                                                              |
| 320 to 1920 px: no line over 80 characters, no stretched card, header intact        | Yes after the FAQ fix; cards at most 342 px; header checked at 320, 360, 375, 390, 414, 480, 768, 900, 1024, 1280, 1440 and 1920 px.                                          |
| Tab through header and a form: visible ring, Escape closes                          | Yes: menu, search and drawer close on Escape and return focus.                                                                                                                |

## Performance (section 11)

Gzipped, built with `astro build`, script graph followed from each page's
module scripts:

| Page    | HTML    | CSS     | JS      | Budget          |
| ------- | ------- | ------- | ------- | --------------- |
| Home    | 14.7 KB | 16.2 KB | 11.3 KB | 60 / 50 / 40 KB |
| Shop    | 13.1 KB | 13.4 KB | 11.6 KB | 60 / 50 / 40 KB |
| Product | 14.3 KB | 16.2 KB | 11.6 KB | 60 / 50 / 40 KB |

Fonts on a page using both Fraunces styles: 56.5 + 36.9 + 20.2 (Figtree) =
113.6 KB, under the 120 KB budget (about 291 KB before). Scripts are per
component, so pages load only what they render: the sticky bar script on
product pages, the gallery on product pages, the filter on the shop, the
reveal on the home page, the accordion target on pages with disclosures.
Lighthouse was not run in this pass (no throttled device profile on this
machine); the build sizes and the absence of layout-shifting elements are the
evidence until the lead's release check.

## Handed to forms and cart

- Footer: "FAQ" and "Shop" links are 32 to 37 px wide (give the links
  `min-width: 44px` or block rows); the footer uses `.container` while the
  header now uses `.container-wide`, so their edges differ by 80 px from
  1440 px (either is defensible; align if the footer should frame the grid).
- Recipes page: the newsletter band and the footer newsletter show together;
  hide the footer one when a band is on the page.
- Thanks page: the lead breaks "écrivez-/nous" at 1280 px (keep the hyphenated
  pair together with a no-break hyphen U+2011 or `white-space: nowrap`); the
  Point Relais address prints no country (spec 8.4). An order payload the
  renderer does not expect (a relay without `address1`) throws in
  `relay.ts` and leaves "Nous retrouvons votre commande..." on screen instead
  of the load-failed message.
- Customer space, contact, cart and checkout pages were walked and are axe
  clean; no other finding.

## Unresolved

- Lighthouse scores and Largest Contentful Paint on a throttled phone: to be
  measured on the deployed preview.
- `CLAUDE.md` gotcha about Fraunces "full" files: the site now self-hosts the
  instanced files from `src/assets/fonts/`; the business card script still
  reads the full files from fontsource on purpose (print needs every axis).
