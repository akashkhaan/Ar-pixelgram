#!/usr/bin/env bash
# Repo ke saare SQL migrations naye backend ke db me apply karta hai.
# Usage: sudo bash backend/migrate/apply-migrations.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_DIR/supabase/migrations"
DOCKER_DIR="/opt/pixelgram/docker"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Migrations folder nahi mila: $MIGRATIONS_DIR"
  exit 1
fi

POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$DOCKER_DIR/.env" | cut -d= -f2-)

echo "==> Migrations apply ho rahe hain (27 files)..."
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name=$(basename "$f")
  echo "  -> $name"
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" \
    || echo "  !! $name me error (upar dekho) — continue kar raha hoon"
done

echo "==> Ho gaya. Ab storage buckets bana raha hoon..."
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db psql -U postgres -d postgres <<'SQL'
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('posts', 'posts', true),
  ('stories', 'stories', true),
  ('reels', 'reels', true),
  ('videos', 'videos', true),
  ('group-media', 'group-media', true)
on conflict (id) do nothing;
SQL

echo "==> Done."
