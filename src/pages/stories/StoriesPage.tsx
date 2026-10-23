import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { withTimeout } from '@/lib/withTimeout';
import {
  getFeedStories, getAllPosts, createStory, deleteStory,
  toggleStoryLike, isStoryLiked, getStoryLikers, getStoryViewers, recordStoryView, sendMessage, createNotification,
  type StoryViewer
} from '@/services/api';
import type { Story, Profile, Post } from '@/types/types';
import PixelgramStoryViewer from '@/components/stories/PixelgramStoryViewer';

import PostCard from '@/components/common/PostCard';
import PullToRefresh from '@/components/common/PullToRefresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, ChevronLeft, ChevronRight, Trash2, ImagePlus, Film, Loader2, Share2, Heart, Eye, Send, Clock, Music2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import MusicPickerSheet from '@/components/reels/MusicPickerSheet';
import MusicTrimmer from '@/components/reels/MusicTrimmer';
import type { MusicTrack } from '@/services/music';
import { composeMediaWithMusic } from '@/services/mediaComposer';
import { uploadMediaWithProgress } from '@/services/mediaUpload';
import { finishUpload, startUpload, updateUpload } from '@/services/uploadManager';
import { savePersistentJob, deletePersistentJob, updatePersistentJobProgress, markJobActive, unmarkJobActive } from '@/services/persistentUploadQueue';

function groupStoriesByUser(stories: Story[]): Record<string, { profile: Profile; stories: Story[] }> {
  const groups: Record<string, { profile: Profile; stories: Story[] }> = {};
  for (const story of stories) {
    if (!story.profile) continue;
    const uid = story.user_id;
    if (!groups[uid]) groups[uid] = { profile: story.profile, stories: [] };
    groups[uid].stories.push(story);
  }
  return groups;
}

const StoriesPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [trimTrack, setTrimTrack] = useState<MusicTrack | null>(null);
  const [storyTrack, setStoryTrack] = useState<MusicTrack | null>(null);
  const [musicStartMs, setMusicStartMs] = useState(0);
  const [muteOriginal, setMuteOriginal] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [likers, setLikers] = useState<Profile[]>([]);
  const [loadingLikers, setLoadingLikers] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const videoViewerRef = useRef<HTMLVideoElement>(null);
  const storyAudioRef = useRef<HTMLAudioElement>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const POSTS_PAGE_SIZE = 10;

  useEffect(() => {
    if (!user) return;
    withTimeout(getFeedStories(user.id), 20000)
      .then(s => { setStories(s); })
      .catch((e) => { console.error('stories load failed', e); })
      .finally(() => { setLoading(false); });
  }, [user]);

  // Load posts feed (shown below the stories row)
  useEffect(() => {
    if (!user) return;
    setPostsLoading(true);
    withTimeout(getAllPosts(0, POSTS_PAGE_SIZE, user.id), 20000)
      .then(p => { setPosts(p); setPostsPage(0); setHasMorePosts(p.length === POSTS_PAGE_SIZE); })
      .catch(e => { console.error('posts load failed', e); })
      .finally(() => setPostsLoading(false));
  }, [user]);

  const loadMorePosts = async () => {
    if (!user || loadingMore || !hasMorePosts) return;
    setLoadingMore(true);
    try {
      const next = postsPage + 1;
      const more = await withTimeout(getAllPosts(next, POSTS_PAGE_SIZE, user.id), 20000);
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...more.filter(p => !seen.has(p.id))];
      });
      setPostsPage(next);
      setHasMorePosts(more.length === POSTS_PAGE_SIZE);
    } catch (e) {
      console.error('load more posts failed', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDeletePost = (postId: string) => setPosts(prev => prev.filter(p => p.id !== postId));

  // Instagram jaisa pull-to-refresh — stories + posts dono dobara load
  const handleRefresh = async () => {
    if (!user) return;
    try {
      const [s, p] = await Promise.all([
        withTimeout(getFeedStories(user.id), 20000),
        withTimeout(getAllPosts(0, POSTS_PAGE_SIZE, user.id), 20000),
      ]);
      setStories(s);
      setPosts(p);
      setPostsPage(0);
      setHasMorePosts(p.length === POSTS_PAGE_SIZE);
    } catch (e) {
      console.error('refresh failed', e);
    }
  };

  // Record view when story is opened + load liked state
  useEffect(() => {
    if (!viewerUserId || !user || !currentStory) return;
    recordStoryView(currentStory.id, user.id).catch(() => {});
    isStoryLiked(currentStory.id, user.id).then(v => setLikedMap(m => ({ ...m, [currentStory.id]: v })));
  }, [viewerUserId, storyIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Story viewer khule to page scroll lock — pura screen sirf story dikhe
  useEffect(() => {
    if (!viewerUserId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [viewerUserId]);

  const openViewersSheet = async (storyId: string) => {
    setShowViewers(true);
    setLoadingViewers(true);
    const list = await getStoryViewers(storyId).catch(() => [] as StoryViewer[]);
    setViewers(list);
    setLoadingViewers(false);
  };

  const groups = groupStoriesByUser(stories);
  const groupKeys = Object.keys(groups);

  const openViewer = (uid: string) => { setViewerUserId(uid); setStoryIndex(0); setShowReply(false); };

  // Open a specific user's stories when arriving from a notification (/stories?u=<userId>)
  const openedFromQuery = useRef(false);
  useEffect(() => {
    if (openedFromQuery.current || loading) return;
    const uid = new URLSearchParams(window.location.search).get('u');
    if (uid && groups[uid]) {
      openedFromQuery.current = true;
      openViewer(uid);
    }
  }, [loading, stories]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeViewer = () => {
    storyAudioRef.current?.pause(); setViewerUserId(null); setShowReply(false); setShowViewers(false); };

  const viewerGroup = viewerUserId ? groups[viewerUserId] : null;
  const currentStory = viewerGroup?.stories[storyIndex];

  useEffect(() => {
    const a = storyAudioRef.current;
    if (!a) return;
    if (viewerUserId && currentStory?.music_preview_url) {
      const startSec = (currentStory.music_start_ms || 0) / 1000;
      try { a.currentTime = startSec; } catch {}
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [viewerUserId, currentStory, storyIndex]);

  // Pause story audio when screen turns off or page loses focus
  useEffect(() => {
    const pauseStoryAudio = () => {
      storyAudioRef.current?.pause();
    };
    const handleVisibility = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        pauseStoryAudio();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', pauseStoryAudio);
    window.addEventListener('blur', pauseStoryAudio);
    return () => {
      pauseStoryAudio();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', pauseStoryAudio);
      window.removeEventListener('blur', pauseStoryAudio);
    };
  }, []);

  const nextStory = () => {
    if (!viewerGroup) return;
    setShowReply(false);
    if (storyIndex < viewerGroup.stories.length - 1) {
      setStoryIndex(i => i + 1);
    } else {
      const ci = groupKeys.indexOf(viewerUserId!);
      if (ci < groupKeys.length - 1) { setViewerUserId(groupKeys[ci + 1]); setStoryIndex(0); }
      else closeViewer();
    }
  };

  const prevStory = () => {
    if (storyIndex > 0) { setStoryIndex(i => i - 1); setShowReply(false); }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !currentStory) return;
    const prev = likedMap[currentStory.id] ?? false;
    setLikedMap(m => ({ ...m, [currentStory.id]: !prev }));
    await toggleStoryLike(currentStory.id, user.id, prev);
    setStories(s => s.map(st => st.id === currentStory.id ? { ...st, likes_count: (st.likes_count || 0) + (prev ? -1 : 1) } : st));
    // Notify story owner on new like
    if (!prev && currentStory.user_id !== user.id) {
      createNotification(currentStory.user_id, 'story_like', user.id, currentStory.id).catch(() => {});
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !user || !currentStory) return;
    setSendingReply(true);
    await sendMessage(currentStory.user_id, `↩️ Story reply: ${replyText.trim()}`);
    if (currentStory.user_id !== user.id) {
      createNotification(currentStory.user_id, 'story_reply', user.id, currentStory.id, undefined, replyText.trim().slice(0, 120)).catch(() => {});
    }
    toast.success('Reply भेजा गया!');
    setReplyText('');
    setShowReply(false);
    setSendingReply(false);
  };

  // 24h timer
  const getTimeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return '0h';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'image' && file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    if (type === 'video' && file.size > 100 * 1024 * 1024) { toast.error('Video must be under 100MB'); return; }
    setMediaFile(file);
    setMediaType(type);
    setMediaPreview(URL.createObjectURL(file));
    setStoryTrack(null);
    setTrimTrack(null);
    setMusicStartMs(0);
  };

  const handleUploadStory = async () => {
    if (!mediaFile || !user) return;
    const uploadId = startUpload('story', 'Story upload');
    setUploading(true);
    const musicPayload = storyTrack
      ? {
          track_id: storyTrack.id,
          title: storyTrack.title,
          artist: storyTrack.artist,
          artwork_url: storyTrack.artwork,
          preview_url: storyTrack.previewUrl,
          start_ms: musicStartMs,
          duration_ms: storyTrack.durationMs,
          mute_original: muteOriginal,
        }
      : null;
    // Refresh-proof: job IndexedDB me save hota hai; refresh ke baad app load par resume hota hai.
    const persistentJobId = `upload_story_${Date.now()}`;
    markJobActive(persistentJobId);
    void savePersistentJob({
      id: persistentJobId,
      kind: 'story',
      label: 'Story Upload',
      fileBlob: mediaFile,
      fileName: mediaFile.name,
      fileType: mediaFile.type,
      userId: user.id,
      caption: caption.trim() || null,
      musicPayload,
      progress: 0,
      status: 'uploading',
      createdAt: Date.now(),
    });
    try {
      let fileToUpload = mediaFile;
      const url = await uploadMediaWithProgress('stories', fileToUpload, user.id, (progress) => {
        updateUpload(uploadId, progress);
        void updatePersistentJobProgress(persistentJobId, progress);
      });
      await createStory(url, caption.trim() || null, musicPayload);
      await deletePersistentJob(persistentJobId);
      toast.success(t('newStory') + ' posted! ✨');
      const updated = await getFeedStories(user.id);
      setStories(updated);
      setShowUpload(false);
      setMediaFile(null);
      setMediaPreview(null);
      setCaption('');
      setStoryTrack(null);
      setMusicStartMs(0);
      setMuteOriginal(true);
      finishUpload(uploadId);
    } catch {
      toast.error('Failed to post story');
      finishUpload(uploadId, 'Story upload fail hua');
    } finally {
      unmarkJobActive(persistentJobId);
      setUploading(false);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    await deleteStory(storyId);
    toast.success('Story deleted');
    setStories(prev => prev.filter(s => s.id !== storyId));
    closeViewer();
  };

  const currentIsVideo = currentStory && (
    (currentStory as Story & { media_type?: string }).media_type === 'video' ||
    currentStory.image_url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i)
  );

  return (
    <MobileLayout autoHideNav>
      <PullToRefresh onRefresh={handleRefresh} disabled={!!viewerUserId}>
      <div className="page-transition">
        {/* Stories row */}
        <div className="flex items-start gap-3 px-4 py-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>


          {/* Add story button */}
          <button onClick={() => setShowUpload(true)} className="flex flex-col items-center gap-1.5 shrink-0 group">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-primary/50 flex items-center justify-center bg-primary/5 group-hover:bg-primary/10 transition-all group-hover:border-primary">
              <Plus className="w-6 h-6 text-primary transition-transform group-hover:scale-110" />
            </div>
            <span className="text-[11px] text-muted-foreground w-16 text-center truncate">{t('newStory')}</span>
          </button>

          {loading ? (
            <div className="flex items-center justify-center w-full py-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : groupKeys.map(uid => {
            const group = groups[uid];
            const p = group.profile;
            return (
              <button key={uid} onClick={() => openViewer(uid)} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="story-ring animate-pulse-glow">
                  <div className="story-ring-inner">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.username} className="w-14 h-14 rounded-full object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-bold">{p.username[0]?.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-foreground w-16 text-center truncate">{p.username}</span>
              </button>
            );
          })}
        </div>

        {/* Posts feed — below the stories row */}
        <div className="border-t border-border pt-2 pb-24">
          {postsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <span className="text-5xl mb-4">🖼️</span>
              <h3 className="font-semibold text-foreground mb-1">अभी कोई पोस्ट नहीं</h3>
              <p className="text-sm text-muted-foreground">पहली पोस्ट अपलोड करें!</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {posts.map(post => (
                <PostCard key={post.id} post={post} onDelete={handleDeletePost} />
              ))}
              {hasMorePosts && (
                <div className="flex justify-center py-4">
                  <Button variant="outline" onClick={loadMorePosts} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'और पोस्ट देखें'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pixelgram Story Viewer (Exact UI design, real data, capsule strip carousel & sliding tabs) */}
      {viewerUserId && (
        <PixelgramStoryViewer
          groups={groups}
          groupKeys={groupKeys}
          activeUserId={viewerUserId}
          initialIndex={storyIndex}
          currentUser={user}
          onClose={closeViewer}
          onDeleteStory={handleDeleteStory}
          onOpenProfile={(uid) => navigate(`/profile/${uid}`)}
          onStoryLiked={(storyId, _liked, newCount) => {
            setStories(s => s.map(st => st.id === storyId ? { ...st, likes_count: newCount } : st));
          }}
        />
      )}

      {/* Upload story modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-lg bg-card rounded-t-[32px] border-t border-border/40 overflow-y-auto shadow-2xl"
            style={{
              maxHeight: '90vh',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
            }}
          >
            <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--p1)), hsl(var(--p2)))' }}
                >
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{t('newStory')}</h3>
                  <p className="text-xs text-muted-foreground">Photo, video aur music add karein</p>
                </div>
              </div>
              <button onClick={() => { setShowUpload(false); setMediaFile(null); setMediaPreview(null); setStoryTrack(null); }} className="p-1.5 rounded-full hover:bg-muted/60">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Media type toggle */}
            {!mediaPreview && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors gap-2">
                  <ImagePlus className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium text-primary">{t('uploadImage')}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleMediaSelect(e, 'image')} />
                </label>
                <label className="flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors gap-2"
                  style={{ borderColor: 'hsl(var(--p2) / 0.4)', backgroundColor: 'hsl(var(--p2) / 0.05)' }}>
                  <Film className="w-8 h-8" style={{ color: 'hsl(var(--p2))' }} />
                  <span className="text-sm font-medium" style={{ color: 'hsl(var(--p2))' }}>{t('uploadVideo')}</span>
                  <input type="file" accept="video/*" className="hidden" onChange={e => handleMediaSelect(e, 'video')} />
                </label>
              </div>
            )}

            {/* Preview */}
            {mediaPreview && (
              <div className="relative aspect-[9/16] max-h-52 rounded-2xl overflow-hidden bg-black mx-auto">
                {mediaType === 'video' ? (
                  <video src={mediaPreview} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                ) : (
                  <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                )}
                <button onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white text-xs font-medium"
                  style={{ background: mediaType === 'video' ? 'hsl(var(--p2) / 0.85)' : 'hsl(var(--p1) / 0.85)' }}>
                  {mediaType === 'video' ? '🎬 Video' : '📷 Photo'}
                </div>
              </div>
            )}

            {mediaPreview && (
              <div className="rounded-2xl border border-border/70 bg-muted/35 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    {storyTrack?.artwork ? (
                      <img src={storyTrack.artwork} alt="" className="h-10 w-10 rounded-xl object-cover" />
                    ) : (
                      <Music2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Story music</p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {storyTrack ? `${storyTrack.title} · ${storyTrack.artist}` : 'Gana add karein'}
                    </p>
                    {storyTrack && (
                      <p className="text-[11px] text-muted-foreground">
                        {Math.floor(musicStartMs / 1000)}s se start · original audio {muteOriginal ? 'off' : 'on'}
                      </p>
                    )}
                  </div>
                  {storyTrack ? (
                    <button
                      onClick={() => setTrimTrack(storyTrack)}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Cut
                    </button>
                  ) : (
                    <button
                      onClick={() => setMusicPickerOpen(true)}
                      className="rounded-full bg-gradient-to-r from-[hsl(var(--p1))] to-[hsl(var(--p2))] px-4 py-2 text-xs font-bold text-white"
                    >
                      Add music
                    </button>
                  )}
                </div>
                {storyTrack && (
                  <button
                    onClick={() => setMusicPickerOpen(true)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/60 py-2 text-xs font-semibold text-foreground"
                  >
                    <Music2 className="h-3.5 w-3.5 text-primary" /> Change song
                  </button>
                )}
              </div>
            )}

            <input
              type="text"
              placeholder={t('caption') + ' (optional)'}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              maxLength={100}
              className="w-full h-10 px-3 rounded-xl border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {/* Publish button — always visible */}
            <Button
              className="w-full h-12 font-bold rounded-xl text-white border-0"
              style={{ background: 'linear-gradient(135deg, hsl(var(--p1)), hsl(var(--p2)))' }}
              onClick={handleUploadStory}
              disabled={uploading || !mediaFile}
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Posting…</> : `✨ ${t('publish')}`}
            </Button>
            </div>
          </div>
        </div>
      )}

      <MusicPickerSheet
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(selected) => {
          setMusicPickerOpen(false);
          setTrimTrack(selected);
        }}
      />

      {trimTrack && mediaPreview && (
        <MusicTrimmer
          track={trimTrack}
          videoUrl={mediaPreview}
          mediaType={mediaType}
          initialStartMs={trimTrack.id === storyTrack?.id ? musicStartMs : 0}
          initialMuteOriginal={muteOriginal}
          onBack={() => setTrimTrack(null)}
          onDone={({ startMs, muteOriginal: nextMuteOriginal }) => {
            setStoryTrack(trimTrack);
            setMusicStartMs(startMs);
            setMuteOriginal(nextMuteOriginal);
            setTrimTrack(null);
            toast.success('Story music set ho gaya 🎵');
          }}
        />
      )}
      </PullToRefresh>
    </MobileLayout>
  );
};
export default StoriesPage;
