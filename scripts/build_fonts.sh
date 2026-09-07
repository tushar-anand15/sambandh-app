#!/usr/bin/env bash
#
# Rebuild the vendored webfonts in frontend/public/fonts/.
#
# The site makes zero external requests, so the fonts have to be files we own.
# This script exists so those .woff2 files are reproducible rather than three
# binaries someone once produced on a laptop: without a recorded recipe the
# next person who needs a heavier weight, an extra glyph or a security rebuild
# has to guess at the subset ranges, and a guess that drops one range is a
# defect nobody sees until a page renders tofu.
#
# Requires fonttools with Brotli:
#
#     python3 -m venv .venv && .venv/bin/pip install 'fonttools[woff]' brotli
#     .venv/bin/python scripts/... -- or just put pyftsubset on PATH
#
# Usage:  ./scripts/build_fonts.sh
#         PYTHON=/path/to/venv/bin/python ./scripts/build_fonts.sh
#
# ---------------------------------------------------------------------------
# Why these choices
#
# * Public Sans 2.001 publishes a variable TTF and no variable WOFF2 at all
#   (uswds/public-sans#137), so the browser-ready file does not exist upstream
#   and has to be built here. pyftsubset keeps `fvar`/`gvar` by default, so the
#   weight axis survives with no special flag.
# * There is no `ital` axis in Public Sans. Roman and italic are two separate
#   files and two separate @font-face blocks; asking the roman file for italic
#   gets a synthesised oblique.
# * Public Sans carries no Malayalam, and the site renders Malayalam body
#   names, ward names and assistant answers. Noto Sans Malayalam is a second
#   family in the stack, never merged into the first: per-character fallback
#   walks the family list, and one family name that claims both scripts but
#   only ships one is exactly how you get tofu.
# * The Malayalam subset keeps ZWNJ/ZWJ (U+200C-200D) and `--layout-features=*`.
#   Malayalam conjuncts are built by `akhn`/`pref`/`blwf`/`pstf` plus the zero
#   width joiners; drop either and the script breaks silently into a row of
#   separate consonants that still looks like text.
# * Filenames carry the upstream version. They are served with
#   `Cache-Control: immutable` (see frontend/nginx.conf), which is only safe
#   because the bytes behind a given name never change -- a new version is a
#   new name, and the preload in index.html moves with it.
# ---------------------------------------------------------------------------

set -euo pipefail

# fontTools stamps head.modified with the current time unless this is set, so
# without it two runs of this script produce different bytes and "reproducible"
# is a claim nobody can check.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"

PYTHON="${PYTHON:-python3}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/frontend/public/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PUBLIC_SANS_VERSION="2.001"     # -> v2001 in the filename
NOTO_ML_VERSION="2.104"         # -> v2104

PUBLIC_SANS_TAG="v${PUBLIC_SANS_VERSION}"
PS_BASE="https://raw.githubusercontent.com/uswds/public-sans/${PUBLIC_SANS_TAG}/fonts/variable"
NOTO_BASE="https://raw.githubusercontent.com/google/fonts/main/ofl/notosansmalayalam"

# Latin subset: Basic Latin + Latin-1, the dotless i and the OE ligatures,
# general punctuation (quotes, dashes, the ellipsis), the superscript four the
# footnote markers use, the euro and the trademark sign. This is the range
# Google Fonts calls "latin"; it is deliberately not "latin-ext", because the
# site's Latin content is English and transliterated Malayalam.
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+2074,U+20AC,U+2122"

# Malayalam block, plus the joiners the script cannot be shaped without, plus
# danda and double danda, which Indic text uses as full stops.
MALAYALAM="U+0D00-0D7F,U+200C-200D,U+0964-0965"

fetch() {
  echo "  fetch $2"
  curl -sSfL --retry 3 -o "$WORK/$2" "$1/$(printf '%s' "$2" | sed 's/\[/%5B/g; s/\]/%5D/g; s/,/%2C/g')"
}

subset() {
  local src="$1" dst="$2" ranges="$3"
  "$PYTHON" -m fontTools.subset "$WORK/$src" \
    --output-file="$OUT/$dst" \
    --flavor=woff2 \
    --unicodes="$ranges" \
    --layout-features='*' \
    --name-IDs='*' \
    --name-legacy \
    --notdef-outline \
    --no-hinting \
    --desubroutinize
  printf '  %-40s %s bytes\n' "$dst" "$(wc -c < "$OUT/$dst" | tr -d ' ')"
}

mkdir -p "$OUT"

echo "Public Sans ${PUBLIC_SANS_VERSION} (variable, wght 100-900)"
fetch "$PS_BASE" 'PublicSans[wght].ttf'
fetch "$PS_BASE" 'PublicSans-Italic[wght].ttf'
subset 'PublicSans[wght].ttf'        "PublicSans-Roman-VF-v${PUBLIC_SANS_VERSION//./}.woff2"  "$LATIN"
subset 'PublicSans-Italic[wght].ttf' "PublicSans-Italic-VF-v${PUBLIC_SANS_VERSION//./}.woff2" "$LATIN"

echo "Noto Sans Malayalam ${NOTO_ML_VERSION} (variable, wght 100-900)"
fetch "$NOTO_BASE" 'NotoSansMalayalam[wdth,wght].ttf'
# google/fonts publishes from a moving branch and has no per-family tag, so the
# only way to pin this one is to check what arrived. A silent upstream bump
# would otherwise ship new outlines under the old, immutable-cached filename.
got="$("$PYTHON" -c "from fontTools.ttLib import TTFont; import sys; print(TTFont(sys.argv[1])['name'].getDebugName(5).split()[-1])" "$WORK/NotoSansMalayalam[wdth,wght].ttf")"
if [ "$got" != "$NOTO_ML_VERSION" ]; then
  echo "  upstream Noto Sans Malayalam is $got, this script expects $NOTO_ML_VERSION." >&2
  echo "  Bump NOTO_ML_VERSION here and the filename in index.css and index.html." >&2
  exit 1
fi
# The upstream file carries a `wdth` axis that only narrows (62.5-100, default
# 100). Nothing on the site asks for a condensed Malayalam, and every axis kept
# is deltas carried in every download, so pin it at its default and ship the
# weight axis alone.
"$PYTHON" -m fontTools.varLib.instancer \
  "$WORK/NotoSansMalayalam[wdth,wght].ttf" wdth=100 \
  --output "$WORK/NotoSansMalayalam[wght].ttf" >/dev/null
subset 'NotoSansMalayalam[wght].ttf' "NotoSansMalayalam-VF-v${NOTO_ML_VERSION//./}.woff2" "$MALAYALAM"

echo
echo "Done. If a version changed, update the @font-face src and the preload:"
echo "  frontend/src/index.css   frontend/index.html"
