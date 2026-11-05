#!/bin/sh
# Dumps the production database to $BACKUP_DIR (default ~/backups) and keeps the last 14 days.
# Cron (daily, 03:00): 0 3 * * * /path/to/repo/scripts/backup.sh
# Restore: docker compose -f compose.prod.yaml exec -T db pg_restore -U coffee -d coffee --clean --if-exists < FILE
set -eu
cd "$(dirname "$0")/.."
dir="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$dir"
file="$dir/unground-$(date +%F).dump"
docker compose -f compose.prod.yaml exec -T db pg_dump -U coffee -Fc coffee > "$file.tmp"
mv "$file.tmp" "$file"
find "$dir" -name 'unground-*.dump' -mtime +14 -delete
