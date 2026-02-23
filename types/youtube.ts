// YouTube Channel Auto-Ingestion Types
// PRD: YouTube Channel Auto-Ingestion Pipeline

import { ExtractionMode, AnchorEmphasis } from './extraction';

// ============================================
// DATABASE ROW TYPES
// ============================================

/**
 * YouTube channel subscription (database row)
 */
export interface YouTubeChannel {
  id: string;
  user_id: string;
  channel_id: string;           // YouTube channel ID (UCxxxx format)
  channel_name: string;
  channel_url: string;
  thumbnail_url: string | null;
  description: string | null;
  subscriber_count: number | null;
  // Extraction settings
  auto_ingest: boolean;
  extraction_mode: ExtractionMode;
  anchor_emphasis: AnchorEmphasis;
  linked_anchor_ids: string[];   // UUID array
  custom_instructions: string | null;
  // Duration filter settings
  min_video_duration: number | null;  // Minimum video duration in seconds (default 90 = 1.5 min)
  max_video_duration: number | null;  // Maximum video duration in seconds (null = unlimited)
  // Tracking
  last_checked_at: string | null;
  last_polled_at: string | null;  // Alias for last_checked_at in DB
  last_video_published_at: string | null;
  total_videos_ingested: number;
  is_active: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Queue item status
 */
export type YouTubeQueueStatus =
  | 'pending'
  | 'fetching_transcript'
  | 'extracting'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Video ingestion queue item (database row)
 */
export interface YouTubeQueueItem {
  id: string;
  user_id: string;
  channel_id: string;            // References youtube_channels.id
  playlist_source_id: string | null; // References youtube_playlists.id
  video_id: string;              // YouTube video ID
  video_title: string | null;
  video_url: string;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  // Processing state
  status: YouTubeQueueStatus;
  priority: number;              // 1-10, lower is higher priority
  // Results
  transcript: string | null;
  transcript_language: string | null;
  transcript_fetched_at: string | null;
  source_id: string | null;      // References knowledge_sources.id
  nodes_created: number;
  edges_created: number;
  // Error tracking
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  // Timestamps
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * User's YouTube settings (database row)
 */
export interface YouTubeSettings {
  id: string;
  user_id: string;
  apify_api_key: string | null;
  youtube_api_key: string | null;  // YouTube Data API v3 key for duration filtering
  // Global defaults
  default_auto_ingest: boolean;
  default_extraction_mode: ExtractionMode;
  default_anchor_emphasis: AnchorEmphasis;
  max_concurrent_extractions: number;
  max_videos_per_channel: number;
  // Rate limiting
  daily_video_limit: number;
  videos_ingested_today: number;
  daily_limit_reset_at: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
  // API-added fields (not in DB)
  has_apify_key?: boolean;
  apify_api_key_preview?: string | null;
  has_youtube_api_key?: boolean;
  youtube_api_key_preview?: string | null;
}

// ============================================
// INPUT TYPES
// ============================================

/**
 * Form data for adding a new channel
 */
export interface AddChannelFormData {
  channel_url: string;
  auto_ingest?: boolean;
  extraction_mode?: ExtractionMode;
  anchor_emphasis?: AnchorEmphasis;
  linked_anchor_ids?: string[];
  custom_instructions?: string;
  backfill_count?: number;       // How many recent videos to backfill
  min_video_duration?: number;   // Minimum duration in seconds (default 90)
  max_video_duration?: number | null;  // Maximum duration in seconds (null = unlimited)
}

/**
 * Form data for updating a channel
 */
export interface UpdateChannelFormData {
  auto_ingest?: boolean;
  extraction_mode?: ExtractionMode;
  anchor_emphasis?: AnchorEmphasis;
  linked_anchor_ids?: string[];
  custom_instructions?: string;
  is_active?: boolean;
  min_video_duration?: number;
  max_video_duration?: number | null;
}

/**
 * Form data for updating YouTube settings
 */
export interface UpdateSettingsFormData {
  apify_api_key?: string;
  youtube_api_key?: string;  // YouTube Data API v3 key for duration filtering
  default_auto_ingest?: boolean;
  default_extraction_mode?: ExtractionMode;
  default_anchor_emphasis?: AnchorEmphasis;
  max_concurrent_extractions?: number;
  max_videos_per_channel?: number;
  daily_video_limit?: number;
}

/**
 * Form data for manually adding a video to queue
 */
export interface AddVideoFormData {
  video_url: string;
  channel_id?: string;           // Optional: associate with channel
  priority?: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Resolved channel info from URL
 */
export interface ResolvedChannelInfo {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  thumbnail_url: string | null;
  description: string | null;
  subscriber_count: number | null;
}

/**
 * Video info from RSS feed
 */
export interface YouTubeVideoInfo {
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string;
  published_at: string;
  duration_seconds: number | null;
  description: string | null;
}

/**
 * Transcript extraction result
 */
export interface TranscriptResult {
  success: boolean;
  transcript: string | null;
  language: string | null;
  is_auto_generated: boolean;
  error?: string;
}

/**
 * Queue processing result
 */
export interface ProcessingResult {
  queue_item_id: string;
  status: 'completed' | 'failed' | 'skipped';
  source_id?: string;
  nodes_created: number;
  edges_created: number;
  error?: string;
}

// ============================================
// UI COMPONENT PROPS
// ============================================

/**
 * Filter options for queue list
 */
export interface QueueFilters {
  status?: YouTubeQueueStatus | YouTubeQueueStatus[];
  channel_id?: string;
  since?: string;               // ISO date string
  limit?: number;
}

/**
 * Stats for YouTube manager dashboard
 */
export interface YouTubeStats {
  total_channels: number;
  active_channels: number;
  pending_videos: number;
  processing_videos: number;
  completed_today: number;
  failed_today: number;
  daily_limit: number;
  videos_today: number;
}

/**
 * Queue item with expanded channel info
 */
export interface QueueItemWithChannel extends YouTubeQueueItem {
  channel: Pick<YouTubeChannel, 'channel_name' | 'thumbnail_url'>;
}

// ============================================
// DEFAULT VALUES
// ============================================

/**
 * Default YouTube settings for new users
 */
export const DEFAULT_YOUTUBE_SETTINGS: Omit<YouTubeSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  apify_api_key: null,
  youtube_api_key: null,
  default_auto_ingest: true,
  default_extraction_mode: 'comprehensive',
  default_anchor_emphasis: 'standard',
  max_concurrent_extractions: 3,
  max_videos_per_channel: 50,
  daily_video_limit: 20,
  videos_ingested_today: 0,
  daily_limit_reset_at: null,
};

/**
 * Default channel settings
 */
export const DEFAULT_CHANNEL_SETTINGS: Pick<YouTubeChannel, 'auto_ingest' | 'extraction_mode' | 'anchor_emphasis' | 'linked_anchor_ids' | 'custom_instructions' | 'min_video_duration' | 'max_video_duration'> = {
  auto_ingest: true,
  extraction_mode: 'comprehensive',
  anchor_emphasis: 'standard',
  linked_anchor_ids: [],
  custom_instructions: null,
  min_video_duration: 90,  // 1.5 minutes (skip Shorts)
  max_video_duration: null,  // Unlimited
};

/**
 * Queue priority levels
 */
export const QUEUE_PRIORITY = {
  HIGHEST: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 7,
  LOWEST: 10,
} as const;

// ============================================
// PLAYLIST TYPES
// ============================================

export type PlaylistConnectionStatus = 'pending' | 'verified' | 'error' | 'disconnected';

export interface YouTubePlaylist {
  id: string;
  user_id: string;
  playlist_id: string;
  playlist_url: string;
  playlist_name: string | null;
  synapse_code: string;
  thumbnail_url: string | null;
  auto_process: boolean;
  extraction_mode: ExtractionMode;
  anchor_emphasis: AnchorEmphasis;
  linked_anchor_ids: string[];
  custom_instructions: string | null;
  last_polled_at: string | null;
  last_new_video_at: string | null;
  known_video_count: number;
  total_videos_ingested: number;
  is_active: boolean;
  connection_status: PlaylistConnectionStatus;
  connection_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddPlaylistFormData {
  playlist_url: string;
  auto_process?: boolean;
  extraction_mode?: ExtractionMode;
  anchor_emphasis?: AnchorEmphasis;
  linked_anchor_ids?: string[];
  custom_instructions?: string;
}

export interface UpdatePlaylistFormData {
  auto_process?: boolean;
  extraction_mode?: ExtractionMode;
  anchor_emphasis?: AnchorEmphasis;
  linked_anchor_ids?: string[];
  custom_instructions?: string;
  is_active?: boolean;
}

export interface TieredTranscriptResult {
  success: boolean;
  transcript: string | null;
  language: string | null;
  method: 'caption_extractor' | 'innertube' | 'apify' | 'manual';
  is_auto_generated: boolean;
  error?: string;
  duration_ms: number;
}
