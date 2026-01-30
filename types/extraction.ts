// Extraction Guidance & Mode System Types
// PRD 3: Provides fine-grained control over AI extraction behavior

import { GraphNode, GraphLink } from '../types';

/**
 * Four extraction modes optimized for different use cases
 */
export type ExtractionMode = 'comprehensive' | 'strategic' | 'actionable' | 'relational';

/**
 * Controls how strongly AI prioritizes anchor connections
 */
export type AnchorEmphasis = 'standard' | 'aggressive' | 'passive';

/**
 * Configuration for each extraction mode
 */
export interface ExtractionModeConfig {
  id: ExtractionMode;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  promptAddition: string; // What to add to system prompt
  entityFocus: string; // What types of entities to prioritize
  relationshipFocus: string; // What types of relationships to emphasize
  useCases: string[]; // When to use this mode
}

/**
 * User's persisted extraction settings (database row)
 */
export interface ExtractionSettings {
  id: string;
  user_id: string;
  default_mode: ExtractionMode;
  default_anchor_emphasis: AnchorEmphasis;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Configuration passed to extraction functions for a single session
 */
export interface ExtractionSessionConfig {
  mode: ExtractionMode;
  anchorEmphasis: AnchorEmphasis;
  userGuidance?: string;
  selectedAnchorIds?: string[]; // Temporary anchors for this source only
  convertSourceToAnchor?: boolean; // Whether to create anchor from source
  sourceAnchorName?: string; // Name for the source anchor if converting
  sourceAnchorType?: string; // Entity type for source anchor
}

/**
 * Tracked extraction session (database row)
 */
export interface ExtractionSession {
  id: string;
  user_id: string;
  source_name?: string;
  source_type?: string;
  source_content_preview?: string;
  extraction_mode: ExtractionMode;
  anchor_emphasis: AnchorEmphasis;
  user_guidance?: string;
  selected_anchor_ids?: string[];
  extracted_node_ids?: string[];
  extracted_edge_ids?: string[];
  entity_count: number;
  relationship_count: number;
  extraction_duration_ms?: number;
  created_at: string;
  feedback_rating?: number;
  feedback_text?: string;
}

/**
 * Result returned from extraction operations
 */
export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphLink[];
  sessionId: string;
  summary: {
    entityCount: number;
    relationshipCount: number;
    durationMs: number;
  };
}

/**
 * Default extraction settings when user hasn't configured anything
 */
export const DEFAULT_EXTRACTION_SETTINGS: Omit<ExtractionSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  default_mode: 'comprehensive',
  default_anchor_emphasis: 'standard',
  settings: {}
};
