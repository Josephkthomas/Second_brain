-- Migration 007: YouTube Playlist Auto-Ingestion
-- Adds youtube_playlists table and modifies youtube_ingestion_queue

-- ============================================
-- NEW TABLE: youtube_playlists
-- ============================================

CREATE TABLE IF NOT EXISTS youtube_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id TEXT NOT NULL,                    -- YouTube playlist ID (e.g., PLxxxxxxx)
  playlist_url TEXT NOT NULL,                   -- Full YouTube playlist URL
  playlist_name TEXT,                           -- Playlist title from YouTube
  synapse_code TEXT NOT NULL,                   -- Generated code (e.g., SYN-7K3M)
  thumbnail_url TEXT,
  -- Ingestion settings
  auto_process BOOLEAN NOT NULL DEFAULT true,
  extraction_mode TEXT NOT NULL DEFAULT 'comprehensive',
  anchor_emphasis TEXT NOT NULL DEFAULT 'standard',
  linked_anchor_ids UUID[] DEFAULT '{}',
  custom_instructions TEXT,
  -- Polling state
  last_polled_at TIMESTAMPTZ,
  last_new_video_at TIMESTAMPTZ,
  known_video_count INTEGER NOT NULL DEFAULT 0,
  total_videos_ingested INTEGER NOT NULL DEFAULT 0,
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  connection_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (connection_status IN ('pending', 'verified', 'error', 'disconnected')),
  connection_error TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, playlist_id)
);

-- RLS
ALTER TABLE youtube_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own playlist connections"
  ON youtube_playlists FOR ALL USING (auth.uid() = user_id);

-- Index for polling active playlists
CREATE INDEX idx_youtube_playlists_active
  ON youtube_playlists(is_active, last_polled_at)
  WHERE is_active = true;

-- ============================================
-- MODIFY: youtube_ingestion_queue
-- Add playlist_source_id column
-- ============================================

ALTER TABLE youtube_ingestion_queue
  ADD COLUMN IF NOT EXISTS playlist_source_id UUID REFERENCES youtube_playlists(id) ON DELETE SET NULL;

-- Index for playlist-based queue filtering
CREATE INDEX IF NOT EXISTS idx_youtube_queue_playlist
  ON youtube_ingestion_queue(playlist_source_id)
  WHERE playlist_source_id IS NOT NULL;
