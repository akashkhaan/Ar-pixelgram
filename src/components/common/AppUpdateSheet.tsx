import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import {
  AppUpdate, fetchLatestBuild, fetchWhatsNew, isNewer, supportsInAppUpdate,
  type InstalledInfo, type LatestBuild,
} from '@/services/appUpdate';

const CHECK_EVERY_MS = 30 * 60 * 1000;
type Phase = 'idle' | 'downloading' | 'installing' | 'needPermission' | 'error';

/**
 * App khulte hi GitHub par naya APK check karta hai. Naya ho to "kya naya hai"
 * list + neeche Update button dikhata hai. Update app ke andar hi download hoke
 * purane app ke upar install hota hai — login IDs nahi hatti.
 */
const AppUpdateSheet: React.FC = () => {
  const [installed, setInstalled] = useState<InstalledInfo | null>(null);
  const [manifest, setManifest] = useState<LatestBuild | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const lastCheck = useRef(0);
  const dismissedFor = useRef<number>(0);

  const check = useCallback(async () => {
    if (!supportsInAppUpdate()) return;
    if (Date.now() - lastCheck.current < CHECK_EVERY_MS && lastCheck.current) return;
    lastCheck.current = Date.now();
    try {
      const info = await AppUpdate.getInfo();
      setInstalled(info);
      const latest = await fetchLatestBuild();
      if (latest && isNewer(latest, info.versionCode)) {
        setNotes(await fetchWhatsNew(info.commit, latest));
        setManifest(latest);
        if (dismissedFor.current !== latest.versionCode) setOpen(true);
      }
    } catch (e) {
      console.warn('Update check failed', e);
    }
  }, []);

  useEffect(() => {
    if (!supportsInAppUpdate()) return;
    const t = setTimeout(check, 2500);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    let handle: { remove: () => Promise<void> } | undefined;
    AppUpdate.addListener('progress', (p) => { if (p.percent >= 0) setPercent(p.percent); })
      .then((h) => { handle = h; }).catch(() => {});
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisible); void handle?.remove(); };
  }, [check]);

  // Settings se "allow" karke wapas aaye to dobara Update dabane ki zaroorat na pade
  useEffect(() => {
    if (phase !== 'needPermission') return;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const { allowed } = await AppUpdate.canInstall().catch(() => ({ allowed: false }));
      if (allowed) void startUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startUpdate = async () => {
    if (!manifest) return;
    setError('');
    const { allowed } = await AppUpdate.canInstall().catch(() => ({ allowed: true }));
    if (!allowed) {
      setPhase('needPermission');
      await AppUpdate.openInstallSettings().catch(() => {});
      return;
    }
    setPercent(0);
    setPhase('downloading');
    try {
      await AppUpdate.downloadAndInstall({ versionCode: manifest.versionCode });
      setPhase('installing');
    } catch (e: any) {
      setPhase('error');
      setError(e?.message || 'Update download nahi hua. Internet check karke dobara try karo.');
    }
  };

  if (!open || !manifest || !installed) return null;
  const busy = phase === 'downloading';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="App update">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-background text-foreground shadow-2xl">
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Naya update aaya hai</h2>
            <p className="text-sm text-muted-foreground">
              Version {manifest.versionName} · aapke paas {installed.versionName}
            </p>
          </div>
          {!busy && (
            <button
              type="button"
              aria-label="Close"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              onClick={() => { dismissedFor.current = manifest.versionCode; setOpen(false); }}
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          <p className="mb-2 text-sm font-semibold">Kya naya hai</p>
          <ul className="space-y-1.5">
            {(notes.length ? notes : ['Bug fixes aur improvements']).map((n, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          {phase === 'needPermission' && (
            <p className="mb-2 text-xs text-muted-foreground">
              Settings me Pixelgram ke liye "Install unknown apps" ON karo, phir wapas aao — update apne aap shuru ho jayega.
            </p>
          )}
          {phase === 'installing' && (
            <p className="mb-2 text-xs text-muted-foreground">Install screen par "Update" dabao. Aapki login IDs safe rahengi.</p>
          )}
          {phase === 'error' && <p className="mb-2 text-xs text-destructive">{error}</p>}
          {busy && (
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={startUpdate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-base font-semibold text-primary-foreground disabled:opacity-70"
          >
            <Download className="h-5 w-5" />
            {busy ? `Download ho raha hai… ${percent}%` : phase === 'installing' ? 'Dobara install karo' : phase === 'error' ? 'Dobara try karo' : 'Update karo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppUpdateSheet;
