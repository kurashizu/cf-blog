#!/usr/bin/env bash
# Rebuild static/fonts/*.woff2 from the upstream releases.
#
#   scripts/build-fonts.sh [release-tag]      # default: latest of both repos
#
# Jelly Pixel (TakWolf/jelly-pixel-font) only carries Latin plus a few hundred
# Han glyphs and no Hangul, so it serves the Latin range only. Fusion Pixel
# (TakWolf/fusion-pixel-font) shares its 12px grid and advance widths and
# covers 19k Han, all Hangul and kana; it is subset per script and declared
# under the same 'Jelly Pixel' family name in src/app.css (unicode-range picks
# the file). Traditional-Chinese and Japanese Han flavours get their own
# family names, switched on by html:lang in app.css.
#
# Needs: gh (authenticated), uv, unzip.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-}"
WORK="$(mktemp -d)"
OUT="static/fonts"

fetch() { # repo pattern dir
	local args=(-R "TakWolf/$1" -p "$2" -D "$WORK")
	if [ -n "$TAG" ]; then gh release download "$TAG" "${args[@]}"; else gh release download "${args[@]}"; fi
	mkdir -p "$WORK/$3" && unzip -oq "$WORK"/$2 -d "$WORK/$3"
}
fetch jelly-pixel-font 'jelly-pixel-font-12px-monospaced-otf.woff2-*.zip' jelly
fetch fusion-pixel-font 'fusion-pixel-font-12px-monospaced-otf.woff2-*.zip' fusion

HAN='U+4E00-9FFF,U+3400-4DBF,U+F900-FAFF,U+2E80-2FDF,U+3000-303F,U+3200-33FF,U+FF01-FF60,U+FFE0-FFE6'
sub() { # src dst unicodes
	uv run --with fonttools --with brotli pyftsubset "$1" --unicodes="$3" --flavor=woff2 --no-hinting --desubroutinize \
		--layout-features='*' --name-IDs='*' --output-file="$OUT/$2"
	printf '%-24s %8d bytes\n' "$2" "$(stat -f %z "$OUT/$2")"
}
sub "$WORK/jelly/jelly-pixel-12px-monospaced-latin.otf.woff2" jelly-latin.woff2 'U+0000-024F,U+2000-206F,U+2190-21FF,U+2700-27BF,U+FE70-FEFF,U+FF00-FFEF'
sub "$WORK/fusion/fusion-pixel-12px-monospaced-zh_hans.otf.woff2" fusion-han.woff2 "$HAN"
sub "$WORK/fusion/fusion-pixel-12px-monospaced-zh_hant.otf.woff2" fusion-han-hant.woff2 "$HAN"
sub "$WORK/fusion/fusion-pixel-12px-monospaced-ja.otf.woff2" fusion-han-ja.woff2 "$HAN"
sub "$WORK/fusion/fusion-pixel-12px-monospaced-ja.otf.woff2" fusion-kana.woff2 'U+3040-309F,U+30A0-30FF,U+31F0-31FF'
sub "$WORK/fusion/fusion-pixel-12px-monospaced-ko.otf.woff2" fusion-hangul.woff2 'U+AC00-D7AF,U+1100-11FF,U+3130-318F,U+A960-A97F,U+D7B0-D7FF'
cp "$WORK/jelly/OFL.txt" "$OUT/jelly-OFL.txt"
cp "$WORK/fusion/OFL.txt" "$OUT/fusion-OFL.txt"
rm -rf "$WORK"
