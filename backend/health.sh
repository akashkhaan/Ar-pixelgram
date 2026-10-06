#!/usr/bin/env bash
# Backend health check — sab services chal rahi hain ya nahi.
set -uo pipefail

DOMAIN="${1:-localhost}"

echo "==> Docker containers:"
docker ps --format '  {{.Names}}: {{.Status}}' | grep -E 'supabase|caddy' || echo "  (kuch nahi chal raha!)"

echo ""
echo "==> API health:"
curl -sf "https://${DOMAIN}/rest/v1/" -o /dev/null && echo "  REST: OK" || echo "  REST: FAIL"
curl -sf "https://${DOMAIN}/auth/v1/health" -o /dev/null && echo "  Auth: OK" || echo "  Auth: FAIL"
curl -sf "https://${DOMAIN}/storage/v1/status" -o /dev/null && echo "  Storage: OK" || echo "  Storage: FAIL"

echo ""
echo "==> Disk:"
df -h / | tail -1
