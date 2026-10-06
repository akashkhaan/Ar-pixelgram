#!/usr/bin/env bash
# Pixelgram self-hosted backend installer (Supabase open-source on your VPS)
# Usage: sudo bash backend/install.sh --domain api.yourdomain.com
set -euo pipefail

DOMAIN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then echo "Run as root: sudo bash backend/install.sh --domain api.yourdomain.com"; exit 1; fi
if [[ -z "$DOMAIN" ]]; then echo "Missing --domain (e.g. api.yourdomain.com)"; exit 1; fi

echo "==> [1/8] System update + basics"
apt-get update -y
apt-get install -y curl git ufw nodejs npm ca-certificates gnupg

echo "==> [2/8] Docker install"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

echo "==> [3/8] 2GB swap (agar pehle se nahi hai)"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> [4/8] Supabase official docker setup clone"
mkdir -p /opt/pixelgram
cd /opt/pixelgram
if [[ ! -d supabase-docker ]]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git supabase-docker
  cd supabase-docker
  git sparse-checkout set docker
  cd ..
fi
cp -r supabase-docker/docker /opt/pixelgram/docker
cd /opt/pixelgram/docker

echo "==> [5/8] Env + keys generate"
if [[ ! -f .env ]]; then
  cp .env.example .env
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  DASHBOARD_PASSWORD=$(openssl rand -hex 12)
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}|" .env
  node /opt/pixelgram/backend/gen-keys.mjs "$JWT_SECRET" > /opt/pixelgram/docker/keys.generated
  ANON_KEY=$(grep ANON_KEY /opt/pixelgram/docker/keys.generated | cut -d= -f2)
  SERVICE_KEY=$(grep SERVICE_ROLE_KEY /opt/pixelgram/docker/keys.generated | cut -d= -f2)
  sed -i "s|^ANON_KEY=.*|ANON_KEY=${ANON_KEY}|" .env
  sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}|" .env
  sed -i "s|^SITE_URL=.*|SITE_URL=https://${DOMAIN}|" .env
  sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://${DOMAIN}|" .env
  sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://${DOMAIN}|" .env
fi

echo "==> [6/8] Pixelgram override + functions + Caddy"
cp /opt/pixelgram/backend/docker-compose.override.yml /opt/pixelgram/docker/
mkdir -p /opt/pixelgram/docker/volumes/functions
cp -r /opt/pixelgram/backend/functions/* /opt/pixelgram/docker/volumes/functions/ 2>/dev/null || true
mkdir -p /opt/pixelgram/caddy
sed "s|API_DOMAIN|${DOMAIN}|g" /opt/pixelgram/backend/caddy/Caddyfile > /opt/pixelgram/caddy/Caddyfile

echo "==> [7/8] Firewall"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "==> [8/8] Start stack"
cd /opt/pixelgram/docker
docker compose pull
docker compose up -d

echo ""
echo "==================================================="
echo " Backend chalu ho gaya!"
echo " API URL: https://${DOMAIN}"
echo " Studio (admin DB UI): https://${DOMAIN}:8443 nahi —"
echo "   Studio http://SERVER_IP:8000 (user: supabase, pass: .env ka DASHBOARD_PASSWORD)"
echo " Keys: /opt/pixelgram/docker/keys.generated"
echo " Agle step: backend/README.md padho (migrate + admin)"
echo "==================================================="
