// Orientation Engine Type Definitions

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type ChannelType = 'email' | 'telegram' | 'slack';
export type DensityLevel = 'brief' | 'standard' | 'comprehensive';
export type DigestStatus = 'generating' | 'completed' | 'failed' | 'partial';

export interface DigestProfile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  frequency: ScheduleFrequency;
  delivery_time: string; // HH:MM format
  delivery_day_of_week: number | null; // 0-6, 0=Sunday
  delivery_day_of_month: number | null; // 1-31
  timezone: string; // IANA timezone
  scope: DigestScope;
  density: DensityLevel;
  is_active: boolean;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data (populated by fetchDigestProfile)
  modules?: DigestModule[];
  channels?: DigestChannel[];
}

export type DigestScope =
  | { mode: 'all_active' }
  | { mode: 'selected'; anchor_ids: string[] };

export interface DigestModule {
  id: string;
  digest_profile_id: string;
  user_id: string;
  template_id: string | null;
  custom_name: string | null;
  custom_system_prompt: string | null;
  user_context: string | null;
  tools_enabled: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface DigestChannel {
  id: string;
  digest_profile_id: string;
  user_id: string;
  channel_type: ChannelType;
  channel_config: Record<string, string>;
  density_override: DensityLevel | null;
  format_instructions: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DigestHistoryEntry {
  id: string;
  digest_profile_id: string;
  user_id: string;
  delivered_at: string;
  content: DigestOutput;
  module_outputs: DigestModuleOutput[];
  channels_delivered: string[];
  status: DigestStatus;
  error_details: string | null;
  generation_time_ms: number | null;
  created_at: string;
}

export interface DigestOutput {
  generated_at: string;
  digest_profile_id: string;
  frequency: ScheduleFrequency;
  executive_summary: string;
  sections: DigestSection[];
  suggested_next_steps: DigestAction[];
  metadata: {
    nodes_scanned: number;
    edges_scanned: number;
    time_range: { from: string; to: string };
    modules_executed: number;
    cross_digest_references: string[];
  };
}

export interface DigestSection {
  module_id: string;
  module_name: string;
  icon: string;
  template_id: string | null; // null = custom module
  content: string; // Markdown
  highlights: string[];
  entities_referenced: string[];
}

export interface DigestAction {
  action: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  related_entities: string[];
}

export interface DigestModuleOutput {
  module_id: string;
  module_name: string;
  icon: string;
  template_id: string | null;
  content: string;
  highlights: string[];
  entities_referenced: string[];
  raw_data?: {
    nodes_count: number;
    edges_count: number;
  };
}
