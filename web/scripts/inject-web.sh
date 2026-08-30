#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
RUSTDESK_WEB="$ROOT/../rustdesk/flutter/web"

if [ ! -f "$ROOT/dist/rustdesk-web.js" ]; then
  echo "error: $ROOT/dist/rustdesk-web.js not found. Run 'npm run build' first." >&2
  exit 1
fi

mkdir -p "$RUSTDESK_WEB/js"
rm -f "$RUSTDESK_WEB/js"/*.js "$RUSTDESK_WEB/js"/*.wasm 2>/dev/null || true
rm -rf "$RUSTDESK_WEB/js/chunks" "$RUSTDESK_WEB/js/assets" 2>/dev/null || true

cp "$ROOT/dist/rustdesk-web.js" "$RUSTDESK_WEB/js/rustdesk-web.js"

for subdir in chunks assets; do
  if [ -d "$ROOT/dist/$subdir" ]; then
    mkdir -p "$RUSTDESK_WEB/js/$subdir"
    cp "$ROOT/dist/$subdir"/*.js "$RUSTDESK_WEB/js/$subdir/" 2>/dev/null || true
    cp "$ROOT/dist/$subdir"/*.wasm "$RUSTDESK_WEB/js/$subdir/" 2>/dev/null || true
  fi
done

cp "$ROOT/dist"/*.wasm "$RUSTDESK_WEB/js/" 2>/dev/null || true

echo "Injected dist/ -> $RUSTDESK_WEB/js/"
