export interface TopContent {
  kind: 'reel' | 'video';
  id: string;
  title: string;
  thumbnail: string | null;
  views: number;
}
export interface ProfessionalStats {
  totalViews: number;
  reelViews: number;
  videoViews: number;
  recentViews: number;
  totalLikes: number;
  contentCount: number;
  top: TopContent[];
}
export declare function summarizeProfessionalStats(input?: {
  reels?: ReadonlyArray<{ id: string; views_count?: number | null; likes_count?: number | null; created_at?: string; caption?: string | null; thumbnail_url?: string | null }>;
  videos?: ReadonlyArray<{ id: string; views_count?: number | null; likes_count?: number | null; created_at?: string; title?: string | null; thumbnail_url?: string | null }>;
  posts?: ReadonlyArray<{ likes_count?: number | null }>;
  now?: number;
}): ProfessionalStats;
export declare function formatCompact(value: number): string;
