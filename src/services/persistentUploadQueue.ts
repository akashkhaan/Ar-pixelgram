/**
 * Persistent Upload Queue using IndexedDB.
 * Ensures uploads survive website closing, browser tab closing, or page reloads.
 * When the website is refreshed, the upload resumes from the exact byte offset and finishes publishing.
 */
import { uploadMediaWithProgress } from './mediaUpload';
import { uploadVideoFile, uploadVideoThumbnail, createVideo } from './videos';
import { createReel, createPost, createStory, uploadImage, type ReelMusic } from './api';
import { startUpload, updateUpload, finishUpload, doneUrlFor, type UploadKind } from './uploadManager';
import { toast } from 'sonner';

export interface PersistentUploadJob {
  id: string;
  kind: UploadKind;
  label: string;
  fileBlob: Blob;
  fileName: string;
  fileType: string;
  storagePath?: string;
  coverBlob?: Blob | null;
  userId: string;
  caption?: string | null;
  videoTitle?: string;
  videoDescription?: string;
  videoVisibility?: 'public' | 'private';
  videoDuration?: number | null;
  musicPayload?: ReelMusic | null;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
}

const DB_NAME = 'pixelgram_persistent_uploads_db';
const DB_VERSION = 1;
const STORE_NAME = 'jobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function markUploadActiveInSession(id: string) {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('active_upload_' + id, 'true');
    } catch {}
  }
}

export function clearUploadActiveInSession(id: string) {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('active_upload_' + id);
    } catch {}
  }
}

export async function savePersistentJob(job: PersistentUploadJob): Promise<void> {
  try {
    markUploadActiveInSession(job.id);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(job);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Register Background Sync if available
    registerBackgroundSync();
  } catch (err) {
    console.warn('Failed to save persistent upload job:', err);
  }
}

export async function getPersistentJobs(): Promise<PersistentUploadJob[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    return await new Promise<PersistentUploadJob[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deletePersistentJob(id: string): Promise<void> {
  try {
    clearUploadActiveInSession(id);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to delete persistent upload job:', err);
  }
}

export async function updatePersistentJobProgress(id: string, progress: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const job = req.result as PersistentUploadJob | undefined;
      if (job) {
        job.progress = Math.max(job.progress || 0, Math.round(progress));
        job.status = 'uploading';
        store.put(job);
      }
    };
  } catch {
    // Ignore IDB write error
  }
}

export function registerBackgroundSync() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((reg) => {
        return (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('pixelgram-upload-sync');
      })
      .catch((err) => {
        console.warn('Background sync registration failed:', err);
      });
  }
}

// Active in-memory workers to prevent duplicate runs
const activeResumingIds = new Set<string>();

export function markJobActive(id: string) {
  activeResumingIds.add(id);
  markUploadActiveInSession(id);
}

export function unmarkJobActive(id: string) {
  activeResumingIds.delete(id);
}

/**
 * Resumes and executes a persistent upload job from its current progress.
 */
export async function executePersistentJob(job: PersistentUploadJob): Promise<void> {
  if (activeResumingIds.has(job.id)) return;
  activeResumingIds.add(job.id);
  markUploadActiveInSession(job.id);

  const file = new File([job.fileBlob], job.fileName, { type: job.fileType });
  const uploadId = startUpload(job.kind, job.label, undefined, undefined, job.progress || 0);

  try {
    if (job.kind === 'reel') {
      const videoUrl = await uploadMediaWithProgress('reels', file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      }, job.storagePath);

      let coverUrl: string | null = null;
      if (job.coverBlob) {
        try {
          const coverFile = new File([job.coverBlob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
          coverUrl = await uploadImage('posts', coverFile, job.userId);
        } catch {
          coverUrl = null;
        }
      }

      const reelId = await createReel(job.userId, videoUrl, job.caption || '', coverUrl || undefined, job.musicPayload);
      finishUpload(uploadId, undefined, doneUrlFor('reel', reelId));
      await deletePersistentJob(job.id);
      clearUploadActiveInSession(job.id);
      toast.success('Aapka Reel successfully upload ho gaya! 🎬🎉');
    } else if (job.kind === 'story') {
      const mediaUrl = await uploadMediaWithProgress('stories', file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      }, job.storagePath);
      await createStory(mediaUrl, job.caption || null, job.musicPayload);
      finishUpload(uploadId);
      await deletePersistentJob(job.id);
      clearUploadActiveInSession(job.id);
      toast.success('Aapki Story successfully add ho gayi! 🌟🎉');
    } else if (job.kind === 'post') {
      const mediaUrl = await uploadMediaWithProgress('posts', file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      }, job.storagePath);
      const postId = await createPost(mediaUrl, job.caption || null, job.musicPayload);
      finishUpload(uploadId, undefined, doneUrlFor('post', postId));
      await deletePersistentJob(job.id);
      clearUploadActiveInSession(job.id);
      toast.success('Aapka Post successfully share ho gaya! 📷🎉');
    } else if (job.kind === 'video') {
      const videoUrl = await uploadVideoFile(file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      }, job.storagePath);

      let thumbUrl: string | null = null;
      if (job.coverBlob) {
        try {
          thumbUrl = await uploadVideoThumbnail(job.coverBlob, job.userId);
        } catch {
          thumbUrl = null;
        }
      }

      const createdVideo = await createVideo({
        userId: job.userId,
        title: job.videoTitle || 'Untitled Video',
        description: job.videoDescription,
        videoUrl,
        thumbnailUrl: thumbUrl,
        durationSec: job.videoDuration,
        visibility: job.videoVisibility || 'public',
      });

      finishUpload(uploadId, undefined, doneUrlFor('video', createdVideo?.id));
      await deletePersistentJob(job.id);
      clearUploadActiveInSession(job.id);
      toast.success('Aapka Video successfully upload ho gaya! 🎥🎉');
    }
  } catch (err) {
    console.error('Persistent job execution failed:', err);
    await deletePersistentJob(job.id);
    clearUploadActiveInSession(job.id);
    const msg = err instanceof Error ? err.message : 'Upload fail hua — dobara try karein';
    finishUpload(uploadId, msg);
    toast.error(msg);
  } finally {
    activeResumingIds.delete(job.id);
  }
}

/**
 * Checks IndexedDB for any unfinished jobs.
 * Automatically clears stale/ghost uploads so they never appear on normal refresh.
 * Only resumes active in-flight jobs that were actually started by the user in this session.
 */
export async function resumeAllPendingUploads(): Promise<void> {
  try {
    const jobs = await getPersistentJobs();
    const now = Date.now();

    for (const j of jobs) {
      // 1. If older than 15 minutes or completed, purge it immediately
      if (j.status === 'completed' || now - (j.createdAt || 0) > 15 * 60 * 1000) {
        void deletePersistentJob(j.id);
        clearUploadActiveInSession(j.id);
        continue;
      }

      // 2. Check if this job was actively started in this browser session
      const isActiveSession = typeof window !== 'undefined' && sessionStorage.getItem('active_upload_' + j.id);

      // If it is NOT an active session upload, delete it (purges existing ghost uploads)
      if (!isActiveSession) {
        void deletePersistentJob(j.id);
        continue;
      }

      // 3. Resume ONLY active in-flight upload from where it left off
      if (!activeResumingIds.has(j.id)) {
        void executePersistentJob(j);
      }
    }
  } catch (err) {
    console.warn('Failed to resume pending uploads:', err);
  }
}
