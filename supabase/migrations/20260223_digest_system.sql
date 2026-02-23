-- Orientation Engine: Composable Digest System
-- 4 tables for user-configured intelligence briefings

-- Table 1: Digest Profiles
-- Each profile is a user-configured briefing (e.g., "Morning Brief", "Weekly Review")
CREATE TABLE IF NOT EXISTS digest_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Daily Briefing',
  description TEXT,
  frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  delivery_time TIME NOT NULL DEFAULT '08:00',
  delivery_day_of_week INTEGER CHECK (delivery_day_of_week BETWEEN 0 AND 6),
  delivery_day_of_month INTEGER CHECK (delivery_day_of_month BETWEEN 1 AND 31),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  scope JSONB NOT NULL DEFAULT '{"mode": "all_active"}',
  density TEXT NOT NULL DEFAULT 'standard'
    CHECK (density IN ('brief', 'standard', 'comprehensive')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE digest_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own digest profiles"
  ON digest_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_digest_profiles_user ON digest_profiles(user_id);
CREATE INDEX idx_digest_profiles_schedule
  ON digest_profiles(frequency, delivery_time, is_active)
  WHERE is_active = true;


-- Table 2: Digest Modules
-- Each module is a sub-agent section within a digest profile
CREATE TABLE IF NOT EXISTS digest_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_profile_id UUID NOT NULL REFERENCES digest_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT,
  custom_name TEXT,
  custom_system_prompt TEXT,
  user_context TEXT,
  tools_enabled JSONB NOT NULL DEFAULT '["graph_query"]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE digest_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own digest modules"
  ON digest_modules FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_digest_modules_profile ON digest_modules(digest_profile_id);
CREATE INDEX idx_digest_modules_user ON digest_modules(user_id);


-- Table 3: Digest Channels
-- Delivery targets per profile (email, telegram, slack)
CREATE TABLE IF NOT EXISTS digest_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_profile_id UUID NOT NULL REFERENCES digest_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'telegram', 'slack')),
  channel_config JSONB NOT NULL DEFAULT '{}',
  density_override TEXT CHECK (density_override IN ('brief', 'standard', 'comprehensive')),
  format_instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE digest_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own digest channels"
  ON digest_channels FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_digest_channels_profile ON digest_channels(digest_profile_id);
CREATE INDEX idx_digest_channels_user ON digest_channels(user_id);


-- Table 4: Digest History
-- Generated digest outputs, stored for viewing and cross-digest awareness
CREATE TABLE IF NOT EXISTS digest_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_profile_id UUID NOT NULL REFERENCES digest_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content JSONB NOT NULL DEFAULT '{}',
  module_outputs JSONB NOT NULL DEFAULT '[]',
  channels_delivered TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'completed', 'failed', 'partial')),
  error_details TEXT,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE digest_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own digest history"
  ON digest_history FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_digest_history_profile ON digest_history(digest_profile_id);
CREATE INDEX idx_digest_history_user ON digest_history(user_id, delivered_at DESC);
