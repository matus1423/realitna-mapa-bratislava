#!/bin/bash
# Zber pre launchd. Prvý argument je názov behu (kvôli logu), druhý zoznam zdrojov.
#
#   crawl.sh denny    nehnutelnosti,zoznamrealit,bazos
#   crawl.sh tyzdenny topreality
#
# Cache sa zámerne obchádza: zmyslom pravidelného behu je zachytiť zmeny cien
# a inzeráty, ktoré zmizli. Zo starých kópií by sme nezistili ani jedno.
set -uo pipefail

RUN_NAME="${1:?chýba názov behu}"
SOURCES="${2:?chýba zoznam zdrojov}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO/data/logs"
mkdir -p "$LOG_DIR"

LOG="$LOG_DIR/${RUN_NAME}-$(date +%Y-%m-%d).log"

# launchd štartuje s holým PATH, kde node byť nemusí
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export SCRAPE_USE_CACHE=0

cd "$REPO" || exit 1

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') — $RUN_NAME ($SOURCES) ==="
  npm run scrape -- --source "$SOURCES" --limit 20000 --max-pages 90
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') — koniec (exit $?) ==="
} >> "$LOG" 2>&1

# staré logy a HTML cache po čase už nikoho nezaujímajú a len rastú
find "$LOG_DIR" -name '*.log' -mtime +14 -delete 2>/dev/null
find "$REPO/data/cache" -type f -mtime +7 -delete 2>/dev/null
