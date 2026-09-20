import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  Bookmark,
  Play,
  Pause,
  Loader2,
  Music2,
  MapPin,
  Upload,
  ArrowRight,
  Sparkles,
  SlidersHorizontal,
  Flame,
  Radio,
} from 'lucide-react';
import {
  searchMusic,
  getTrendingMusic,
  formatMusicDuration,
  getDefaultMusicLocale,
  detectMusicLocale,
  saveMusicLocale,
  INDIAN_REGION_TERMS,
  COUNTRY_TERMS,
  getCountryName,
  getCountryTerms,
  ORIGINAL_AUDIOS,
  type MusicLocale,
  type MusicTrack,
} from '@/services/music';
import { getSavedSongs, saveSong, unsaveSong } from '@/services/savedSongs';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When user confirms track to trim */
  onSelect: (track: MusicTrack) => void;
}

type Tab = 'foryou' | 'trending' | 'saved' | 'original';

const POPULAR_STATES = [
  'Bihar',
  'Uttar Pradesh',
  'Jharkhand',
  'Delhi',
  'Punjab',
  'Haryana',
  'Maharashtra',
  'West Bengal',
  'Gujarat',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Karnataka',
  'Kerala',
];

const POPULAR_COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'NP', name: 'Nepal' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'UAE / Dubai' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'CN', name: 'China' },
];

