#!/usr/bin/env bash
# Builds the two self-hosted Fraunces files in src/assets/fonts/ from the
# @fontsource-variable/fraunces "full" files (premium standard section 11:
# fonts under 120 KB a page). Axes the site never varies are pinned:
# SOFT 50 (the brand setting), WONK 1 (the default); weights 400 to 600 only.
# The roman keeps optical sizing (9 to 144); the italic, used for accents and
# taglines only, pins it at 48. Latin and Latin Extended-A, plus punctuation
# and the euro sign. Needs fonttools and brotli: pip install fonttools brotli.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=node_modules/@fontsource-variable/fraunces/files
OUT=src/assets/fonts
TMP=$(mktemp -d)
UNICODES="U+0000-017F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD"
python3 -m fontTools.varLib.instancer "$SRC/fraunces-latin-full-normal.woff2" \
  SOFT=50 WONK=1 wght=400:600 -o "$TMP/roman.ttf"
python3 -m fontTools.varLib.instancer "$SRC/fraunces-latin-full-italic.woff2" \
  SOFT=50 WONK=1 wght=400:600 opsz=48 -o "$TMP/italic.ttf"
pyftsubset "$TMP/roman.ttf" --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 \
  --output-file="$OUT/fraunces-roman.woff2"
pyftsubset "$TMP/italic.ttf" --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 \
  --output-file="$OUT/fraunces-italic.woff2"
rm -rf "$TMP"
ls -l "$OUT"
