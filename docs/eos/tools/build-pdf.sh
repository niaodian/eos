#!/usr/bin/env bash
# Build the EOS user manual PDF from Markdown (local-first, CJK-safe).
# Pipeline: pandoc (md -> standalone HTML w/ TOC) -> Chrome/Chromium/Edge headless (HTML -> PDF).
# Requires: pandoc + a Chromium-family browser. No network needed.
# Cross-platform (macOS/Linux); on native Windows run it from Git-Bash or WSL (it's a Bash script).
# Override browser detection with:  CHROME="/path/to/browser" docs/eos/tools/build-pdf.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../user-manual.md"
HTML="$HERE/../.user-manual.html"   # transient
PDF="$HERE/../user-manual.pdf"
CSS="$HERE/manual.css"

# Locate a Chromium-family browser for headless PDF. Override with `CHROME="/path/..."`.
# Covers macOS, Linux, and Windows (Git-Bash/WSL path mapping under /c/...).
if [ -z "${CHROME:-}" ]; then
  for cand in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    google-chrome google-chrome-stable chromium chromium-browser microsoft-edge \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
    if command -v "$cand" >/dev/null 2>&1; then CHROME="$cand"; break; fi
  done
fi
if [ -z "${CHROME:-}" ]; then
  echo "build-pdf: no Chrome/Chromium/Edge found — set CHROME=\"/path/to/browser\" and retry." >&2
  exit 1
fi

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
