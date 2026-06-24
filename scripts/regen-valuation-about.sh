#!/usr/bin/env bash
# Regenerate src/resources/valuationAbout.json from aspirant-commander's
# classifier CATEGORIES + per-parser strategy registry.
#
# The Värdeutlåtande page's About / transparency disclosure renders this
# snapshot at runtime — no API call. Run this script whenever the commander's
# classifier or parser strategy registry changes, then commit the result.
#
# Usage:
#   COMMANDER_DIR=../aspirant-commander ./scripts/regen-valuation-about.sh
# Defaults COMMANDER_DIR to ../aspirant-commander (sibling checkout).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CLIENT_ROOT="$(cd "$HERE/.." && pwd)"
COMMANDER_DIR="${COMMANDER_DIR:-$CLIENT_ROOT/../aspirant-commander}"
OUT="$CLIENT_ROOT/src/resources/valuationAbout.json"

if [[ ! -d "$COMMANDER_DIR" ]]; then
  echo "aspirant-commander checkout not found at $COMMANDER_DIR" >&2
  echo "Set COMMANDER_DIR=/path/to/aspirant-commander and re-run." >&2
  exit 1
fi

PY="$COMMANDER_DIR/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "commander .venv not found at $PY — bootstrap it first." >&2
  exit 1
fi

cd "$COMMANDER_DIR"
"$PY" -c "from app.valuation_statement.transparency import registry_as_dict; import json; print(json.dumps(registry_as_dict(), ensure_ascii=False, indent=2))" > "$OUT"
echo "Regenerated $OUT"
