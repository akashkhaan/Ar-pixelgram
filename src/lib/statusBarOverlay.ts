import { useEffect } from 'react';

// Android app (APK) me page ko status bar (time wali patti) ke peeche tak
// dikhata hai. Status bar ki height CSS var `--pg-status-bar` me milti hai,
// taaki buttons time ke niche rahein. Website (browser) par kuch nahi badalta.
type StatusBarBridge = { setOverlay?: (on: boolean) => void; getHeightDp?: () => number };

const VAR = '--pg-status-bar';

function bridge(): StatusBarBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { AndroidStatusBar?: StatusBarBridge }).AndroidStatusBar;
}

export function useStatusBarOverlay(enabled: boolean): void {
  useEffect(() => {
    const b = bridge();
    if (!enabled || !b?.setOverlay) return;
    let height = 24;
    try {
      const h = Number(b.getHeightDp?.());
      if (Number.isFinite(h) && h > 0) height = h;
    } catch {
      /* default height */
    }
    const root = document.documentElement;
    root.style.setProperty(VAR, `${height}px`);
    try {
      b.setOverlay(true);
    } catch {
      root.style.removeProperty(VAR);
      return;
    }
    return () => {
      root.style.removeProperty(VAR);
      try {
        b.setOverlay?.(false);
      } catch {
        /* ignore */
      }
    };
  }, [enabled]);
}
