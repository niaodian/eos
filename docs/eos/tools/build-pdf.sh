#!/usr/bin/env bash
# Build the EOS user manual PDF from Markdown (local-first, CJK-safe).
# Pipeline: pandoc (md -> standalone HTML w/ TOC) -> Chrome headless (HTML -> PDF).
# Requires: pandoc, Google Chrome. No network needed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../user-manual.md"
HTML="$HERE/../.user-manual.html"   # transient
PDF="$HERE/../user-manual.pdf"
CSS="$HERE/manual.css"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "1/3 anchor check…"
node "$HERE/check-anchors.mjs" "$SRC"

echo "2/3 pandoc -> HTML…"
pandoc "$SRC" -f gfm -t html5 --standalone --embed-resources \
  --toc --toc-depth=2 -V toc-title="Contents" \
  --metadata title="EOS User Manual" \
  --syntax-highlighting=tango \
  -c "$CSS" -o "$HTML"

echo "3/3 Chrome -> PDF…"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PDF" "file://$HTML" 2>/dev/null
rm -f "$HTML"

echo "done -> $PDF"
