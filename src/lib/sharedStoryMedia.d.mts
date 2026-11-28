import type { SharedStoryRef } from './storyShare';

export interface SharedStorySource {
  user_id?: string | null;
  video_url?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  profile?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
}

export function isSharedVideoUrl(url?: string | null): boolean;
export function getSharedStoryVideoUrl(ref?: SharedStoryRef | null): string | null;
export function mergeSharedStoryMedia(ref: SharedStoryRef, source?: SharedStorySource | null): SharedStoryRef;
