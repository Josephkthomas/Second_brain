-- ============================================
-- YOUTUBE CHANNEL AUTO-INGESTION TABLES
-- Migration: 20260209_youtube_ingestion.sql
-- ============================================

-- ============================================
-- TABLE 1: youtube_channels
-- Stores user's YouTube channel subscriptions
-- ============================================

CREATE TABLE IF NOT EXISTS youtube_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Channel identification
  channel_id VARCHAR(50) NOT NULL,  -- YouTube channel ID (UCxxxx format)
  channel_name VARCHAR(255) NOT NULL,
  channel_url TEXT NOT NULL,
  thumbnail_url TEXT,
  description TEXT,
  subscriber_count INTEGER,

  -- Extraction settings
  auto_ingest BOOLEAN DEFAULT true,
  extraction_mode VARCHAR(50) DEFAULT 'comprehensive',
  anchor_emphasis VARCHAR(50) DEFAULT 'standard',
  linked_anchor_ids UUID[] DEFAULT '{}',  -- Anchors to associate with extracted content
  custom_instructions TEXT,

  -- Tracking
  last_checked_at TIMESTAMPTZ,
  last_video_published_at TIMESTAMPTZ,
  total_videos_ingested INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique channel per user
  UNIQUE(user_id, channel_id)
);

-- Indexes for youtube_channels
CREATE INDEX IF NOT EXISTS idx_youtube_channels_user_id ON youtube_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_is_active ON youtube_channels(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_youtube_channels_last_checked ON youtube_channels(last_checked_at);

-- RLS for youtube_channels
ALTER TABLE youtube_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own channels"
  ON youtube_channels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own channels"
  ON youtube_channels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own channels"
  ON youtube_channels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channels"
  ON youtube_channels FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- TABLE 2: youtube_ingestion_queue
-- Queue for video processing jobs
-- ============================================

CREATE TABLE IF NOT EXISTS youtube_ingestion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES youtube_channels(id) ON DELETE CASCADE,

  -- Video identification
  video_id VARCHAR(20) NOT NULL,  -- YouTube video ID (11 chars typically)
  video_title VARCHAR(500),
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Processing state
  status VARCHAR(50) DEFAULT 'pending',  -- pending, fetching_transcript, extracting, completed, failed, skipped
  priority INTEGER DEFAULT 5,  -- 1-10, lower is higher priority

  -- Results
  transcript TEXT,
  transcript_language VARCHAR(10),
  transcript_fetched_at TIMESTAMPTZ,
  source_id UUID,  -- References knowledge_sources(id) after extraction
  nodes_created INTEGER DEFAULT 0,
  edges_created INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Prevent duplicate video ingestion per user
  UNIQUE(user_id, video_id)
);

-- Indexes for youtube_ingestion_queue
CREATE INDEX IF NOT EXISTS idx_youtube_queue_user_id ON youtube_ingestion_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_queue_status ON youtube_ingestion_queue(status);
CREATE INDEX IF NOT EXISTS idx_youtube_queue_pending ON youtube_ingestion_queue(user_id, status, priority) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_youtube_queue_channel ON youtube_ingestion_queue(channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_queue_created ON youtube_ingestion_queue(created_at DESC);

-- RLS for youtube_ingestion_queue
ALTER TABLE youtube_ingestion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own queue"
  ON youtube_ingestion_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queue items"
  ON youtube_ingestion_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queue items"
  ON youtube_ingestion_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queue items"
  ON youtube_ingestion_queue FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- TABLE 3: youtube_settings
-- Global settings per user
-- ============================================

CREATE TABLE IF NOT EXISTS youtube_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- API keys (encrypted at rest by Supabase)
  apify_api_key TEXT,

  -- Global defaults
  default_auto_ingest BOOLEAN DEFAULT true,
  default_extraction_mode VARCHAR(50) DEFAULT 'comprehensive',
  default_anchor_emphasis VARCHAR(50) DEFAULT 'standard',
  max_concurrent_extractions INTEGER DEFAULT 3,
  max_videos_per_channel INTEGER DEFAULT 50,  -- How many historical to backfill

  -- Rate limiting
  daily_video_limit INTEGER DEFAULT 20,
  videos_ingested_today INTEGER DEFAULT 0,
  daily_limit_reset_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for youtube_settings
CREATE INDEX IF NOT EXISTS idx_youtube_settings_user_id ON youtube_settings(user_id);

-- RLS for youtube_settings
ALTER TABLE youtube_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON youtube_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON youtube_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON youtube_settings FOR UPDATE
  USING (auth.uid() = user_id);


-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_youtube_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for youtube_channels
DROP TRIGGER IF EXISTS trigger_youtube_channels_updated_at ON youtube_channels;
CREATE TRIGGER trigger_youtube_channels_updated_at
  BEFORE UPDATE ON youtube_channels
  FOR EACH ROW EXECUTE FUNCTION update_youtube_updated_at();

-- Trigger for youtube_settings
DROP TRIGGER IF EXISTS trigger_youtube_settings_updated_at ON youtube_settings;
CREATE TRIGGER trigger_youtube_settings_updated_at
  BEFORE UPDATE ON youtube_settings
  FOR EACH ROW EXECUTE FUNCTION update_youtube_updated_at();


-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to reset daily video limits (called by cron or on first request of day)
CREATE OR REPLACE FUNCTION reset_youtube_daily_limits()
RETURNS void AS $$
BEGIN
  UPDATE youtube_settings
  SET videos_ingested_today = 0,
      daily_limit_reset_at = NOW()
  WHERE daily_limit_reset_at IS NULL
     OR daily_limit_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment videos ingested count
CREATE OR REPLACE FUNCTION increment_youtube_videos_ingested(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE youtube_settings
  SET videos_ingested_today = videos_ingested_today + 1
  WHERE user_id = p_user_id;

  UPDATE youtube_channels
  SET total_videos_ingested = total_videos_ingested + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old completed queue items (keep last 100 per user)
CREATE OR REPLACE FUNCTION cleanup_youtube_queue(keep_count INTEGER DEFAULT 100)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY completed_at DESC) as rn
    FROM youtube_ingestion_queue
    WHERE status = 'completed'
  )
  DELETE FROM youtube_ingestion_queue
  WHERE id IN (SELECT id FROM ranked WHERE rn > keep_count);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- COMMENTS for documentation
-- ============================================

COMMENT ON TABLE youtube_channels IS 'Stores YouTube channel subscriptions for auto-ingestion';
COMMENT ON TABLE youtube_ingestion_queue IS 'Processing queue for YouTube video transcript extraction and knowledge graph ingestion';
COMMENT ON TABLE youtube_settings IS 'Global YouTube ingestion settings per user';

COMMENT ON COLUMN youtube_channels.linked_anchor_ids IS 'Array of anchor node UUIDs to automatically link extracted content to';
COMMENT ON COLUMN youtube_channels.extraction_mode IS 'Gemini extraction mode: comprehensive, strategic, actionable, relational';
COMMENT ON COLUMN youtube_channels.anchor_emphasis IS 'How strongly to emphasize anchor connections: standard, aggressive, passive';

COMMENT ON COLUMN youtube_ingestion_queue.status IS 'Processing status: pending, fetching_transcript, extracting, completed, failed, skipped';
COMMENT ON COLUMN youtube_ingestion_queue.priority IS 'Processing priority 1-10, lower numbers processed first';
COMMENT ON COLUMN youtube_ingestion_queue.source_id IS 'References knowledge_sources.id after successful extraction';
