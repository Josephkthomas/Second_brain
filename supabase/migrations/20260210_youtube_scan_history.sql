-- ============================================
-- YOUTUBE SCAN HISTORY TABLE
-- Migration: 20260210_youtube_scan_history.sql
-- Tracks all scan operations for audit/debugging
-- ============================================

CREATE TABLE IF NOT EXISTS youtube_scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES youtube_channels(id) ON DELETE SET NULL,

  -- Scan type
  scan_type VARCHAR(50) NOT NULL,  -- 'manual_scan', 'auto_poll', 'process'

  -- Channel info (denormalized for historical record)
  channel_name VARCHAR(255),
  channel_youtube_id VARCHAR(50),

  -- Results
  videos_found INTEGER DEFAULT 0,
  videos_added INTEGER DEFAULT 0,
  videos_skipped INTEGER DEFAULT 0,
  videos_processed INTEGER DEFAULT 0,
  videos_failed INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'completed',  -- 'completed', 'failed', 'partial'
  error_message TEXT,

  -- Duration
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_youtube_scan_history_user_id ON youtube_scan_history(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_scan_history_channel_id ON youtube_scan_history(channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_scan_history_created ON youtube_scan_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_scan_history_type ON youtube_scan_history(scan_type);

-- RLS
ALTER TABLE youtube_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scan history"
  ON youtube_scan_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scan history"
  ON youtube_scan_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comment
COMMENT ON TABLE youtube_scan_history IS 'Audit log of YouTube scan and processing operations';
