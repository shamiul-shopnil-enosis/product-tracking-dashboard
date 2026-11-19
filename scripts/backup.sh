#!/usr/bin/env bash
# Backs up MongoDB and the secrets + .env files into ./backups, and keeps the newest 14 of each.
# Run from anywhere: it works relative to the project folder. Schedule it daily with cron (see RUNBOOK.md).
set -euo pipefail
cd "$(dirname "$0")/.."
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
umask 077

docker compose exec -T mongo mongodump --db product_tracking --archive --gzip > "backups/mongo-$stamp.archive.gz"
tar czf "backups/config-$stamp.tar.gz" .env secrets 2>/dev/null
# Uploaded screenshots live in a Docker volume
docker compose exec -T api tar czf - -C /data uploads > "backups/uploads-$stamp.tar.gz"

for prefix in mongo config uploads; do
  ls -1t backups/$prefix-* 2>/dev/null | tail -n +15 | xargs -I{} rm -f {}
done
echo "Backup written: backups/*-$stamp.*"
