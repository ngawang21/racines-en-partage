# Branding

`logo-full.png`, `logo-white-bg.png` and `hibiscus-mark.png` are reference
exports of the owner's logo. The site's own copies (`logo-full.webp`,
`medallion.webp`, the icons) come from `pnpm brand <master.png>`, see
`src/assets/brand/README.md`. Palette and fonts: `src/styles/tokens.css`.

## Business card

`card/card.html` is the source of the card: 85 x 55 mm, printed on a
91 x 61 mm sheet (3 mm bleed), every text and the QR code at least 5 mm
inside the trim. One template holds three directions, picked by the body's
`data-variant`:

| Variant     | Recto                                                       | Verso                                                                |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `medaillon` | cream, the painted medallion in a gold ring, the wordmark   | forest, tagline, gold hairline, phone and e-mail, QR on a cream tile |
| `kraft`     | kraft, the small hibiscus, stacked wordmark, tagline        | cream, wordmark and contacts left, QR right, kente strip at the foot |
| `foret`     | forest, gold hibiscus between hairlines, wordmark, tagline  | cream, centred stack: QR, gold hairline, phone and e-mail            |

`kraft` is the published variant (the owner's choice, 2026-11-08).

Regenerate after a change of phone, e-mail, tagline or site URL:

    pnpm card              # kraft, published
    pnpm card medaillon    # or foret: publishes that variant instead
    pnpm card review       # all three into out/review/card/ plus comparison.png

The script (`scripts/business-card.mjs`) reads the brand name, tagline,
phone, e-mail and address from `src/content/settings/shop.yml` and the site
URL from `src/consts.ts`, renders the template with the Playwright Chromium
(`CHROME=<binary>` overrides it; `$HOME/.local/lib` is added to
`LD_LIBRARY_PATH` when it exists) and embeds Fraunces and Figtree from
`node_modules` through file URLs. The QR code encodes
`https://racinesenpartage.fr/` (error correction M, 4-module quiet zone,
forest on cream, 18.5 mm wide without the quiet zone).

Outputs, committed, written to `docs/branding/card/` and copied to
`public/carte/` (served on `/carte/`):

| File                                       | Use                                              |
| ------------------------------------------ | ------------------------------------------------ |
| `racines-en-partage-carte.pdf`             | print: two pages, 91 x 61 mm, recto then verso   |
| `racines-en-partage-carte-recto.png`       | recto, 300 dpi, with bleed (1075 x 720)          |
| `racines-en-partage-carte-verso.png`       | verso, 300 dpi, with bleed                       |
| `racines-en-partage-carte-numerique.png`   | both faces, 1080 x 1920, for WhatsApp            |
| `racines-en-partage-carte-recto-apercu.png`| recto preview for `/carte/`, 960 px, no bleed    |
| `racines-en-partage-carte-verso-apercu.png`| verso preview for `/carte/`, 960 px, no bleed    |

The same run writes the contact card `public/racines-en-partage.vcf`
(vCard 3.0: name, organisation, phone, e-mail, site, address). The page
`/carte/` (`/en/card/`, noindex, reached by its URL only: no site link since
review 13, the owner keeps it in her bookmarks) shows the previews
and offers the PDF, the shareable image and the vCard.

For the printer: 85 x 55 mm, 3 mm bleed, 300 dpi, RGB; the printer converts
to CMYK. The PDF embeds the fonts as Type 3 outlines (Chromium does this for
variable fonts), which print services accept; the medallion is embedded at
its full resolution (about 600 dpi at 30 mm). The site build never depends
on Chromium.
