// YouTube Watch History Import Pipeline Types
// PRD: Watch History HTML Import Pipeline

import type { ExtractionMode, AnchorEmphasis } from './extraction';

// ============================================
// STAGE 1: PARSED ENTRY TYPES
// ============================================

/**
 * A single watch history entry parsed from Google Takeout HTML
 */
export interface WatchHistoryEntry {
  video_title: string;       // HTML-decoded
  video_url: string;
  video_id: string;          // Extracted from watch?v=XXX
  channel_name: string;      // HTML-decoded
  channel_url: string;
  channel_id: string;        // Extracted from /channel/UCxxxx
  timestamp: Date;           // Parsed from "Mon DD, YYYY, HH:MM:SS AM/PM GMT"
  is_short: boolean;
  is_ad: boolean;
  is_deleted: boolean;
}

/**
 * Result of parsing the complete watch history HTML file
 */
export interface ParsedWatchHistory {
  entries: WatchHistoryEntry[];
  metadata: WatchHistoryMetadata;
}

export interface WatchHistoryMetadata {
  totalParsed: number;
  dateRange: { earliest: Date; latest: Date };
  uniqueChannels: number;
  uniqueVideos: number;
  skippedAds: number;
  skippedDeleted: number;
  skippedShorts: number;
}

// ============================================
// STAGE 2: DEDUPLICATED & FILTERED ENTRIES
// ============================================

/**
 * Entry after deduplication — collapses multiple views into one record
 */
export interface DeduplicatedEntry {
  video_title: string;
  video_url: string;
  video_id: string;
  channel_name: string;
  channel_url: string;
  channel_id: string;
  is_short: boolean;
  view_count: number;
  first_watched: Date;
  last_watched: Date;
  timestamps: Date[];
}

/**
 * User-configurable filters applied before processing
 */
export interface WatchHistoryFilters {
  includeShorts: boolean;
  dateRange: { start: Date | null; end: Date | null };
  minViewCount: number;
  channelBlocklist: string[];  // channel_id values to exclude
  minChannelFrequency: number; // only include channels with N+ total videos
}

export const DEFAULT_WATCH_HISTORY_FILTERS: WatchHistoryFilters = {
  includeShorts: false,
  dateRange: { start: null, end: null },
  minViewCount: 1,
  channelBlocklist: [],
  minChannelFrequency: 1,
};

// ============================================
// STAGE 3: CLUSTERING & BATCHING
// ============================================

/**
 * Channel tag info fetched from YouTube Data API
 */
export interface ChannelTagInfo {
  topicCategories: string[];  // Wikidata-based taxonomy URLs
  tags: string[];             // Channel keywords from snippet
  description: string;
}

/**
 * A batch of videos ready for extraction
 */
export interface VideoBatch {
  batch_id: string;
  batch_type: 'channel' | 'thematic' | 'temporal';
  label: string;                      // e.g., "Matthew Berman (AI)" or "Q2 2024 — Technology"
  entries: DeduplicatedEntry[];
  total_views: number;                // Sum of view_counts
  channel_names: string[];            // Unique channels in batch
  channel_tags: string[];             // Aggregated from YouTube API (Tier 2)
  date_range: { start: Date; end: Date };
}

// ============================================
// STAGE 4: EXTRACTION RESULTS
// ============================================

/**
 * Node extracted from a single batch
 */
export interface WatchHistoryExtractedNode {
  label: string;
  type: string;
  description: string;
  confidence: number;
  tags: string[];
  evidence: string;          // Which video titles support this
  view_weight: number;       // Total views across related videos
}

/**
 * Edge extracted from a single batch
 */
export interface WatchHistoryExtractedEdge {
  source: string;            // Exact node label
  target: string;            // Exact node label
  relation: string;
  evidence: string;
  weight: number;
}

/**
 * Result from a single batch extraction
 */
export interface BatchExtractionResult {
  batch_id: string;
  nodes: WatchHistoryExtractedNode[];
  edges: WatchHistoryExtractedEdge[];
  batch_summary: string;
}

