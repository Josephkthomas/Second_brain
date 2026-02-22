-- Universal Ingest API: Queue table for external content ingestion
-- Modeled after youtube_ingestion_queue

CREATE TABLE IF NOT EXISTS ingest_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content payload
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type VARCHAR(50) DEFAULT 'API',
  source_url TEXT,
  custom_instructions TEXT,

  -- Extraction config
  extraction_mode VARCHAR(50) DEFAULT 'comprehensive',
  anchor_emphasis VARCHAR(50) DEFAULT 'standard',
  linked_anchor_ids UUID[] DEFAULT '{}',

  -- Processing state
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'cross_connecting', 'embedding', 'completed', 'failed', 'skipped')),
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

  -- Results (populated on completion)
  source_id UUID,
  nodes_created INTEGER DEFAULT 0,
  edges_created INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Flexible metadata from caller
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ingest_queue_user_id ON ingest_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_ingest_queue_status ON ingest_queue(status);
CREATE INDEX IF NOT EXISTS idx_ingest_queue_pending
  ON ingest_queue(user_id, status, priority, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ingest_queue_created ON ingest_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_queue_stale
  ON ingest_queue(status, started_at)
  WHERE status IN ('extracting', 'cross_connecting', 'embedding');

-- Row Level Security
ALTER TABLE ingest_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ingest queue"
  ON ingest_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ingest items"
  ON ingest_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ingest items"
  ON ingest_queue FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ingest items"
  ON ingest_queue FOR DELETE USING (auth.uid() = user_id);

-- Enable Realtime for live status updates in the frontend
ALTER PUBLICATION supabase_realtime ADD TABLE ingest_queue;
