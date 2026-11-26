import { supabase } from '@/db/supabase';
import { createNotification } from '@/services/api';
import type { CommentKind } from '@/services/commentLikes';

/** "@username" tokens nikaalo (Instagram jaisa: letters, digits, dot, underscore) */
export function extractMentions(text: string): string[] {
  if (!text) return [];
  const found = text.match(/(^|[\s(])@([A-Za-z0-9._]{2,30})/g) || [];
  return Array.from(
    new Set(
      found
        .map(m => m.replace(/^[\s(]/, '').slice(1).replace(/[.]+$/, '').toLowerCase())
        .filter(Boolean),
    ),
  );
}

interface NotifyMentionsArgs {
  text: string;
  actorId: string;
  kind: CommentKind;
  contentId: string;
  commentId?: string | null;
  /** Comment jiske andar mention hua uska owner — usko comment notification
   *  pehle hi jaa chuki hai, isliye mention ki dobara zaroorat nahi */
  skipUserIds?: string[];
}

/**
 * Comment me @username mention hone par us user ko notification + phone push.
 * Notification text: "<actor> ne tumhe <reel/post/video> ke comment me mention kiya"
 * aur message me comment ka hissa — tap karke seedha wahi content khulta hai.
 */
export async function notifyMentions({
  text,
  actorId,
  kind,
  contentId,
  commentId,
  skipUserIds = [],
}: NotifyMentionsArgs): Promise<void> {
  const usernames = extractMentions(text);
  if (usernames.length === 0) return;

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('user_id, username')
      .in('username', usernames);
    if (error || !profiles) return;

    const skip = new Set([actorId, ...skipUserIds]);
    const type = kind === 'reel' ? 'reel_mention' : kind === 'video' ? 'video_mention' : 'mention';

    await Promise.all(
      profiles
        .filter((p: { user_id: string }) => p?.user_id && !skip.has(p.user_id))
        .map((p: { user_id: string }) =>
          createNotification(
            p.user_id,
            type,
            actorId,
            contentId,
            commentId || undefined,
            text.trim().slice(0, 120),
          ).catch(() => {}),
        ),
    );
  } catch {
    /* mention lookup fail ho to comment fail na ho */
  }
}
