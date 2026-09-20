# AR Pixelgram — Android APK

## Download (asli signed APK)

**[⬇️ Download latest APK](https://github.com/akashkhaan/Ar-pixelgram/releases/latest/download/ar-pixelgram.apk)**

Ye link hamesha GitHub Actions ke latest successful build ka **signed release APK** deta hai
(`.github/workflows/android-apk.yml`). Koi demo/fake file nahi — wahi APK jo phone me install hota hai.

Build kab banta hai:
- `main` branch par push hone par automatically
- ya GitHub → **Actions** → *Build Android APK* → **Run workflow**

Build khatam hone ke baad APK do jagah milta hai:
1. **Releases → latest → `ar-pixelgram.apk`** (upar wala link)
2. Actions run page → **Artifacts → ar-pixelgram-apk**

## Phone notifications ke liye zaroori setup (ek hi baar)

Notifications app band hone par bhi aayen, iske liye Firebase Cloud Messaging chahiye:

1. [Firebase Console](https://console.firebase.google.com) me project banao → Android app add karo
   package name: **`com.arpixelgram.app`** → `google-services.json` download karo.
2. GitHub repo → **Settings → Secrets and variables → Actions** me ye secrets daalo:

   | Secret | Value |
   | --- | --- |
   | `GOOGLE_SERVICES_JSON` | `google-services.json` ka poora content |
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
   | `VITE_VAPID_PUBLIC_KEY` | Web push public key (optional) |

3. Supabase project ke Edge Function secrets me daalo:

   | Secret | Value |
   | --- | --- |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase → Project settings → Service accounts → *Generate new private key* ka poora JSON |

4. Migration apply karo (`supabase/migrations/20260920170000_device_tokens.sql`) — phone tokens
   isi table (`device_tokens`) me save hote hain.

Iske baad phone par ye sab notifications aate hain (app band ho tab bhi):

- Like, comment, reply, follow, story reply, mention — actor ke **naam + profile photo** ke sath
- Direct message — naam + photo, tap karke seedha chat
- **Incoming audio/video call** — caller ka naam + photo ke sath **Answer / Decline** buttons
- **Group call** — group ke sabhi members ko group ka naam + photo ke sath **Join / Decline**
- Group message / group mention — kisne, kis group me bheja, naam + photo ke sath
- Post / Reel / Story upload — 1% se 100% tak live progress notification

Call notification se **Answer/Join** dabane par app khul kar seedha call me join hota hai,
aur call background me chalti rehti hai (ongoing call notification + foreground service).
