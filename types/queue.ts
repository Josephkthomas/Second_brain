// Universal Processing Queue Types
// Unified data model that normalizes items from youtube_ingestion_queue,
// ingest_queue, and knowledge_sources into a single type.

export type SourceCategory =
  | 'YouTube'
  | 'Meeting'
  | 'Document'
  | 'Research'
  | 'Note'
  | 'API'
  | 'Podcast'
  | 'Email'
  | 'Chat'
  | 'Article';

export type UnifiedStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export type QueueOrigin =
  | 'youtube_queue'
  | 'ingest_queue'
  | 'knowledge_source';

export interface ProcessingStage {
  label: string;
  status: 'done' | 'active' | 'pending' | 'failed';
}

export interface UnifiedQueueItem {
  id: string;
  origin: QueueOrigin;

  // Display
  title: string;
  sourceType: SourceCategory;
  sourceUrl: string | null;
  thumbnailUrl: string | null;

  // Status
  status: UnifiedStatus;
  stages: ProcessingStage[];
  errorMessage: string | null;

  // Results (populated for completed items)
  sourceId: string | null;
  nodesCreated: number;
  edgesCreated: number;
  topEntityTypes: { type: string; count: number }[];

  // Retry
  retryCount: number;
  maxRetries: number;
  canRetry: boolean;

  // Timestamps
  createdAt: string;
  completedAt: string | null;

  // Pass-through
  metadata: Record<string, any>;

  // YouTube-specific (optional)
  youtubeChannelName?: string;
  youtubePlaylistName?: string;
  videoUrl?: string;
}

export interface DeleteOptions {
  deleteNodesAndEdges: boolean;
  forceCancel: boolean;
}
