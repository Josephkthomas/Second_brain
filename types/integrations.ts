// Integrations Type Definitions

export interface UserIntegration {
  id: string;
  user_id: string;
  integration_slug: string;
  status: 'active' | 'paused' | 'error' | 'inactive';
  webhook_token: string | null;
  config: IntegrationConfig;
  total_items_ingested: number;
  last_received_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationConfig {
  source_type?: string;
  extraction_mode?: string;
  anchor_emphasis?: string;
  linked_anchor_ids?: string[];
  custom_instructions?: string;
  signing_secret?: string;
  [key: string]: any;
}

// Circleback webhook payload (defensive — handles both naming conventions)
export interface CirclebackPayload {
  // Primary fields
  title?: string;
  name?: string;
  summary?: string;
  notes?: string;
  transcript?: string | CirclebackTranscriptEntry[];
  action_items?: CirclebackActionItem[];
  actionItems?: CirclebackActionItem[];
  attendees?: (string | { name: string })[];
  // Metadata
  id?: string;
  date?: string;
  createdAt?: string;
  duration?: number;
  meeting_url?: string;
  tags?: string[];
}

export interface CirclebackActionItem {
  text?: string;
  title?: string;
  assignee?: string | { name: string };
  due_date?: string;
  status?: string;
}

export interface CirclebackTranscriptEntry {
  speaker: string;
  text: string;
}
