import { supabase } from '@/db/supabase';
import { createNotification } from '@/services/api';

/** Comment kis content ka hai — teeno ka table/notification alag hai */
export type CommentKind = 'post' | 'reel' | 'video';

const CONFIG: Record<
  CommentKind,
  {
    table: string;
    fk: string;
    likeType: 'comment_like' | 'reel_comment_like' | 'video_comment_like';
    mentionType: 'mention' | 'reel_mention' | 'video_mention';
    label: string;
  }
> = {
  post: { table: 'comment_likes', fk: 'comment_id', likeType: 'comment_like', mentionType: 'mention', label: 'post' },
  reel: { table: 'reel_comment_likes', fk: 'reel_comment_id', likeType: 'reel_comment_like', mentionType: 'reel_mention', label: 'reel' },
  video: { table: 'video_comment_likes', fk: 'video_comment_id', likeType: 'video_comment_like', mentionType: 'video_mention', label: 'video' },
};

export interface CommentLikeState {
  count: number;
  mine: boolean;
}

/**
 * Diye gaye comments ke like count + "maine like kiya hai kya" ek saath.
 * Table na bane ho to khaali map — UI phir bhi chalta rahe.
 */
export async function getCommentLikeStates(
  kind: CommentKind,
  commentIds: string[],
  userId?: string | null,
): Promise<Record<string, CommentLikeState>> {
  const out: Record<string, CommentLikeState> = {};
  const ids = Array.from(new Set(commentIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const cfg = CONFIG[kind];

  try {
    const { data, error } = await supabase
      .from(cfg.table)
      .select(`${cfg.fk}, user_id`)
      .in(cfg.fk, ids);
    if (error || !data) return out;

    for (const row of data as Record<string, string>[]) {
      const cid = row[cfg.fk];
      if (!out[cid]) out[cid] = { count: 0, mine: false };
      out[cid].count += 1;
      if (userId && row.user_id === userId) out[cid].mine = true;
    }
  } catch {
    /* migration pending — chup raho */
  }
  return out;
}

export interface CommentLikeContext {
  /** Comment kisne likha (uske paas notification jayegi) */
  commentOwnerId: string;
  /** Reel / post / video ka id (notification me link ke liye) */
  contentId: string;
  /** Comment ka text — notification me preview ke liye */
  commentPreview?: string | null;
}

/**
 * Comment like toggle — like/unlike + owner ko notification + phone push.
 * Notification: "<tumne> ne tumhare comment ko like kiya" + konsa reel/post/video.
 */
export async function toggleCommentLike(
  kind: CommentKind,
  commentId: string,
  commentOwnerId: string,
  context: { contentId: string; actorId: string; commentPreview?: string | null },
): Promise<{ liked: boolean }> {
  const cfg = CONFIG[kind];
  const { actorId, contentId } = context;

  const friendly = (err: { code?: string; message?: string } | null) => {
    if (!err) return err;
    if (err.code === '42P01' || err.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(err.message || '')) {
      return new Error('Comment like ka database setup nahi mila (SQL Supabase me run karein)');
    }
    return new Error(err.message || 'Like nahi hua');
  };

  const { data: existing, error: findError } = await supabase
    .from(cfg.table)
    .select('id')
    .eq(cfg.fk, commentId)
    .eq('user_id', actorId)
    .maybeSingle();
  if (findError) throw friendly(findError);

  if (existing?.id) {
    const { error } = await supabase.from(cfg.table).delete().eq('id', existing.id);
    if (error) throw friendly(error);
    return { liked: false };
  }

  const { error } = await supabase
    .from(cfg.table)
    .insert({ [cfg.fk]: commentId, user_id: actorId });
  if (error) throw friendly(error);

  // Owner ko app notification + phone push (apne comment par nahi)
  if (commentOwnerId !== actorId) createNotification(
    commentOwnerId,
    cfg.likeType,
    actorId,
    contentId,
    commentId,
    (context.commentPreview || '').trim().slice(0, 120) || null,
  ).catch(() => {});

  return { liked: true };
}

export const commentKindLabel: Record<CommentKind, string> = {
  post: 'post',
  reel: 'reel',
  video: 'video',
};
