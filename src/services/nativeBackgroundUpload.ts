import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/db/supabase';
import type { PersistentUploadJob } from './persistentUploadQueue';
import { nativeUploadPayload } from './nativeUploadPayload';
import { doneUrlFor, startUpload, updateUpload, finishUpload } from './uploadManager';
import { notifyFollowersOfNewContent } from './api';

interface NativeState {
  id: string; persistentJobId: string; userId: string; kind: PersistentUploadJob['kind']; label: string;
  status: 'staging' | 'queued' | 'uploading' | 'complete' | 'error'; progress: number;
  recordId?: string; error?: string; caption?: string; visibility?: string; notified?: boolean;
}
interface UploadPlugin {
  prepare(data: Record<string, unknown>): Promise<void>;
  appendChunk(data: { id: string; part: 'media' | 'cover'; data: string }): Promise<void>;
  enqueue(data: { id: string }): Promise<void>;
  resume(): Promise<void>;
  list(): Promise<{ jobs: NativeState[] }>;
  acknowledge(data: { id: string }): Promise<void>;
  markNotified(data: { id: string }): Promise<void>;
}
const NativeUpload = registerPlugin<UploadPlugin>('BackgroundUpload');
const uiIds = new Map<string, string>();
const callbacks = new Map<string, { resolve: (id: string) => void; reject: (error: Error) => void }>();
let timer: ReturnType<typeof setInterval> | undefined;
let reconciliation: Promise<Set<string>> | undefined;
let installed = false;

export function supportsNativeBackgroundUpload(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('BackgroundUpload');
}

async function copyBlob(id: string, part: 'media' | 'cover', blob: Blob) {
  // Bounded bridge messages, never one enormous base64 allocation for a video.
  const chunkBytes = 512 * 1024;
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await NativeUpload.appendChunk({ id, part, data: btoa(binary) });
  }
}

export async function startNativeBackgroundUpload(job: PersistentUploadJob, existingUiId?: string): Promise<{ recordId: string } | null> {
  if (!supportsNativeBackgroundUpload()) return null;
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.access_token || session.user.id !== job.userId) throw new Error('Dobara login karke upload karein');
  const id = crypto.randomUUID();
  const base = import.meta.env.VITE_SUPABASE_URL;
  const path = job.storagePath || `${job.userId}/${job.kind}_${id}`;
  const bucket = job.kind === 'story' ? 'stories' : job.kind === 'reel' ? 'reels' : job.kind === 'post' ? 'posts' : 'videos';
  const coverBucket = job.kind === 'video' ? 'videos' : 'posts';
  const coverPath = `${job.userId}/cover_${id}.jpg`;
  const publicUrl = `${base}/storage/v1/object/public/${bucket}/${path}`;
  const coverUrl = job.coverBlob ? `${base}/storage/v1/object/public/${coverBucket}/${coverPath}` : null;
  const recordId = crypto.randomUUID();
  const publishing = nativeUploadPayload(job, publicUrl, coverUrl, recordId);
  await NativeUpload.prepare({ id, persistentJobId: job.id, userId: job.userId, kind: job.kind,
    label: job.label, base, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    accessToken: session.access_token, refreshToken: session.refresh_token,
    bucket, path, contentType: job.fileType || 'application/octet-stream', size: job.fileBlob.size,
    coverBucket, coverPath, coverSize: job.coverBlob?.size || 0, recordId, ...publishing,
    caption: job.caption || '', visibility: job.videoVisibility || 'public' });
  try {
    await copyBlob(id, 'media', job.fileBlob);
    if (job.coverBlob) await copyBlob(id, 'cover', job.coverBlob);
    // Only after all bytes/metadata are owned by Android can the WebView disappear safely.
    await NativeUpload.enqueue({ id });
  } catch (error) {
    await NativeUpload.acknowledge({ id }).catch(() => {});
    throw error;
  }
  uiIds.set(id, existingUiId || startUpload(job.kind, job.label));
  installNativeUploadObserver();
  const result = new Promise<string>((resolve, reject) => callbacks.set(id, { resolve, reject }));
  void reconcileNativeUploads().catch(() => {});
  return { recordId: await result };
}

export function reconcileNativeUploads(): Promise<Set<string>> {
  if (!supportsNativeBackgroundUpload()) return Promise.resolve(new Set());
  if (reconciliation) return reconciliation;
  reconciliation = readNativeUploads().finally(() => { reconciliation = undefined; });
  return reconciliation;
}

async function readNativeUploads(): Promise<Set<string>> {
  const claimed = new Set<string>();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return claimed;
    const { jobs } = await NativeUpload.list();
    for (const job of jobs) {
      if (job.userId !== userId) continue;
      claimed.add(job.persistentJobId);
      if (job.status === 'staging') continue;
      const uiId = uiIds.get(job.id) || startUpload(job.kind, job.label, undefined, undefined, job.progress);
      uiIds.set(job.id, uiId);
      if (job.status === 'queued' || job.status === 'uploading') {
        updateUpload(uiId, job.progress);
        continue;
      }
      const queue = await import('./persistentUploadQueue');
      await queue.deletePersistentJob(job.persistentJobId);
      const pending = callbacks.get(job.id);
      callbacks.delete(job.id);
      if (job.status === 'complete' && job.recordId) {
        finishUpload(uiId, undefined, doneUrlFor(job.kind, job.recordId));
        pending?.resolve(job.recordId);
        if (!job.notified && (job.kind !== 'video' || job.visibility === 'public')) {
          // Existing follower notifications remain best-effort and are delivered when the app returns.
          await NativeUpload.markNotified({ id: job.id });
          void notifyFollowersOfNewContent(userId, `new_${job.kind}`, job.recordId, job.caption || null);
        }
      } else {
        const error = job.error || 'Upload fail hua — dobara try karein';
        finishUpload(uiId, error);
        pending?.reject(new Error(error));
      }
      await NativeUpload.acknowledge({ id: job.id });
      uiIds.delete(job.id);
    }
  return claimed;
}

/** Only called while the app is visible; restarts durable work after an OS process restart. */
export async function resumeNativeUploads() {
  if (!supportsNativeBackgroundUpload()) return;
  await NativeUpload.resume();
}

export function installNativeUploadObserver() {
  if (!supportsNativeBackgroundUpload() || installed) return;
  installed = true;
  const resume = () => { if (document.visibilityState !== 'hidden') void reconcileNativeUploads().catch(() => {}); };
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  timer = setInterval(resume, 1000);
  void timer;
}
