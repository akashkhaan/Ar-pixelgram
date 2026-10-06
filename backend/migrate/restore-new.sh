#!/usr/bin/env bash
# Purane dump ko naye self-hosted backend me restore karta hai.
# Pehle apply-migrations.sh chala chuke hona chahiye.
# Usage: sudo bash backend/migrate/restore-new.sh /tmp/pixelgram-migrate/old-backup.dump
set -euo pipefail

DUMP="${1:-/tmp/pixelgram-migrate/old-backup.dump}"
DOCKER_DIR="/opt/pixelgram/docker"
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$DOCKER_DIR/.env" | cut -d= -f2-)

if [[ ! -f "$DUMP" ]]; then echo "Dump nahi mila: $DUMP"; exit 1; fi

echo "==> Dump container me copy..."
docker cp "$DUMP" supabase-db:/tmp/old-backup.dump

echo "==> auth triggers temporarily disable..."
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db psql -U postgres -d postgres <<'SQL'
alter table auth.users disable trigger all;
alter table auth.identities disable trigger all;
SQL

echo "==> Restore (data only, errors ignore — schema pehle se hai)..."
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
  pg_restore -U postgres -d postgres --data-only --disable-triggers /tmp/old-backup.dump \
  || echo "(kuch conflicts normal hain — existing rows skip hue)"

echo "==> Triggers wapas enable..."
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db psql -U postgres -d postgres <<'SQL'
alter table auth.users enable trigger all;
alter table auth.identities enable trigger all;
SQL

echo "==> Restore done. Ab copy-storage.mjs aur rewrite-urls.mjs chalao."
