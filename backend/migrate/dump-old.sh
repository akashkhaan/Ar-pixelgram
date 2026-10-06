#!/usr/bin/env bash
# Purane Supabase project ka data dump karta hai (public + auth + storage schemas).
# Chahiye: purane project ka database password (Supabase dashboard > Settings > Database)
# Usage: bash backend/migrate/dump-old.sh '<OLD_DB_CONNECTION_STRING>'
# Example string: postgresql://postgres:PASSWORD@db.jfizzduvmzavtqwzqacy.supabase.co:5432/postgres
set -euo pipefail

OLD_DB="${1:-}"
if [[ -z "$OLD_DB" ]]; then
  echo "Usage: bash backend/migrate/dump-old.sh 'postgresql://postgres:PASS@db.xxx.supabase.co:5432/postgres'"
  exit 1
fi

mkdir -p /tmp/pixelgram-migrate
echo "==> Dump le raha hoon (public, auth, storage)..."
pg_dump "$OLD_DB" \
  --format=custom \
  --schema=public --schema=auth --schema=storage \
  --no-owner --no-privileges \
  -f /tmp/pixelgram-migrate/old-backup.dump

echo "==> Dump ready: /tmp/pixelgram-migrate/old-backup.dump"
ls -lh /tmp/pixelgram-migrate/old-backup.dump
