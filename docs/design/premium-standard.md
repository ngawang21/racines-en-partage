# What a premium shop looks like: the standard this site is held to

A working definition, written for Racines en Partage but usable for any small
brand site. "Premium" is not more decoration. It is the feeling that every
detail was decided by someone who cared, that nothing gets in the way, and
that the product is the hero. Each section ends with the checks a reviewer
runs. The audit of this site against the standard lives in
`premium-audit-2026-11-08.md`.

## 1. Principles

1. The product is the hero. Photography, price, availability and the add
   button are visible in the first viewport of a product page, on a phone too.
2. One idea per screen. A section does one job and says it in one sentence.
3. Calm over clever. Restraint in colour, motion and copy reads as confidence.
4. Invisible correctness compounds. Spacing on a 4 px grid, aligned baselines,
   consistent radii, no orphan words in headings, no layout shift: nobody
   notices one of them, everybody feels all of them.
5. Fast is premium. A page that paints in under a second on a mid-range phone
   feels more expensive than any animation.
6. Honest and specific. Real photos of the real product, exact origins, exact
   weights, prices with the price per kilo, no stock imagery, no vague claims.
7. Mobile is the primary device. Design at 390 px first, then let the layout
   breathe up to 1440 px and beyond.

## 2. Layout and width

- A readable measure wins over edge-to-edge content. Body text stays between
  55 and 75 characters per line; headings may be wider.
- Use a hybrid width: a centred container for text and controls (1200 to
  1320 px), a wider container for product grids on large screens (up to
  1440 px, five columns), and full-bleed for the hero photograph, coloured
  bands and the footer. Full-bleed everything (the "Bootstrap container-fluid"
  look of mass-market shops) stretches text lines past 100 characters on a
  27 inch screen and makes the page feel like a spreadsheet; a narrow fixed
  column on a wide screen feels like a blog. The hybrid keeps the richness of
  wide photography with the comfort of a bounded column.
- Gutters: 20 px on phones, 40 px from 900 px, 56 px from 1440 px.
- Vertical rhythm: sections separated by 64 to 96 px on desktop, 48 to 64 px
  on phones. Related elements sit closer than unrelated ones (the gap says
  what belongs together).
- Grids have stable dimensions: cards keep their aspect ratio, prices and
  buttons do not jump when a label changes length, counters have reserved
  width (tabular numerals).

Checks: no horizontal scroll at 320 px; body measure 55 to 75 ch at every
width; the hero and bands bleed, the text does not; the product grid uses the
room on a 1920 px screen without stretching the cards past 340 px.

## 3. Typography

- Two families at most: a display serif with character (Fraunces, optical
  sizes on) and a quiet humanist sans for the interface (Figtree). The display
  face carries headings, prices and quotes; the sans carries everything that
  must be read fast.
- A fluid scale with clamp(), six steps, line heights 1.05 to 1.15 for display
  sizes and 1.5 to 1.65 for body. Letter spacing tightens slightly above 40 px
  and opens on small caps and eyebrows (0.08 em).
- French typography is correct by construction: narrow no-break spaces before
  ; ! ? % and units, no-break before : and inside guillemets, typographic
  apostrophes, no orphan last word on headings (text-wrap: balance), no widows
  on short paragraphs (text-wrap: pretty where supported).
- Numbers: tabular figures in prices, tables and counters; lining figures in
  phone numbers.
- Fonts are self-hosted, subset to latin, preloaded, with metric-matched
  fallbacks so the swap does not reflow the page.

Checks: no heading orphans at 390 and 1280 px; prices align in the grid; the
fallback font renders within 2 px of the final one.

## 4. Colour

- A palette with a story: here cream and kraft paper (the pouch), forest and
  leaf (the plants), hibiscus red (the drink) and gold (the label). At most
  one saturated accent per screen; red is for the few moments that matter
  (badge, focus ring, a price accent), never for decoration.
- Text contrast at least 4.5:1, non-text (icons, borders that carry meaning,
  stars) at least 3:1. Muted text is still readable: 6:1 or better on the main
  background.
