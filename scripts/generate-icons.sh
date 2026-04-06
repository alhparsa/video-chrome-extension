#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/assets/icon-source.svg"

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Missing $SOURCE_ICON"
  echo "Add an SVG source asset before wiring automated icon generation."
  exit 1
fi

echo "Icon generation is not wired yet. Add your preferred rasterization command here."
