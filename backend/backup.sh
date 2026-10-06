#!/usr/bin/env bash
# Rozana backup: database + storage files. 7 din purane backup auto-delete.
# Cron: 0 3 * * * /opt/pixelgram/backend/backup.sh
set -euo pipefail

DOCKER_DIR="/opt/pixelgram/docker"
BACKUP_DIR="/opt/pixelgram/backups/$(date +%Y-%m-%d)"
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$DOCKER_DIR/.env" | cut -d= -f2-)

mkdir -p "$BACKUP_DIR"

echo "==> DB backup..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
  pg_dump -U postgres -d postgres --format=custom \
  > "$BACKUP_DIR/db.dump"

echo "==> Storage backup..."
docker run --rm --volumes-from supabase-storage -v "$BACKUP_DIR":/backup alpine \
  tar czf /backup/storage.tar.gz -C /var/lib/storage . 2>/dev/null || echo "(storage backup skip)"

echo "==> 7 din purane backups delete..."
find /opt/pixelgram/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "==> Backup done: $BACKUP_DIR"
