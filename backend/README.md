# Pixelgram — Khud Ka Backend (Self-Hosted Supabase)

Ye tumhara apna backend hai — Supabase ka open-source version tumhare VPS par.
Koi 5 GB limit nahi, koi 402 error nahi, koi upgrade nahi. Sab kuch tumhara.

## Kya-kya milta hai (sab free, koi per-feature charge nahi)

- Database (PostgreSQL) — wahi jo abhi Supabase me hai
- Login/Auth (email, phone OTP)
- File storage (photos, reels, videos)
- Edge functions (push notifications, OTP, admin tools)
- Studio (database dekhne ka UI)
- Rozana auto-backup

## Setup ke steps (summary — detail ke liye VPS.md padho)

1. **VPS lo** (Hostinger KVM 2, ₹799/mo, India DC, Ubuntu 24.04) — detail `VPS.md` me
2. **Domain ka DNS**: `api.yourdomain.com` → VPS ka IP (A record)
3. **Server par repo clone karo:**
   ```bash
   git clone https://github.com/akashkhaan/Ar-pixelgram.git /opt/pixelgram/repo
   mkdir -p /opt/pixelgram/backend
   cp -r /opt/pixelgram/repo/backend/* /opt/pixelgram/backend/
   ```
4. **Install:**
   ```bash
   sudo bash /opt/pixelgram/backend/install.sh --domain api.yourdomain.com
   ```
5. **Secrets daalo** — `/opt/pixelgram/docker/.env` me `.env.production` wali values
   (ADMIN_PASSWORD, FIREBASE_SERVICE_ACCOUNT_JSON, VAPID keys, Twilio/Resend optional)
6. **Tables banao:**
   ```bash
   sudo bash /opt/pixelgram/backend/migrate/apply-migrations.sh
   ```
7. **Purana data lao** (jab switch karna ho):
   ```bash
   bash backend/migrate/dump-old.sh '<purana DB connection string>'
   sudo bash backend/migrate/restore-new.sh
   node backend/migrate/copy-storage.mjs     # env set karke
   node backend/migrate/rewrite-urls.mjs     # env set karke
   node backend/migrate/ensure-admin.mjs     # admin account
   ```
8. **Website ko naye backend se connect** — sirf `VITE_SUPABASE_URL` aur
   `VITE_SUPABASE_ANON_KEY` naye wale daalne hain. Code same rahega.

## Admin panel

Website ka admin panel (src/pages/admin/) waisa hi kaam karega —
`arpixelgram@gmail.com` se login karo, `profiles.is_admin = true` pehle se set hoga.

## Backup

`backup.sh` rozana raat 3 baje chalane ke liye cron lagao:
```bash
(crontab -l; echo "0 3 * * * /opt/pixelgram/backend/backup.sh") | crontab -
```

## Health check

```bash
bash /opt/pixelgram/backend/health.sh api.yourdomain.com
```
