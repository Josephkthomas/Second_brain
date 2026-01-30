-- PRD 3: Extraction Guidance & Mode System
-- Migration for extraction_settings and extraction_sessions tables

-- ============================================
-- 1. Create extraction_settings table
-- Stores user's default extraction preferences
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Default extraction mode
  default_mode VARCHAR(50) DEFAULT 'comprehensive'
    CHECK (default_mode IN ('comprehensive', 'strategic', 'actionable', 'relational')),

  -- Default anchor emphasis
  default_anchor_emphasis VARCHAR(50) DEFAULT 'standard'
    CHECK (default_anchor_emphasis IN ('standard', 'aggressive', 'passive')),

  -- Additional settings (future extensibility)
  settings JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One settings record per user
  UNIQUE(user_id)
);

-- RLS Policies for extraction_settings
ALTER TABLE extraction_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own extraction settings" ON extraction_settings;
CREATE POLICY "Users can view own extraction settings"
  ON extraction_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own extraction settings" ON extraction_settings;
CREATE POLICY "Users can insert own extraction settings"
  ON extraction_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own extraction settings" ON extraction_settings;
CREATE POLICY "Users can update own extraction settings"
  ON extraction_settings FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own extraction settings" ON extraction_settings;
CREATE POLICY "Users can delete own extraction settings"
  ON extraction_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_extraction_settings_user_id
  ON extraction_settings(user_id);

-- ============================================
-- 2. Create extraction_sessions table
-- Tracks each extraction for analytics and re-extraction
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source information
  source_name VARCHAR(500),
  source_type VARCHAR(100),
  source_content_preview TEXT, -- First 500 chars for reference

  -- Settings used for this extraction
  extraction_mode VARCHAR(50) NOT NULL,
  anchor_emphasis VARCHAR(50) NOT NULL,
  user_guidance TEXT,
  selected_anchor_ids UUID[],

  -- Results
  extracted_node_ids UUID[],
  extracted_edge_ids UUID[],
  entity_count INTEGER DEFAULT 0,
  relationship_count INTEGER DEFAULT 0,

  -- Metadata
  extraction_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- User feedback (for future quality improvement)
  feedback_rating INTEGER CHECK (feedback_rating IS NULL OR (feedback_rating >= 1 AND feedback_rating <= 5)),
  feedback_text TEXT
);

-- RLS Policies for extraction_sessions
ALTER TABLE extraction_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own extraction sessions" ON extraction_sessions;
CREATE POLICY "Users can view own extraction sessions"
  ON extraction_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own extraction sessions" ON extraction_sessions;
CREATE POLICY "Users can insert own extraction sessions"
  ON extraction_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own extraction sessions" ON extraction_sessions;
CREATE POLICY "Users can update own extraction sessions"
  ON extraction_sessions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own extraction sessions" ON extraction_sessions;
CREATE POLICY "Users can delete own extraction sessions"
  ON extraction_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extraction_sessions_user_id
  ON extraction_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_sessions_created_at
  ON extraction_sessions(created_at DESC);

-- ============================================
-- 3. Updated_at trigger function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to extraction_settings
DROP TRIGGER IF EXISTS update_extraction_settings_updated_at ON extraction_settings;
CREATE TRIGGER update_extraction_settings_updated_at
  BEFORE UPDATE ON extraction_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. Cleanup function for old sessions
-- Keeps last N sessions per user
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_extraction_sessions(keep_count INTEGER DEFAULT 30)
RETURNS void AS $$
BEGIN
  DELETE FROM extraction_sessions
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as row_num
      FROM extraction_sessions
    ) AS ranked
    WHERE row_num > keep_count
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Summary of changes
-- ============================================
-- Created tables:
--   - extraction_settings: Stores user's default extraction preferences
--   - extraction_sessions: Tracks each extraction for analytics
--
-- RLS policies applied to both tables
-- Indexes created for performance
-- Trigger for auto-updating updated_at timestamp
-- Function for cleaning up old sessions
