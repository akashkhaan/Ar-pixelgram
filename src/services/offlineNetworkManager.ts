// Offline Network Manager for Ar-Pixelgram
// Manages regional network shutdown detection, offline caching, and filtering for Reels, Calls & Messages

export interface OfflineNetworkState {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  effectiveOffline: boolean;
  userRegion: string;
  isAreaOutage: boolean;
  autoDetectAreaOutage: boolean;
  lastCheckedAt: number;
}

export interface CachedReelItem {
  id: string;
  user_id: string;
  video_url: string;
  caption: string | null;
  thumbnail_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profile?: {
    id: string;
    user_id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  music_title?: string | null;
  music_artist?: string | null;
  music_preview_url?: string | null;
}

export interface FollowContact {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  relation: 'follower' | 'following' | 'both';
}

const STORAGE_KEY_REELS = 'ar_pixelgram_cached_reels';
const STORAGE_KEY_FOLLOWS = 'ar_pixelgram_cached_follows';
const STORAGE_KEY_SIM_OFFLINE = 'ar_pixelgram_sim_offline';
const STORAGE_KEY_REGION = 'ar_pixelgram_user_region';

class OfflineNetworkManager {
  private listeners: ((state: OfflineNetworkState) => void)[] = [];
  private simOffline = false;
  private userRegion = 'India 🇮🇳';
  private autoDetectAreaOutage = true;
  private isAreaOutage = false;
  private lastCheckedAt = Date.now();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.simOffline = localStorage.getItem(STORAGE_KEY_SIM_OFFLINE) === 'true';
        const savedRegion = localStorage.getItem(STORAGE_KEY_REGION);
        if (savedRegion) {
          this.userRegion = savedRegion;
        } else {
          // Detect user timezone/country default
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          if (tz.includes('Calcutta') || tz.includes('Kolkata') || tz.includes('Asia/Colombo')) {
            this.userRegion = 'India 🇮🇳';
          }
        }
      } catch {}

      window.addEventListener('online', () => this.handleNetworkEvent(true));
      window.addEventListener('offline', () => this.handleNetworkEvent(false));

      // Periodic connectivity / area health check every 15 seconds
      setInterval(() => this.checkConnectivity(), 15000);
    }
  }

  private handleNetworkEvent(online: boolean) {
    this.isAreaOutage = !online;
    this.lastCheckedAt = Date.now();
    this.notify();
  }

  private async checkConnectivity() {
    if (typeof navigator === 'undefined') return;
    const navOnline = navigator.onLine;
    if (!navOnline) {
      this.isAreaOutage = true;
      this.lastCheckedAt = Date.now();
      this.notify();
      return;
    }
    this.lastCheckedAt = Date.now();
  }

  public getState(): OfflineNetworkState {
    const rawOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    // An outage is active for this user if their physical connection is severed or simulated shutdown is active
    const isOutage = this.simOffline || !rawOnline || this.isAreaOutage;
    return {
      isOnline: rawOnline,
      isSimulatedOffline: this.simOffline,
      effectiveOffline: isOutage,
      userRegion: this.userRegion,
      isAreaOutage: isOutage,
      autoDetectAreaOutage: this.autoDetectAreaOutage,
      lastCheckedAt: this.lastCheckedAt,
    };
  }

  public setSimulatedOffline(val: boolean) {
    this.simOffline = val;
    this.isAreaOutage = val;
    try {
      localStorage.setItem(STORAGE_KEY_SIM_OFFLINE, String(val));
    } catch {}
    this.notify();
  }

  public setUserRegion(region: string) {
    this.userRegion = region;
    try {
      localStorage.setItem(STORAGE_KEY_REGION, region);
    } catch {}
    this.notify();
  }

  public subscribe(cb: (state: OfflineNetworkState) => void): () => void {
    this.listeners.push(cb);
    cb(this.getState());
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach(cb => {
      try { cb(s); } catch {}
    });
  }

  // Save network follows (Followers + Following) for offline use
  public saveNetworkContacts(contacts: FollowContact[]) {
    try {
      localStorage.setItem(STORAGE_KEY_FOLLOWS, JSON.stringify(contacts));
    } catch {}
  }

  public getNetworkContacts(): FollowContact[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_FOLLOWS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Cache reels locally so videos play without network
  public cacheReels(reels: CachedReelItem[]) {
    try {
      localStorage.setItem(STORAGE_KEY_REELS, JSON.stringify(reels.slice(0, 30)));
    } catch {}
  }

  public getCachedReels(): CachedReelItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_REELS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Filter reels: in Offline mode, only return reels from followers and following (plus current user)
  public filterReelsForOffline(reels: CachedReelItem[], currentUserId: string): CachedReelItem[] {
    const contacts = this.getNetworkContacts();
    const networkUserIds = new Set<string>([
      currentUserId,
      ...contacts.map(c => c.user_id),
    ]);

    return reels.filter(r => networkUserIds.has(r.user_id));
  }
}

export const offlineManager = new OfflineNetworkManager();
