/**
 * Persistent Upload Queue using IndexedDB.
 * Ensures uploads survive website closing, browser tab closing, or page reloads.
 * When the website is closed and re-opened, or when background sync triggers,
 * the upload resumes from the exact byte offset and finishes publishing.
 */

import { uploadMediaWithProgress } from './mediaUpload';
import { uploadVideoFile, uploadVideoThumbnail, createVideo } from './videos';
import { createReel, createPost, createStory, uploadImage, type ReelMusic } from './api';
import { startUpload, updateUpload, finishUpload, type UploadKind } from './uploadManager';
import { toast } from 'sonner';

export interface PersistentUploadJob {
  id: string;
  kind: UploadKind;
  label: string;
  fileBlob: Blob;
  fileName: string;
  fileType: string;
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

export async function savePersistentJob(job: PersistentUploadJob): Promise<void> {
  try {
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
        job.progress = progress;
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

/**
 * Resumes and executes a persistent upload job.
 */
export async function executePersistentJob(job: PersistentUploadJob): Promise<void> {
  if (activeResumingIds.has(job.id)) return;
  activeResumingIds.add(job.id);

  const file = new File([job.fileBlob], job.fileName, { type: job.fileType });
  const uploadId = startUpload(job.kind, job.label);

  try {
    if (job.kind === 'reel') {
      const videoUrl = await uploadMediaWithProgress('reels', file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      });

      let coverUrl: string | null = null;
      if (job.coverBlob) {
        try {
          const coverFile = new File([job.coverBlob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
          coverUrl = await uploadImage('posts', coverFile, job.userId);
        } catch {
          coverUrl = null;
        }
      }

      await createReel(job.userId, videoUrl, job.caption || '', coverUrl || undefined, job.musicPayload);
      finishUpload(uploadId);
      await deletePersistentJob(job.id);
      toast.success('Aapka Reel successfully upload ho gaya! 🎬🎉');
    } else if (job.kind === 'story') {
      const mediaUrl = await uploadMediaWithProgress('stories', file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      });
      await createStory(mediaUrl, job.caption || null, job.musicPayload);
      finishUpload(uploadId);
      await deletePersistentJob(job.id);
      toast.success('Aapki Story successfully add ho gayi! 🌟🎉');
    } else if (job.kind === 'post') {
      const mediaUrl = await uploadMediaWithProgress('posts', file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      });
      await createPost(mediaUrl, job.caption || null, job.musicPayload);
      finishUpload(uploadId);
      await deletePersistentJob(job.id);
      toast.success('Aapka Post successfully share ho gaya! 📷🎉');
    } else if (job.kind === 'video') {
      const videoUrl = await uploadVideoFile(file, job.userId, (p) => {
        updateUpload(uploadId, p);
        void updatePersistentJobProgress(job.id, p);
      });

      let thumbUrl: string | null = null;
      if (job.coverBlob) {
        try {
          thumbUrl = await uploadVideoThumbnail(job.coverBlob, job.userId);
        } catch {
          thumbUrl = null;
        }
      }

      await createVideo({
        userId: job.userId,
        title: job.videoTitle || 'Untitled Video',
        description: job.videoDescription,
        videoUrl,
        thumbnailUrl: thumbUrl,
        durationSec: job.videoDuration,
        visibility: job.videoVisibility || 'public',
      });

      finishUpload(uploadId);
      await deletePersistentJob(job.id);
      toast.success('Aapka Video successfully upload ho gaya! 🎥🎉');
    }
  } catch (err) {
    console.error('Persistent job execution failed:', err);
    finishUpload(uploadId, 'Upload retry me hai...');
  } finally {
    activeResumingIds.delete(job.id);
  }
}

/**
 * Checks IndexedDB for any unfinished jobs and resumes them.
 * Call this on app load, on network online, and on visibility change.
 */
export async function resumeAllPendingUploads(): Promise<void> {
  try {
    const jobs = await getPersistentJobs();
    const pending = jobs.filter((j) => j.status !== 'completed');
    if (pending.length > 0) {
      toast.info(`Adhoore upload resume ho rahe hain (${pending.length}) 🚀`);
      for (const job of pending) {
        void executePersistentJob(job);
      }
    }
  } catch (err) {
    console.warn('Failed to resume pending uploads:', err);
  }
}
