import * as tus from 'tus-js-client';
import { supabase } from '@/db/supabase';

type MediaBucket = 'stories' | 'reels';

/**
 * Storage-only upload helper. It changes no database rows and uses Supabase's
 * resumable storage endpoint so navigation away from the upload screen does
 * not cancel the request while the app tab remains alive.
 */
export async function uploadMediaWithProgress(
  bucket: MediaBucket,
  file: File,
  userId: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Login session expire ho gaya — dobara login karke try karein');
  }

  const extension = (file.name.split('.').pop() || (file.type.includes('image') ? 'jpg' : 'webm')).toLowerCase();
  const path = `${userId}/${bucket}_${Date.now()}.${extension}`;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
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
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '31536000',
      },
      onError: reject,
      onProgress: (uploaded, total) => {
        if (total > 0) onProgress?.(Math.min(99, Math.round((uploaded / total) * 100)));
      },
      onSuccess: () => {
        onProgress?.(100);
        resolve();
      },
    });

    void (async () => {
      try {
        const previous = await upload.findPreviousUploads();
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      } catch {
        // A missing fingerprint only means this upload starts from zero.
      }
      upload.start();
    })();
  });

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}