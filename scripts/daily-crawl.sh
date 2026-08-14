#!/bin/bash
# Denný zber. Spúšťa ho launchd (com.maderovci.realitna-mapa.crawl) o 5:00.
#
# Cache sa zámerne obchádza: zmyslom denného behu je zachytiť zmeny cien
# a inzeráty, ktoré zmizli. Zo starých kópií by sme nezistili ani jedno.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO/data/logs"
mkdir -p "$LOG_DIR"

LOG="$LOG_DIR/crawl-$(date +%Y-%m-%d).log"

# launchd štartuje s holým PATH, kde node byť nemusí
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export SCRAPE_USE_CACHE=0

cd "$REPO" || exit 1

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') — začiatok ==="
  npm run scrape -- --limit 20000 --max-pages 90
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') — koniec (exit $?) ==="
} >> "$LOG" 2>&1

# staré logy a HTML cache po týždni už nikoho nezaujímajú a len rastú
find "$LOG_DIR" -name 'crawl-*.log' -mtime +14 -delete 2>/dev/null
find "$REPO/data/cache" -type f -mtime +7 -delete 2>/dev/null
