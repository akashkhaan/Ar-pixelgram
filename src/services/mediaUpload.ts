import * as tus from 'tus-js-client';
import { supabase } from '@/db/supabase';

type MediaBucket = 'stories' | 'reels' | 'posts';

/**
 * Storage-only upload helper. It changes no database rows and uses Supabase's
 * resumable storage endpoint so navigation away from the upload screen does
 * not cancel the request while the app tab remains alive.
 * Uses a consistent customPath and persistent uploadUrl so page refresh can resume from exact byte offset (e.g. 50%).
 */
export async function uploadMediaWithProgress(
  bucket: MediaBucket,
  file: File,
  userId: string,
  onProgress?: (percent: number) => void,
  customPath?: string,
): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Login session expire ho gaya — dobara login karke try karein');
  }

  const extension = (file.name.split('.').pop() || (file.type.includes('image') ? 'jpg' : 'webm')).toLowerCase();
  const path = customPath || `${userId}/${bucket}_${Date.now()}.${extension}`;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const savedUrlKey = 'tus_url_' + path;
  const savedProgKey = 'upload_progress_' + path;
  const savedUrl = typeof window !== 'undefined' ? localStorage.getItem(savedUrlKey) : null;
  const savedProgress = typeof window !== 'undefined' ? Number(localStorage.getItem(savedProgKey) || 0) : 0;

  if (savedProgress > 0) {
    onProgress?.(savedProgress);
  }

  await new Promise<void>((resolve, reject) => {
    const uploadOptions: tus.UploadOptions = {
      endpoint: `${base}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${data.session!.access_token}`,
        apikey: anon,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      removeFingerprintOnSuccess: true,
      fingerprint: () => Promise.resolve('tus_' + path),
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '31536000',
      },
      onChunkComplete: () => {
        if (upload.url && typeof window !== 'undefined') {
          localStorage.setItem(savedUrlKey, upload.url);
        }
      },
      onError: (err) => {
        if (typeof window !== 'undefined' && String(err).includes('404')) {
          localStorage.removeItem(savedUrlKey);
        }
        reject(err);
      },
      onProgress: (uploaded, total) => {
        if (total > 0) {
          const currentPct = Math.min(99, Math.round((uploaded / total) * 100));
          const effectivePct = Math.max(savedProgress, currentPct);
          if (typeof window !== 'undefined') {
            localStorage.setItem(savedProgKey, String(effectivePct));
          }
          onProgress?.(effectivePct);
        }
      },
      onSuccess: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(savedUrlKey);
          localStorage.removeItem(savedProgKey);
        }
        onProgress?.(100);
        resolve();
      },
    };

    if (savedUrl) {
      uploadOptions.uploadUrl = savedUrl;
    }

    const upload = new tus.Upload(file, uploadOptions);

    void (async () => {
      try {
        if (!upload.url) {
          const previous = await upload.findPreviousUploads();
          if (previous.length > 0) {
            upload.resumeFromPreviousUpload(previous[0]);
            if (upload.url && typeof window !== 'undefined') {
              localStorage.setItem(savedUrlKey, upload.url);
            }
          }
        }
      } catch {
        // Missing fingerprint starts fresh
      }
      upload.start();
    })();
  });

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
