import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Film, Heart, Loader2, TrendingUp, Users, Video as VideoIcon } from 'lucide-react';
import MobileLayout from '@/components/layouts/MobileLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import useGoBack from '@/hooks/use-go-back';
import { withTimeout } from '@/lib/withTimeout';
import { getFollowersCount, getFollowingCount, getUserPosts, getUserReels } from '@/services/api';
import { getUserVideos } from '@/services/videos';
import { formatCompact, summarizeProfessionalStats, type ProfessionalStats } from '@/lib/profile/professionalStats';

/** Apne reels, videos aur posts ke asli numbers — sirf owner ko dikhte hain. */
const ProfessionalDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const goBack = useGoBack('/profile');
  const [stats, setStats] = useState<ProfessionalStats | null>(null);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFailed(false);
    try {
      const [posts, reels, videos, fc, fg] = await withTimeout(
        Promise.all([
          getUserPosts(user.id, user.id),
          getUserReels(user.id),
          getUserVideos(user.id, user.id),
          getFollowersCount(user.id),
          getFollowingCount(user.id),
        ]),
        20000,
      );
      setStats(summarizeProfessionalStats({ posts, reels, videos }));
      setFollowers(fc);
      setFollowing(fg);
    } catch (e) {
      console.error('professional dashboard load failed', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const cards = stats
    ? [
        { icon: Film, label: 'Reel views', value: stats.reelViews },
        { icon: VideoIcon, label: 'Video views', value: stats.videoViews },
        { icon: Heart, label: 'Total likes', value: stats.totalLikes },
        { icon: Users, label: 'Followers', value: followers },
        { icon: Users, label: 'Following', value: following },
        { icon: Eye, label: 'Total content', value: stats.contentCount },
      ]
    : [];

  return (
    <MobileLayout hideHeader hideNav>
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-3 h-12 flex items-center gap-2 border-b border-border/40">
        <button
          type="button"
          onClick={goBack}
          className="w-9 h-9 -ml-1 rounded-full hover:bg-muted active:scale-95 flex items-center justify-center text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base text-foreground">Professional dashboard</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
        </div>
      ) : failed || !stats ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <p className="text-sm text-muted-foreground">Dashboard load nahi ho paaya. Internet check karke dobara try karein.</p>
          <Button onClick={load} className="mt-4 rounded-xl font-bold px-8">
            Retry
          </Button>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-4 pb-10">
          <div className="rounded-3xl border border-border/60 bg-muted/60 p-5">
            <div className="flex items-center gap-2 text-emerald-500">
              <TrendingUp className="w-5 h-5" />
              <span className="text-sm font-semibold">Total views</span>
            </div>
            <p className="mt-1 text-4xl font-black text-foreground">{formatCompact(stats.totalViews)}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Pichhle 30 din me daale gaye reels & videos par {formatCompact(stats.recentViews)} views
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {cards.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="mt-2 text-2xl font-bold text-foreground">{formatCompact(value)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground mb-2">Top content</h2>
            {stats.top.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-2xl border border-border/60 p-4 text-center">
                Abhi kisi reel ya video par views nahi hain.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.top.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => navigate(item.kind === 'reel' ? `/reels?r=${item.id}` : `/videos/${item.id}`)}
                    className="w-full flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-2 text-left active:scale-[0.99] transition-transform"
                  >
                    <span className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : item.kind === 'reel' ? (
                        <Film className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <VideoIcon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground truncate">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.kind === 'reel' ? 'Reel' : 'Video'} · {formatCompact(item.views)} views
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </MobileLayout>
  );
};

export default ProfessionalDashboardPage;
