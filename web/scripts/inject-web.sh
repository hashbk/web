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
cp "$ROOT/dist/rustdesk-web.js" "$RUSTDESK_WEB/js/rustdesk-web.js"
echo "Injected dist/rustdesk-web.js -> $RUSTDESK_WEB/js/rustdesk-web.js"