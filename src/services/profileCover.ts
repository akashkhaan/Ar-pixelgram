import { supabase } from '@/db/supabase';

// Profile cover photo: har user ki ek fixed file 'avatars' bucket me.
// Database me naya column nahi chahiye — sab log isi path se cover dekhte hain.
const BUCKET = 'avatars';
const coverPath = (userId: string) => `${userId}/profile-cover`;

/** Public URL; `version` dene se naya upload turant dikhta hai (cache bypass). */
export function getProfileCoverUrl(userId: string, version?: number): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(coverPath(userId));
  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

export async function uploadProfileCover(file: File, userId: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(coverPath(userId), file, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
    cacheControl: '60',
  });
  if (error) throw error;
}
