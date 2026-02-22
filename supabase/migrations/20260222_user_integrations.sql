-- User Integrations table
-- Stores per-user integration connections (Circleback, Notion, etc.)

CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_slug TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  webhook_token TEXT UNIQUE,
  config JSONB DEFAULT '{}'::jsonb,
  total_items_received INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, integration_slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_webhook
  ON user_integrations(webhook_token) WHERE webhook_token IS NOT NULL;

-- RLS
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own integrations"
  ON user_integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own integrations"
  ON user_integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own integrations"
  ON user_integrations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own integrations"
  ON user_integrations FOR DELETE USING (auth.uid() = user_id);