const MusicPickerSheet: React.FC<Props> = ({ open, onClose, onSelect }) => {
  const [tab, setTab] = useState<Tab>('foryou');
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<MusicTrack[]>([]);
  const [saved, setSaved] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<MusicLocale>(() => getDefaultMusicLocale());
  const [locationLoading, setLocationLoading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Selected track for preview / bottom mini player
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Carousel current index
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Detect location
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLocationLoading(true);
    detectMusicLocale()
      .then((detected) => {
        if (active) setLocale(detected);
      })
      .finally(() => {
        if (active) setLocationLoading(false);
      });
    getSavedSongs().then(setSaved);
    return () => {
      active = false;
    };
  }, [open]);

  // Load trending and personalized tracks
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    getTrendingMusic(ac.signal, locale).then((list) => {
      if (!ac.signal.aborted) {
        setTrendingTracks(list);
        if (!query.trim()) {
          setTracks(list);
        }
      }
    });
    return () => ac.abort();
  }, [open, locale]);

  // Debounced search (unlimited results from A to Z)
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const ac = new AbortController();

    if (!q) {
      setTracks(trendingTracks);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      searchMusic(q, ac.signal, locale)
        .then((list) => {
          if (!ac.signal.aborted) setTracks(list);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, open, locale, trendingTracks]);

  // Handle Carousel auto-scroll
  useEffect(() => {
    if (trendingTracks.length === 0) return;
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % Math.min(5, trendingTracks.length));
    }, 4500);
    return () => clearInterval(timer);
  }, [trendingTracks.length]);

  // Stop audio on close
  useEffect(() => {
    if (open) return;
    audioRef.current?.pause();
    audioRef.current = null;
    setSelectedTrack(null);
    setIsPlaying(false);
  }, [open]);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved]);

  const togglePreview = (track: MusicTrack) => {
    if (selectedTrack?.id === track.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(track.previewUrl);
    audio.play().catch(() => toast.error('Preview could not play'));
    audio.onended = () => setIsPlaying(false);
    audioRef.current = audio;
    setSelectedTrack(track);
    setIsPlaying(true);
  };

  const toggleSave = async (track: MusicTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    if (savedIds.has(track.id)) {
      await unsaveSong(track.id);
      setSaved((prev) => prev.filter((s) => s.id !== track.id));
      toast.success('Removed from saved');
    } else {
      await saveSong(track);
      setSaved((prev) => [track, ...prev]);
      toast.success('Saved to collection 🎵');
    }
  };

  const handleContinue = (track?: MusicTrack) => {
    const target = track || selectedTrack;
    if (!target) return;
    audioRef.current?.pause();
    setIsPlaying(false);
    onSelect(target);
  };

  // Import custom audio/video from device
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const customTrack: MusicTrack = {
      id: `custom_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Imported Audio',
      artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
      previewUrl: url,
      durationMs: 30000,
      isOriginalAudio: true,
      reelsCount: '1',
    };

    onSelect(customTrack);
  };

  // Manually select state / region
  const handleSelectState = (stateName: string) => {
    const regionTerms = INDIAN_REGION_TERMS[stateName] || [];
    const newLocale: MusicLocale = {
      countryCode: 'IN',
      countryName: 'India',
      regionName: stateName,
      localTerms: [...regionTerms, `${stateName} songs`, 'bollywood latest songs'],
      source: 'manual',
    };
    saveMusicLocale(newLocale);
    setLocale(newLocale);
    setShowLocationPicker(false);
    toast.success(`Music location set to ${stateName}!`);
  };

  const handleSelectCountry = (code: string, name: string) => {
    const newLocale: MusicLocale = {
      countryCode: code,
      countryName: name,
      regionName: undefined,
      localTerms: getCountryTerms(code, name),
      source: 'manual',
    };
    saveMusicLocale(newLocale);
    setLocale(newLocale);
    setShowLocationPicker(false);
    toast.success(`Music location set to ${name}!`);
  };

  if (!open) return null;

  // Decide current display list
  let displayList: MusicTrack[] = [];
  if (query.trim()) {
    displayList = tracks;
  } else if (tab === 'saved') {
    displayList = saved;
  } else if (tab === 'original') {
    displayList = ORIGINAL_AUDIOS;
  } else if (tab === 'trending') {
    displayList = trendingTracks;
  } else {
    displayList = tracks;
  }

  const featured = trendingTracks.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[75] bg-black text-white flex flex-col font-sans select-none">
      {/* Top Search & Action Bar */}
      <div className="px-4 pt-3 pb-2 border-b border-white/10 space-y-2.5">
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full h-9 pl-9 pr-8 rounded-full bg-white/15 text-sm text-white placeholder:text-white/50 outline-none focus:ring-1 focus:ring-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Import Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-semibold text-white shrink-0 transition-all border border-white/10"
            title="Import audio from your device"
          >
            <Upload className="w-3.5 h-3.5 text-primary" />
            <span>Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* Close sheet */}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Location Indicator & Change Option */}
        <div className="flex items-center justify-between text-xs text-white/70 px-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="truncate">
              {locationLoading
                ? 'Locating music near you…'
                : `Trending in ${locale.regionName ? `${locale.regionName}, ` : ''}${locale.countryName}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowLocationPicker(true)}
            className="text-[11px] text-primary hover:underline font-semibold shrink-0 ml-2"
          >
            Change
          </button>
        </div>

        {/* Category Tabs: For you | Trending | Saved | Original audio */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => {
              setTab('foryou');
              setQuery('');
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              tab === 'foryou' && !query ? 'bg-white text-black font-bold' : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            For you
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('trending');
              setQuery('');
            }}
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              tab === 'trending' && !query ? 'bg-white text-black font-bold' : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            <Flame className="w-3 h-3 text-orange-500" />
            Trending
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('saved');
              setQuery('');
            }}
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              tab === 'saved' && !query ? 'bg-white text-black font-bold' : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            <Bookmark className="w-3 h-3" />
            Saved{saved.length > 0 ? ` (${saved.length})` : ''}
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('original');
              setQuery('');
            }}
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              tab === 'original' && !query ? 'bg-white text-black font-bold' : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            <Radio className="w-3 h-3 text-emerald-400" />
            Original audio
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Featured Carousel Banner (Only on For You tab when not searching) */}
        {!query && tab === 'foryou' && featured.length > 0 && (
          <div className="p-4 pb-2">
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-black border border-white/15 p-4 shadow-xl">
              {featured[carouselIndex] && (
                <div
                  className="flex items-center gap-3.5 cursor-pointer"
                  onClick={() => togglePreview(featured[carouselIndex])}
                >
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-lg border border-white/20">
                    <img
                      src={featured[carouselIndex].artwork}
                      alt={featured[carouselIndex].title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      {selectedTrack?.id === featured[carouselIndex].id && isPlaying ? (
                        <Pause className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white ml-0.5" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-bold tracking-wide uppercase">
                        Featured
                      </span>
                      <span className="text-[11px] text-white/60">
                        {featured[carouselIndex].reelsCount} reels
                      </span>
                    </div>
                    <p className="font-bold text-sm text-white truncate">
                      {featured[carouselIndex].title}
                    </p>
                    <p className="text-xs text-white/70 truncate mt-0.5">
                      {featured[carouselIndex].artist}
                    </p>
                  </div>
                </div>
              )}

              {/* Dots */}
              <div className="flex items-center justify-center gap-1.5 mt-3">
                {featured.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCarouselIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      carouselIndex === i ? 'w-5 bg-white' : 'w-1.5 bg-white/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-white/50">Loading songs…</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && displayList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Music2 className="w-6 h-6 text-white/50" />
            </div>
            <p className="text-sm font-semibold text-white">No songs found</p>
            <p className="text-xs text-white/50 max-w-xs">
              {query
                ? 'Try searching with another song or artist name.'
                : tab === 'saved'
                ? 'You have not saved any songs yet.'
                : 'No songs available in this category.'}
            </p>
          </div>
        )}

        {/* Track List */}
        {!loading && displayList.length > 0 && (
          <div className="divide-y divide-white/5 px-2">
            {displayList.map((track) => {
              const isSelected = selectedTrack?.id === track.id;
              const isCurrentlyPlaying = isSelected && isPlaying;
              const isSaved = savedIds.has(track.id);

              return (
                <div
                  key={track.id}
                  onClick={() => togglePreview(track)}
                  className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10'
                  }`}
                >
                  {/* Artwork & Play overlay */}
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/10 shadow">
                    {track.artwork ? (
                      <img
                        src={track.artwork}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="w-5 h-5 text-white/50" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      {isCurrentlyPlaying ? (
                        <Pause className="w-4 h-4 text-white" />
                      ) : (
                        <Play className="w-4 h-4 text-white ml-0.5" />
                      )}
                    </div>
                  </div>

                  {/* Title and details */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-white'}`}>
                      {track.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-white/55 truncate mt-0.5">
                      <span className="truncate">{track.artist}</span>
                      <span>•</span>
                      <span>{track.reelsCount || '600K'} reels</span>
                      <span>•</span>
                      <span>{formatMusicDuration(track.durationMs)}</span>
                    </div>
                  </div>

                  {/* Bookmark Save Button */}
                  <button
                    type="button"
                    onClick={(e) => toggleSave(track, e)}
                    className="p-2 rounded-full hover:bg-white/10 active:scale-90 text-white/60 transition-transform shrink-0"
                    title={isSaved ? 'Unsave' : 'Save'}
                  >
                    <Bookmark
                      className={`w-5 h-5 ${isSaved ? 'fill-primary text-primary' : 'text-white/60'}`}
                    />
                  </button>

                  {/* Quick Trim Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContinue(track);
                    }}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white shrink-0"
                    title="Select and trim this track"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Mini-Player Bar (Matches user's video frames 0:08 - 0:09) */}
      {selectedTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-xl border-t border-white/15 p-3 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
            onClick={() => togglePreview(selectedTrack)}
          >
            <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-white/20 shadow">
              <img
                src={selectedTrack.artwork}
                alt={selectedTrack.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                {isPlaying ? (
                  <Pause className="w-4 h-4 text-white" />
                ) : (
                  <Play className="w-4 h-4 text-white ml-0.5" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">{selectedTrack.title}</p>
              <p className="text-xs text-white/60 truncate">{selectedTrack.artist}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              type="button"
              onClick={() => handleContinue()}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-gradient-to-r from-[hsl(var(--p1))] to-[hsl(var(--p2))] text-white font-bold text-xs shadow-md active:scale-95 transition-all"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Location / State Selection Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end p-0">
          <div className="bg-zinc-900 border-t border-white/15 rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">Select Location for Music</h3>
                <p className="text-xs text-white/60 mt-0.5">
                  Get songs trending in your specific state or country
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationPicker(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Indian States Section */}
              <div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                  Indian States & Regions (Bhojpuri, Punjabi, Hindi, etc.)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {POPULAR_STATES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleSelectState(st)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-left truncate transition-colors border ${
                        locale.regionName === st
                          ? 'bg-primary/20 border-primary text-primary font-bold'
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Countries Section */}
              <div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                  All Earth Countries
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {POPULAR_COUNTRIES.map((ct) => (
                    <button
                      key={ct.code}
                      type="button"
                      onClick={() => handleSelectCountry(ct.code, ct.name)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-left truncate transition-colors border ${
                        locale.countryCode === ct.code && !locale.regionName
                          ? 'bg-primary/20 border-primary text-primary font-bold'
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      {ct.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Detect Button */}
              <button
                type="button"
                onClick={() => {
                  setLocationLoading(true);
                  setShowLocationPicker(false);
                  detectMusicLocale().then((loc) => {
                    setLocale(loc);
                    setLocationLoading(false);
                    toast.success(`Detected location: ${loc.regionName ? `${loc.regionName}, ` : ''}${loc.countryName}`);
                  });
                }}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4 text-rose-500" />
                <span>Auto-Detect My Current GPS / Location</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicPickerSheet;
