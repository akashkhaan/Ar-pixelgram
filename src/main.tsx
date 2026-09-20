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
// Recovery note: an older deploy shipped a caching service worker while
// /sw.js was missing (404), so phones stayed stuck on a stale cached build
// (the endless "reels loading" screen). We now always purge caches, force the
// new worker to activate, and reload once so the fresh app takes over.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // PWA update flow (installed app ko same URL par hi naya build milta hai):
  //  1. har load + har baar app foreground me aane par registration.update()
  //  2. naya worker milte hi use turant activate karo (SKIP_WAITING)
  //  3. jab naya worker control le le, page ko ek hi baar reload karo
  // localStorage ko kabhi clear nahi karte, isliye login session bana rehta
  // hai — update ke baad dobara login nahi karna padta.
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    // Auth client ko persisted session write/refresh complete karne ka ek pal
    // do; turant reload se kuch Android WebViews me session restore race hoti thi.
    window.setTimeout(() => window.location.reload(), 500);
  });

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


void bootLiveWebsite();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background text-foreground">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 text-3xl">
          ⚡
        </div>
        <h2 className="text-lg font-bold mb-2">पेज लोड करने में समस्या आई</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          कृपया नीचे दिया गया बटन दबाकर पेज को रीफ्रेश करें।
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-all shadow-md"
        >
          पेज रीफ्रेश करें
        </button>
      </div>
    }
  >
    <AppWrapper>
      <App />
    </AppWrapper>
  </Sentry.ErrorBoundary>
);
