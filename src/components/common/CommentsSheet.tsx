import { CommentText } from "./CommentText";
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Heart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getComments, addComment, createNotification } from '@/services/api';
import type { Comment } from '@/types/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getCommentLikeStates, toggleCommentLike, type CommentLikeState } from '@/services/commentLikes';
import { notifyMentions } from '@/lib/mentions';
import { cn } from '@/lib/utils';

interface CommentsSheetProps {
  postId: string;
  postOwnerId: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  highlightCommentId?: string | null;
}

/**
 * Keyboard-aware comments sheet.
 * Phone par keyboard khulte hi input screen ke neeche chala jata tha. Ab
 * visualViewport se keyboard ki height nikaal kar sheet ko upar utha dete hain,
 * isliye "Add a comment…" hamesha keyboard ke thik uper dikhta hai.
 */
const CommentsSheet: React.FC<CommentsSheetProps> = ({ postId, postOwnerId, open, onClose, onCountChange, highlightCommentId }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [likes, setLikes] = useState<Record<string, CommentLikeState>>({});
  const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      getComments(postId).then(list => { setComments(list); onCountChange?.(list.length); });
      // Sheet khulte hi comment box par focus — user turant type kar sake.
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [postId, open]);

  useEffect(() => {
    const target = highlightCommentId ? document.getElementById(`comment-${highlightCommentId}`) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments, highlightCommentId]);

  // Comment like count + "maine like kiya"
  useEffect(() => {
    if (!open) return;
    let live = true;
    getCommentLikeStates('post', comments.map(c => c.id), user?.id)
      .then(map => { if (live) setLikes(map); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, comments, user?.id]);

  const handleLikeComment = async (comment: Comment) => {
    if (!user || comment.user_id === user.id) return;
    setLikeBusy(prev => ({ ...prev, [comment.id]: true }));
    try {
      const { liked } = await toggleCommentLike('post', comment.id, comment.user_id, {
        contentId: postId,
        actorId: user.id,
        commentPreview: comment.content,
      });
      setLikes(prev => {
        const cur = prev[comment.id] || { count: 0, mine: false };
        return { ...prev, [comment.id]: { count: Math.max(0, cur.count + (liked ? 1 : -1)), mine: liked } };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Like nahi hua');
    } finally {
      setLikeBusy(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  // Keyboard height track karo (iOS + Android dono par visualViewport milta hai).
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKeyboardInset(0);
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setLoading(true);
    try {
      const text = content.trim();
      await addComment(postId, text);
      setContent('');
      toast.success('Comment added');
      if (postOwnerId !== user.id) {
        createNotification(postOwnerId, 'comment', user.id, postId).catch(() => {});
      }
      void notifyMentions({
        text,
        actorId: user.id,
        kind: 'post',
        contentId: postId,
        skipUserIds: [postOwnerId],
      });
      const updated = await getComments(postId);
      setComments(updated);
      onCountChange?.(updated.length);
      // Keyboard khula rakho taki user lagataar comment kar sake.
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Comment save nahi hua');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative z-[101] w-full max-w-lg bg-card rounded-t-2xl flex flex-col"
        style={{
          // Keyboard ke barabar upar shift + utni hi height kam.
          bottom: keyboardInset,
          maxHeight: `calc(75vh - ${keyboardInset}px)`,
          height: keyboardInset > 0 ? `calc(75vh - ${keyboardInset}px)` : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="font-semibold text-foreground">
            {comments.length > 0 ? `${comments.length.toLocaleString()} ${comments.length === 1 ? 'comment' : 'comments'}` : 'Comments'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {comments.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No comments yet. Be the first!</p>
          ) : (
            comments.map(comment => (
              <div key={comment.id} id={`comment-${comment.id}`} className={`flex gap-3 rounded-xl transition-colors ${highlightCommentId === comment.id ? 'bg-primary/15 ring-1 ring-primary/40 p-2 -mx-2' : ''}`}>
                {comment.profile?.avatar_url ? (
                  <img src={comment.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-primary font-bold text-xs">{comment.profile?.username?.[0]?.toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-sm font-semibold text-foreground">{comment.profile?.username}</span>
                    {comment.profile?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
                    <span className="text-xs text-muted-foreground ml-1">{new Date(comment.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-foreground text-pretty break-words"><CommentText text={comment.content} /></p>
                  <button
                    type="button"
                    disabled={!!likeBusy[comment.id] || user?.id === comment.user_id}
                    onClick={() => void handleLikeComment(comment)}
                    className={cn(
                      'mt-1 flex items-center gap-1 text-xs transition-colors disabled:opacity-60',
                      likes[comment.id]?.mine ? 'text-red-500 font-semibold' : 'text-muted-foreground hover:text-red-500',
                    )}
                    aria-label={likes[comment.id]?.mine ? 'Comment like hatayein' : 'Comment like karein'}
                  >
                    <Heart className={cn('w-3.5 h-3.5', likes[comment.id]?.mine && 'fill-current')} />
                    {!!likes[comment.id]?.count && <span>{likes[comment.id]?.count}</span>}
                  </button>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Comment input — hamesha keyboard ke uper */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card shrink-0"
          style={{ paddingBottom: keyboardInset > 0 ? 12 : 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <Input
            ref={inputRef}
            placeholder="Add a comment…"
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 250)}
            className="flex-1 h-10"
            maxLength={200}
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!content.trim() || loading}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CommentsSheet;
