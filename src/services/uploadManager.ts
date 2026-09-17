export type UploadKind = 'story' | 'reel';
export type UploadStatus = 'uploading' | 'complete' | 'error';

export interface UploadJob {
  id: string;
  kind: UploadKind;
  label: string;
  progress: number;
  status: UploadStatus;
  error?: string;
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
}

async function notifyOnPhone(job: UploadJob) {
  if (typeof window === 'undefined') return;

  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;

  try {
    if (cap?.isNativePlatform?.()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const permissions = await LocalNotifications.checkPermissions();
      if (permissions.display !== 'granted') {
        const requested = await LocalNotifications.requestPermissions();
        if (requested.display !== 'granted') return;
      }
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.abs(hash(job.id)),
          title: job.status === 'complete' ? `${job.label} complete` : `${job.label} upload`,
          body: job.status === 'complete' ? 'Upload ho gaya ✅' : `${job.progress}% complete`,
          smallIcon: 'ic_launcher',
          ongoing: job.status === 'uploading',
          autoCancel: job.status !== 'uploading',
        }],
      });
      return;
    }

    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification(
        job.status === 'complete' ? `${job.label} complete` : `${job.label} upload`,
        {
          body: job.status === 'complete' ? 'Upload ho gaya ✅' : `${job.progress}% complete`,
          tag: `ar-upload-${job.id}`,
          renotify: job.status === 'complete',
          data: { url: window.location.origin },
        },
      );
    } else {
      new Notification(job.status === 'complete' ? `${job.label} complete` : `${job.label} upload`, {
        body: job.status === 'complete' ? 'Upload ho gaya ✅' : `${job.progress}% complete`,
        tag: `ar-upload-${job.id}`,
      });
    }
  } catch {
    // Notification permission/plugin unavailable — upload itself should continue.
  }
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return result || 1;
}

function maybeNotify(job: UploadJob) {
  const previous = notifiedAt.get(job.id) ?? -10;
  if (job.status === 'complete' || job.status === 'error' || job.progress - previous >= 10) {
    notifiedAt.set(job.id, job.progress);
    void notifyOnPhone(job);
  }
}

export function requestUploadNotifications() {
  if (typeof window === 'undefined') return;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    void import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.requestPermissions().catch(() => {});
    });
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

export function startUpload(kind: UploadKind, label: string): string {
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: UploadJob = { id, kind, label, progress: 0, status: 'uploading' };
  jobs.set(id, job);
  requestUploadNotifications();
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

export function subscribeToUploads(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getUploadJobs(): UploadJob[] {
  return snapshot();
}