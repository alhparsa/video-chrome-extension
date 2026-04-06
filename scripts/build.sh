#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json | head -n 1)"
ARCHIVE="velocity-player-v${VERSION}.zip"

rm -f "$ARCHIVE"
zip -r "$ARCHIVE" . \
  -x "*.git*" \
  -x ".claude/*" \
  -x "scripts/*" \
  -x "store/*" \
  -x "*.DS_Store" \
  -x "*.zip"

echo "Created $ARCHIVE"
