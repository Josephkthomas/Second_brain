-- User Integrations table
-- Stores per-user integration connections (Circleback, Notion, etc.)

CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'paused', 'error', 'inactive')),
  webhook_token TEXT UNIQUE,
  config JSONB DEFAULT '{}',
  last_received_at TIMESTAMPTZ,
  total_items_ingested INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, integration_slug)
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integrations"
  ON user_integrations FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_integrations_token ON user_integrations(webhook_token);
CREATE INDEX idx_user_integrations_user ON user_integrations(user_id);
