export type UploadKind = 'story' | 'reel' | 'post' | 'video';
export type UploadStatus = 'uploading' | 'complete' | 'error';

export interface UploadJob {
  id: string;
  kind: UploadKind;
  label: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  thumbnailUrl?: string;
}

type Listener = (jobs: UploadJob[]) => void;

const jobs = new Map<string, UploadJob>();
const listeners = new Set<Listener>();
const notifiedAt = new Map<string, number>();

function snapshot(): UploadJob[] {
  return Array.from(jobs.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function emit() {
  const current = snapshot();
  listeners.forEach((listener) => listener(current));
  updateBeforeUnloadGuard();
}

export function hasActiveUploads(): boolean {
  for (const job of jobs.values()) {
    if (job.status === 'uploading') return true;
  }
  return false;
}

// Global browser tab / window exit guard
let beforeUnloadAttached = false;
function beforeUnloadHandler(e: BeforeUnloadEvent) {
  if (hasActiveUploads()) {
    const msg = 'Aapka upload chal raha hai (1 se 100%). Website band karne par upload ruk jayega!';
    e.preventDefault();
    e.returnValue = msg;
    return msg;
  }
}

function updateBeforeUnloadGuard() {
  if (typeof window === 'undefined') return;
  const active = hasActiveUploads();
  if (active && !beforeUnloadAttached) {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadAttached = true;
  } else if (!active && beforeUnloadAttached) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadAttached = false;
  }
}

import { notifyPhone } from "@/lib/notifyPhone";

function renderProgressBar(percent: number): string {
  const total = 10;
  const filled = Math.min(total, Math.max(0, Math.round((percent / 100) * total)));
  return '■'.repeat(filled) + '□'.repeat(total - filled);
}

async function notifyOnPhone(job: UploadJob) {
  if (typeof window === "undefined") return;
  try {
    const isDone = job.status === "complete";
    const isError = job.status === "error";

    let title = "";
    let body = "";

    if (isDone) {
      title = "Pixelgram • Upload Complete! 🎉";
      body = `${job.label} successfully share ho gaya! ✅`;
    } else if (isError) {
      title = "Pixelgram • Upload Failed ⚠️";
      body = job.error || `${job.label} upload nahi ho paya.`;
    } else {
      const bar = renderProgressBar(job.progress);
      title = `Pixelgram • Uploading (${job.progress}%)`;
      body = `${job.label}: ${job.progress}% ${bar} • Website me rahein`;
    }

    notifyPhone({
      title,
      body,
      tag: `upload_${job.id}`,
      progress: isDone ? 100 : job.progress,
      isOngoing: job.status === "uploading",
      image: job.thumbnailUrl || undefined,
    });
  } catch {
    // Notification permission/plugin unavailable
  }
}

function maybeNotify(job: UploadJob) {
  const previous = notifiedAt.get(job.id) ?? -15;
  // Notify at start (0-5%), steps of 5-10%, >=95%, and on finish/error
  if (
    job.status === 'complete' ||
    job.status === 'error' ||
    job.progress >= 99 ||
    job.progress - previous >= 5 ||
    previous < 0
  ) {
    notifiedAt.set(job.id, job.progress);
    void notifyOnPhone(job);
  }
}

export async function requestUploadNotifications(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;

  if (cap?.isNativePlatform?.()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const res = await LocalNotifications.requestPermissions();
      return res.display === 'granted';
    } catch {
      return false;
    }
  } else if ('Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function startUpload(kind: UploadKind, label: string, thumbnailUrl?: string): string {
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: UploadJob = { id, kind, label, progress: 0, status: 'uploading', thumbnailUrl };
  jobs.set(id, job);
  void requestUploadNotifications();
  emit();
  maybeNotify(job);
  return id;
}

export function updateUpload(id: string, progress: number) {
  const job = jobs.get(id);
  if (!job) return;
  job.progress = Math.max(0, Math.min(100, Math.round(progress)));
  job.status = 'uploading';
  emit();
  maybeNotify(job);
}

export function finishUpload(id: string, error?: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = error ? 'error' : 'complete';
  job.progress = error ? job.progress : 100;
  job.error = error;
  emit();
  maybeNotify(job);

  window.setTimeout(() => {
    jobs.delete(id);
    notifiedAt.delete(id);
    emit();
  }, error ? 8000 : 5000);
}

/**
 * Runs a background upload task that is completely detached from any React component lifecycle.
 * The user can navigate anywhere in the website, press back, etc., and the upload keeps running!
 */
export function runBackgroundUpload({
  kind,
  label,
  thumbnailUrl,
  task,
  onSuccess,
  onError,
}: {
  kind: UploadKind;
  label: string;
  thumbnailUrl?: string;
  task: (updateProgress: (p: number) => void) => Promise<void>;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}): string {
  const id = startUpload(kind, label, thumbnailUrl);

  // Execute in microtask / detached promise
  (async () => {
    try {
      await task((p: number) => {
        updateUpload(id, p);
      });
      finishUpload(id);
      onSuccess?.();
    } catch (err: unknown) {
      console.error('Background upload failed:', err);
      const errMsg = err instanceof Error ? err.message : 'Upload fail ho gaya';
      finishUpload(id, errMsg);
      onError?.(err);
    }
  })();

  return id;
}

export function subscribeToUploads(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getUploadJobs(): UploadJob[] {
  return snapshot();
}
