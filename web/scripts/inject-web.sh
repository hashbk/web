#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
RUSTDESK_WEB="$ROOT/../rustdesk/flutter/web"

ENTRY_PATH=$(ls "$ROOT/dist"/rustdesk-web-*.js 2>/dev/null | head -1)
if [ -z "$ENTRY_PATH" ]; then
  echo "error: no rustdesk-web-*.js found in $ROOT/dist. Run 'npm run build' first." >&2
  exit 1
fi
ENTRY_JS=$(basename "$ENTRY_PATH")

mkdir -p "$RUSTDESK_WEB/js"
rm -f "$RUSTDESK_WEB/js"/*.js "$RUSTDESK_WEB/js"/*.wasm 2>/dev/null || true
rm -rf "$RUSTDESK_WEB/js/chunks" "$RUSTDESK_WEB/js/assets" 2>/dev/null || true

cp "$ROOT/dist/$ENTRY_JS" "$RUSTDESK_WEB/js/$ENTRY_JS"
sed -i "s|js/rustdesk-web.js|js/$ENTRY_JS|g" "$RUSTDESK_WEB/index.html"

for subdir in chunks assets; do
  if [ -d "$ROOT/dist/$subdir" ]; then
    mkdir -p "$RUSTDESK_WEB/js/$subdir"
    cp "$ROOT/dist/$subdir"/*.js "$RUSTDESK_WEB/js/$subdir/" 2>/dev/null || true
    cp "$ROOT/dist/$subdir"/*.wasm "$RUSTDESK_WEB/js/$subdir/" 2>/dev/null || true
  fi
done


echo "Injected dist/ -> $RUSTDESK_WEB/js/ (entry: $ENTRY_JS)"
