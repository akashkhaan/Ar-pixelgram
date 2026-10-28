import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";
import { bootLiveWebsite } from "./native-live";

Sentry.init({
  dsn: import.meta.env['VITE_SENTRY_DSN'] as string | undefined,
  environment: import.meta.env.MODE,
});

// Register the service worker as early as possible, unconditionally. This is
// what makes the browser treat the site as an installable PWA (together with
// /manifest.json) — on Android that produces a real WebAPK with its own
// "Notifications" toggle in phone Settings → Apps. Without an active SW
// registration here, the OS has nothing to attach a per-app permission to.
//
// The worker handles notifications and does not cache app assets.
// Activate updates in the background; a forced reload during controller changes
// can interrupt camera/auth startup on Android and leave the page black.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // PWA update flow (installed app ko same URL par hi naya build milta hai):
  //  1. har load + har baar app foreground me aane par registration.update()
  //  2. naya worker milte hi use turant activate karo (SKIP_WAITING)
  // Page ko controller change par reload nahi karte, taaki camera/session restore
  // Android browser me interrupt hokar black screen na dikhaye.
  // localStorage ko kabhi clear nahi karte, isliye login session bana rehta
  // hai — update ke baad dobara login nahi karna padta.
  window.addEventListener('load', () => {
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');

        const promote = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        };

        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        promote(reg.installing);
        reg.addEventListener('updatefound', () => promote(reg.installing));

        const checkForUpdate = () => { reg.update().catch(() => { /* noop */ }); };
        checkForUpdate();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        // Lambi chalne wali installed app ke liye periodic check.
        setInterval(checkForUpdate, 60 * 60 * 1000);
      } catch {
        /* noop */
      }
    })();
  });
}


// Local bundle instant boot

try {
  if (typeof window !== 'undefined') {
    (window as any).AndroidNotification?.setWebReady?.();
  }
} catch {}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={({ error }: { error?: any }) => (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background text-foreground">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 text-3xl">
          ⚡
        </div>
        <h2 className="text-lg font-bold mb-2">पेज लोड करने में समस्या आई</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          कृपया नीचे दिया गया बटन दबाकर पेज को रीफ्रेश करें।
        </p>
        {error && (
          <div className="mb-4 p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-mono max-w-sm overflow-auto text-left">
            {error?.message || String(error)}
          </div>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const r of regs) await r.unregister();
              }
              if ('caches' in window) {
                const keys = await caches.keys();
                for (const k of keys) await caches.delete(k);
              }
            } catch {}
            window.location.reload();
          }}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-all shadow-md"
        >
          पेज रीफ्रेश करें
        </button>
      </div>
    )}
  >
    <AppWrapper>
      <App />
    </AppWrapper>
  </Sentry.ErrorBoundary>
);
