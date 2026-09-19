-- Add music fields to posts (matching reels music)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS music_track_id     TEXT,
  ADD COLUMN IF NOT EXISTS music_title        TEXT,
  ADD COLUMN IF NOT EXISTS music_artist       TEXT,
  ADD COLUMN IF NOT EXISTS music_artwork_url  TEXT,
  ADD COLUMN IF NOT EXISTS music_preview_url  TEXT,
  ADD COLUMN IF NOT EXISTS music_start_ms     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_duration_ms  INTEGER;