- Surfaces differ by a small step (cream to paper), not by shadows. Shadows
  are soft and tinted with the ink colour, used only for elevation that moves
  (drawer, dialog, card hover).
- Light scheme only when the brand is a warm paper: forced dark mode would
  destroy the materiality. Declare it (`color-scheme: only light`) so the
  browser does not invert form controls.

Checks: automated contrast on every page (axe), a grey-scale screenshot still
has a clear hierarchy.

## 5. Imagery

- Real product photography on consistent backgrounds, consistent light and
  crop. Every pouch at the same scale in the grid.
- Each image has one job: the hero sets the mood, the card shows the pouch,
  the gallery shows the texture, the recipe shows the drink.
- Delivered as AVIF and WebP, responsive widths, explicit dimensions (no
  layout shift), lazy below the fold, eager for the hero with high fetch
  priority. Hero under 150 KB on phones.
- Framing is intentional: the crop rule for a framed photo is decided per
  photo (object-position), not left to the default centre.

Checks: Largest Contentful Paint element is the hero image and lands under
2.5 s on a throttled mid-range phone; no image is stretched or soft.

## 6. Motion

- Purpose first: feedback (press), orientation (where did this come from),
  state (added to cart), continuity (page transition). Nothing animates
  because it looks nice, and nothing a person triggers dozens of times a day
  animates at all.
- Enter and exit use a strong ease-out; movement on screen uses ease-in-out;
  colour changes use ease; constant motion is linear. Durations: press 100 to
  160 ms, popovers 150 to 250 ms, drawers and dialogs 200 to 350 ms, nothing in
  the interface above 400 ms.
- Only transform and opacity animate. Nothing appears from scale(0). Elements
  that can be interrupted use transitions, not keyframes.
- Scroll reveal is subtle (8 to 16 px, 300 to 500 ms, once), staggered by 40
  to 80 ms, and never hides content from a reader who scrolls fast or has
  JavaScript off.
- Reduced motion is honoured: movement is removed, opacity fades may stay.

Checks: every transition lists its properties; `:active` scales pressables to
0.97; the drawer opens in under 300 ms; reduced-motion mode shows no movement.

## 7. Interaction and states

- Every pressable has five states that look designed: default, hover (only on
  hover-capable devices), focus-visible (a ring in the accent colour, 3 px,
  offset 2 to 4 px), active (scale 0.97), disabled (reduced opacity, cursor
  not-allowed, still readable).
- Targets are at least 44 by 44 px on touch devices, with 8 px between
  adjacent targets.
- Feedback is immediate and local: add to cart updates the count, opens the
  drawer or shows a toast within 100 ms; a form button shows a busy state and
  the result replaces the button area, not a browser alert.
- Errors are specific and placed next to the field, in plain language, and
  announced to assistive technology. Success states are visible and calm.
- Nothing depends on a hover to be discoverable; nothing depends on JavaScript
  to be readable (the grid, prices and product pages render without it).

Checks: keyboard-only walk of home, product, cart, checkout; screen reader
walk of the cart drawer and a form; a tap test on a real phone.

## 8. Navigation and phones

- The header is light: wordmark, four to five links at most, language, search
  and cart. Secondary destinations (recipes, order lookup, legal) live in the
  footer and in context, not in the primary menu.
- On phones the menu is a full-height panel with large rows (56 px), the
  language switch and the contact line; it closes on Escape, on backdrop tap
  and on navigation, and it never traps scrolling behind it.
- The header shrinks or hides gently on scroll down and returns on scroll up,
  so the small screen is for the product.
- Sticky, thumb-reachable primary action on product pages (price and add) once
  the main button leaves the viewport; the cart drawer slides from the right
  edge with a visible handle to close.
- Breadcrumbs on inner pages, a back link where a flow has a previous step,
  and the current section marked in the menu.
- Page transitions are instant or a 150 ms crossfade; no full-page loaders.

Checks: one-thumb walk from home to payment at 390 px without pinch or
horizontal scroll; menu open and close under 250 ms; every page reachable in
three taps.

