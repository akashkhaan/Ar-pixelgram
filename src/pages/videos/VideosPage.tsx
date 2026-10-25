import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layouts/MobileLayout';
import { Input } from '@/components/ui/input';
import { Search, Mic, Loader2, Lock, Eye, Share2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';
import InstagramShareSheet from '@/components/common/InstagramShareSheet';
import {
  getVideosFeed,
  searchVideos,
  formatVideoViews,
  formatDuration,
  timeAgoHi,
  type AppVideo,
} from '@/services/videos';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

/** वीडियो — apne users ke upload kiye gaye video (gaana, comedy, film) search + play. */
const VideosPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);
  const [videos, setVideos] = useState<AppVideo[]>(() => {
    try {
      const cached = localStorage.getItem('cached_videos');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_videos');
      return !cached || JSON.parse(cached).length === 0;
    } catch {
      return true;
    }
  });
  const [listening, setListening] = useState(false);
  const [sharingVideo, setSharingVideo] = useState<AppVideo | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const load = useCallback(async (q: string) => {
    if (videos.length === 0) setLoading(true);
    try {
      const rows = q.trim() ? await searchVideos(q) : await getVideosFeed(40, 0);
      setVideos(rows);
      try {
        if (!q.trim()) localStorage.setItem('cached_videos', JSON.stringify(rows.slice(0, 30)));
      } catch {}
    } catch (e) {
      console.error('videos load failed', e);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [videos.length]);

  useEffect(() => {
    load(debounced);
  }, [debounced, load]);

  useEffect(() => {
    const handleUploadCompleted = (e: any) => {
      if (e.detail?.kind === 'video') {
        load('');
      }
    };
    window.addEventListener('pixelgram:upload_completed', handleUploadCompleted);
    return () => window.removeEventListener('pixelgram:upload_completed', handleUploadCompleted);
  }, [load]);

  // Voice search — Hindi + English dono samajhta hai
  const startVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error('Is browser me voice search support nahi hai');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = 'hi-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setQuery(text);
    };
    rec.onerror = () => {
      setListening(false);
      toast.error('Awaz samajh nahi aayi — dobara try karein');
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <MobileLayout autoHideNav>
      <div className="px-4 pt-1.5 pb-4 page-transition">
        {/* Search + voice + upload */}
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="गाना, film, comedy — कुछ भी खोजें…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 pl-11 pr-12 text-sm sm:text-base rounded-2xl bg-muted/40 border-border/50"
            />
            <button
              type="button"
              onClick={startVoice}
              aria-label="Voice search"
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                listening ? 'bg-destructive text-destructive-foreground animate-pulse' : 'hover:bg-muted'
              }`}
            >
              <Mic className={`w-5 h-5 ${listening ? 'text-white' : 'text-muted-foreground'}`} />
            </button>
          </div>

        </div>

        {loading ? (
          <div className="space-y-4 opacity-40">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="w-full aspect-video rounded-xl bg-muted/40" />
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted/40 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-3/4 h-3.5 rounded bg-muted/40" />
                    <div className="w-1/2 h-2.5 rounded bg-muted/30" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">
              {query.trim() ? `“${query}” के लिए कोई video नहीं मिला` : 'अभी कोई video upload नहीं हुआ'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => navigate(`/videos/${v.id}`)}
                className="w-full text-left rounded-2xl overflow-hidden active:scale-[0.99] transition-transform"
              >
                <div className="relative w-full bg-muted rounded-2xl overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt={v.title}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={v.video_url}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}
                  {formatDuration(v.duration_sec) && (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-semibold">
                      {formatDuration(v.duration_sec)}
                    </span>
                  )}
                  {v.visibility === 'private' && (
                    <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-semibold">
                      <Lock className="w-3 h-3" /> Private
                    </span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-3 px-1 py-2">
                  <div className="flex gap-3 flex-1 min-w-0">
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={v.profile?.avatar_url || undefined} />
                      <AvatarFallback>{(v.profile?.username || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground line-clamp-2">{v.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {v.profile?.username || 'user'}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="w-3 h-3" />
                        {formatVideoViews(v.views_count)} views · {timeAgoHi(v.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSharingVideo(v);
                    }}
                    className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 active:scale-90 transition-transform"
                    title="Share video"
                    aria-label="Share video"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Video Share Sheet */}
        {sharingVideo && (
          <InstagramShareSheet
            open={!!sharingVideo}
            onClose={() => setSharingVideo(null)}
            url={`${window.location.origin}/videos/${sharingVideo.id}`}
            title={`Video by @${sharingVideo.profile?.username || 'user'} on Pixelgram: ${sharingVideo.title}`}
            mediaType="video"
            thumbnailUrl={sharingVideo.thumbnail_url || undefined}
          />
        )}
      </div>
    </MobileLayout>
  );
};

export default VideosPage;
