#!/usr/bin/env bash
# Restores a MongoDB backup made by backup.sh. This REPLACES the current data in product_tracking.
# Usage: scripts/restore-mongo.sh backups/mongo-<stamp>.archive.gz
set -euo pipefail
cd "$(dirname "$0")/.."
file=${1:?Usage: scripts/restore-mongo.sh backups/mongo-<stamp>.archive.gz}
[ -f "$file" ] || { echo "No such file: $file"; exit 1; }
read -r -p "This replaces all current data. Type YES to continue: " answer
[ "$answer" = "YES" ] || { echo "Cancelled"; exit 1; }
docker compose exec -T mongo mongorestore --archive --gzip --drop < "$file"
echo "Restored from $file"