// ============================================
// STAGE 5: MERGED ENTITIES
// ============================================

/**
 * Entity after cross-batch merging
 */
export interface MergedEntity {
  label: string;
  type: string;
  description: string;
  confidence: number;
  tags: string[];
  total_view_weight: number;
  source_batches: string[];
  batch_count: number;          // Higher = more pervasive interest
}

// ============================================
// STAGE 6: EDGE INSERTION
// ============================================

export interface EdgeInsertionResult {
  internal: number;      // Layer 1 count
  crossReference: number; // Layer 2 count
  enrichment: number;    // Layer 3 count
  skippedDuplicate: number;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request body for POST /api/youtube/extract-batch
 */
export interface ExtractBatchRequest {
  batch: {
    batch_id: string;
    batch_type: 'channel' | 'thematic' | 'temporal';
    label: string;
    entries: {
      video_title: string;
      video_id: string;
      channel_name: string;
      view_count: number;
      first_watched: string;  // ISO string
      last_watched: string;   // ISO string
    }[];
    total_views: number;
    channel_names: string[];
    channel_tags: string[];
    date_range: { start: string; end: string };
  };
  options: {
    extractionMode: ExtractionMode;
    anchorEmphasis: AnchorEmphasis;
    linkedAnchorIds: string[];
  };
}

/**
 * Response from POST /api/youtube/extract-batch
 */
export interface ExtractBatchResponse {
  nodes: WatchHistoryExtractedNode[];
  edges: WatchHistoryExtractedEdge[];
  batch_summary: string;
}

/**
 * Request body for POST /api/youtube/finalize-import
 */
export interface FinalizeImportRequest {
  batchResults: {
    batch_id: string;
    nodes: WatchHistoryExtractedNode[];
    edges: WatchHistoryExtractedEdge[];
    summary: string;
  }[];
  metadata: {
    totalParsed: number;
    dateRange: { earliest: string; latest: string };
    uniqueChannels: number;
    uniqueVideos: number;
    skippedAds: number;
    skippedDeleted: number;
    skippedShorts: number;
  };
  options: {
    extractionMode: ExtractionMode;
    anchorEmphasis: AnchorEmphasis;
    linkedAnchorIds: string[];
    includeShorts: boolean;
    minViewCount: number;
  };
  previousImportTimestamp?: string;  // For delta detection
}

/**
 * Response from POST /api/youtube/finalize-import
 */
export interface FinalizeImportResponse {
  success: boolean;
  sourceId: string;
  nodesCreated: number;
  nodesEnriched: number;
  edges: {
    internal: number;
    crossReference: number;
    enrichment: number;
  };
  batchesProcessed: number;
  batchesFailed: number;
  processingDurationMs: number;
  topEntities: { label: string; batchCount: number }[];
}

/**
 * Request body for POST /api/youtube/channel-tags
 */
export interface ChannelTagsRequest {
  channelIds: string[];
}

/**
 * Response from POST /api/youtube/channel-tags
 */
export interface ChannelTagsResponse {
  channels: Record<string, ChannelTagInfo>;
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * Workflow steps for the WatchHistory importer
 */
export type WatchHistoryStep =
  | 'upload'
  | 'parsing'
  | 'review'
  | 'clustering'
  | 'processing'
  | 'finalizing'
  | 'done'
  | 'error';

/**
 * Progress tracking during batch processing
 */
export interface WatchHistoryProcessingProgress {
  currentBatchIndex: number;
  totalBatches: number;
  currentBatchLabel: string;
  nodesExtracted: number;
  edgesExtracted: number;
  batchesFailed: number;
  startTime: number;
  completedBatches: {
    batch_id: string;
    label: string;
    nodes: number;
    edges: number;
    status: 'completed' | 'failed';
  }[];
}

/**
 * Channel stats for the review screen
 */
export interface ChannelStat {
  channel_id: string;
  channel_name: string;
  video_count: number;
  total_views: number;
}
