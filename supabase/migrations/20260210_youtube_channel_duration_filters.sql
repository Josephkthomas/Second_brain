-- ============================================
-- YOUTUBE CHANNEL DURATION FILTERS
-- Migration: 20260210_youtube_channel_duration_filters.sql
-- Adds min/max video duration settings per channel
-- ============================================

-- Add duration filter columns to youtube_channels
ALTER TABLE youtube_channels
ADD COLUMN IF NOT EXISTS min_video_duration INTEGER DEFAULT 90,  -- Minimum duration in seconds (default 1.5 min to skip Shorts)
ADD COLUMN IF NOT EXISTS max_video_duration INTEGER DEFAULT NULL;  -- Maximum duration in seconds (NULL = unlimited)

-- Comments
COMMENT ON COLUMN youtube_channels.min_video_duration IS 'Minimum video duration in seconds. Default 90 (1.5 min) to skip YouTube Shorts';
COMMENT ON COLUMN youtube_channels.max_video_duration IS 'Maximum video duration in seconds. NULL means unlimited';
