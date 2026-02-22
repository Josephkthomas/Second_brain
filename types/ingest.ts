// Universal Ingest API Types

export type IngestQueueStatus =
  | 'pending'
  | 'extracting'
  | 'cross_connecting'
  | 'embedding'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface IngestQueueItem {
  id: string;
  user_id: string;
  title: string;
  content: string;
  source_type: string;
  source_url: string | null;
  custom_instructions: string | null;
  extraction_mode: string;
  anchor_emphasis: string;
  linked_anchor_ids: string[];
  status: IngestQueueStatus;
  priority: number;
  source_id: string | null;
  nodes_created: number;
  edges_created: number;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  metadata: Record<string, any>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface IngestApiRequest {
  title: string;
  content: string;
  source_type?: string;
  source_url?: string;
  custom_instructions?: string;
  extraction_mode?: string;
  anchor_emphasis?: string;
  linked_anchor_ids?: string[];
  priority?: number;
  metadata?: Record<string, any>;
}

export interface IngestApiResponse {
  id: string;
  status: 'pending';
  message: string;
}