## 9. Commerce specifics

- Product card: photo, name, weight and origin, price with price per kilo,
  stock when it is not plain "in stock", add button. Nothing else.
- Product page: gallery with real thumbnails, name, one-line taste promise,
  facts (weight, origin), price and unit price, stock, quantity and add,
  delivery line (price and free-shipping threshold), promise lines (what the
  product is free from, where it is packed), then description, highlights,
  disclosure sections (ingredients, usage, recipe, nutrition, storage), then
  reviews, then related products. Formats (100 g, 200 g) switch in place.
- Cart: lines with photo, unit price, quantity stepper, remove, a free-shipping
  progress bar, the subtotal and the next step. Cross-sell is two products,
  not a carousel.
- Checkout: the fewest decisions in the clearest order (delivery, then
  payment), one trusted payment page (Stripe), the total always visible, the
  legal consent as one checkbox with the linked terms.
- Trust is shown, not claimed: real reviews with the moderation sentence,
  delivery options with prices and delays, the legal identity (SIRET) in the
  footer pages, a reachable human (phone, e-mail, address with the country).
- After the order: a thanks page that tells what happens next, an e-mail that
  can be found again (order lookup), a review invitation a week later.

Checks: price per kilo everywhere a price is; stock states on cards and
pages; the free-shipping message is consistent between product, cart and
checkout; the thanks page works on refresh and from the e-mail link.

## 10. Content and copy

- Headlines are specific and short; eyebrows name the section (the kicker),
  the title says the idea, the lead says why it matters.
- Product copy describes taste, texture, origin and use, in the owner's voice,
  without health or nutrition claims the label does not support.
- Microcopy is polite and human ("Plus que 12 € pour la livraison offerte"),
  never system-speak ("Error 400").
- Both languages are complete and idiomatic; the English is written, not
  translated word by word.

Checks: a reader understands what the shop sells, where it ships and what it
costs within five seconds of the home page; no placeholder or TODO is visible.

## 11. Performance and robustness

- Budgets per page on a phone: HTML under 60 KB, CSS under 50 KB, JavaScript
  under 40 KB gzipped on storefront pages (the checkout may load its widget on
  demand), fonts under 120 KB total, Largest Contentful Paint under 2.5 s,
  Interaction to Next Paint under 200 ms, Cumulative Layout Shift under 0.05.
- Static HTML first; JavaScript only enhances (cart, search, forms). Scripts
  are external, deferred, split per page, loaded when their DOM exists.
- Works offline-tolerant: a failed API call shows a message and a retry, never
  a blank area; the back/forward cache restores pages cleanly.
- Strict security headers (CSP without inline scripts, HSTS) and no third
  party on the page that is not needed for the task.

Checks: Lighthouse mobile 95 or more on performance, accessibility, best
practices and SEO on home, shop, product and cart; bundle size test in CI.

## 12. Accessibility

- Semantic structure: one h1, landmarks, lists for lists, buttons for actions,
  links for navigation, dialogs that are real dialogs.
- Every image has a purpose-driven alt (or empty when decorative); every icon
  button has a name; every form field has a visible label.
- Colour is never the only signal (stock badges carry text; required fields
  are stated).
- Zoom to 200 percent keeps everything usable; text spacing overrides do not
  break the layout.

Checks: axe clean on every page, manual keyboard and screen reader walks of
the purchase flow in both languages.

## 13. The reviewer's five-minute pass

1. Open the home page on a phone. Does the first screen say what this is and
   what to do next? Is the photo sharp? Does anything move for no reason?
2. Open a product. Can you see price, weight, origin and add to cart without
   scrolling? Does the add button react under the thumb?
3. Open the cart drawer. Is it fast, is the close obvious, does the total
   read at a glance?
4. Resize the browser from 320 to 1920 px. Does any text line exceed 80
   characters? Does any card stretch? Does the header break?
5. Tab through the header and a form. Is the focus ring visible and in the
   brand colour? Does Escape close what Tab opened?

If any answer is no, the site is not premium yet.
