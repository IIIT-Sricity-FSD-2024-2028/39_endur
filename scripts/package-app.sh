#!/usr/bin/env bash
# Turns a built checkout into the ready-to-run zip that Azure runs and GitHub Releases attach.
#
#   bash scripts/package-app.sh <built-dir> <out.zip>
#
# <built-dir> must already have run `npm ci`, `npm run build` and `npm prune --omit=dev`.
# Used by scripts/deploy-azure.sh and .github/workflows/release.yml, so both ship the same thing.
#
# Run it: cd src/backend && node --conditions=compiled dist/server.js
set -euo pipefail

SRC="$(cd "${1:?usage: package-app.sh <built-dir> <out.zip>}" && pwd)"
OUT="${2:?usage: package-app.sh <built-dir> <out.zip>}"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

for needed in src/backend/dist src/frontend/dist packages/shared/dist node_modules; do
  [[ -d "$SRC/$needed" ]] || { echo "Missing $needed in $SRC: build it first"; exit 1; }
done

PKG="$(mktemp -d)"
trap 'rm -rf "$PKG"' EXIT
mkdir -p "$PKG/src/backend" "$PKG/src/frontend"

cp -a "$SRC/node_modules" "$PKG/"
# Workspace packages are symlinks in node_modules, and a zip upload does not keep symlinks.
# @endur/shared becomes a real copy; the two app links are not needed at runtime.
rm -rf "$PKG/node_modules/@endur/api" "$PKG/node_modules/@endur/web" "$PKG/node_modules/@endur/shared"
mkdir -p "$PKG/node_modules/@endur/shared"
cp -a "$SRC/packages/shared/package.json" "$SRC/packages/shared/dist" "$PKG/node_modules/@endur/shared/"
cp -a "$SRC/src/backend/dist" "$SRC/src/backend/package.json" "$PKG/src/backend/"
cp -a "$SRC/src/frontend/dist" "$PKG/src/frontend/"
if [[ -d "$SRC/src/backend/node_modules" ]]; then cp -a "$SRC/src/backend/node_modules" "$PKG/src/backend/"; fi

rm -f "$OUT"
(cd "$PKG" && zip -qr "$OUT" .)
echo "Package: $OUT ($(du -h "$OUT" | cut -f1))"
