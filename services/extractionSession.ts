// Extraction Session Service
// PRD 3: Track and manage extraction sessions for analytics and re-extraction

import { getSupabase, getCurrentUserId } from './supabase';
import type { ExtractionSession, ExtractionSessionConfig } from '../types/extraction';

/**
 * Create a new extraction session
 * Called at the start of extraction to track settings used
 */
export const createExtractionSession = async (
  config: ExtractionSessionConfig,
  sourceName?: string,
  sourceType?: string,
  sourceContentPreview?: string
): Promise<{ id: string | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { id: null, error: new Error('Not authenticated') };
  }

  // Truncate content preview to first 500 chars
  const preview = sourceContentPreview
    ? sourceContentPreview.slice(0, 500)
    : undefined;

  const { data, error } = await client
    .from('extraction_sessions')
    .insert({
      user_id: userId,
      source_name: sourceName || null,
      source_type: sourceType || null,
      source_content_preview: preview || null,
      extraction_mode: config.mode,
      anchor_emphasis: config.anchorEmphasis,
      user_guidance: config.userGuidance || null,
      selected_anchor_ids: config.selectedAnchorIds || [],
      extracted_node_ids: [],
      extracted_edge_ids: [],
      entity_count: 0,
      relationship_count: 0
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create extraction session:', error);
    return { id: null, error };
  }

  return { id: data.id, error: null };
};

/**
 * Update session with extraction results
 * Called after extraction completes
 */
export const updateExtractionSessionResults = async (
  sessionId: string,
  nodeIds: string[],
  edgeIds: string[],
  durationMs: number
): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('extraction_sessions')
    .update({
      extracted_node_ids: nodeIds,
      extracted_edge_ids: edgeIds,
      entity_count: nodeIds.length,
      relationship_count: edgeIds.length,
      extraction_duration_ms: durationMs
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to update extraction session:', error);
  }

  return { error };
};

/**
 * Get user's recent extraction sessions
 */
export const getRecentExtractionSessions = async (limit: number = 10): Promise<ExtractionSession[]> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    console.warn('No authenticated user for extraction sessions');
    return [];
  }

  const { data, error } = await client
    .from('extraction_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch extraction sessions:', error);
    return [];
  }

  return data as ExtractionSession[];
};

/**
 * Get specific session by ID
 */
export const getExtractionSession = async (sessionId: string): Promise<ExtractionSession | null> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('extraction_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Failed to fetch extraction session:', error);
    return null;
  }

  return data as ExtractionSession;
};

/**
 * Add user feedback to session
 * For future quality improvement features
 */
export const addSessionFeedback = async (
  sessionId: string,
  rating: number,
  feedbackText?: string
): Promise<{ error: any }> => {
  const client = getSupabase();

  // Validate rating is 1-5
  const validRating = Math.max(1, Math.min(5, Math.round(rating)));

  const { error } = await client
    .from('extraction_sessions')
    .update({
      feedback_rating: validRating,
      feedback_text: feedbackText || null
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to add session feedback:', error);
  }

  return { error };
};

/**
 * Delete old sessions beyond the retention limit
 * Keeps last N sessions per user
 */
export const cleanupOldSessions = async (keepCount: number = 30): Promise<{ deleted: number; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { deleted: 0, error: new Error('Not authenticated') };
  }

  // Get IDs of sessions to keep (most recent N)
  const { data: keepSessions, error: fetchError } = await client
    .from('extraction_sessions')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(keepCount);

  if (fetchError) {
    return { deleted: 0, error: fetchError };
  }

  const keepIds = keepSessions?.map(s => s.id) || [];

  if (keepIds.length === 0) {
    return { deleted: 0, error: null };
  }

  // Delete sessions not in the keep list
  const { data: deleted, error: deleteError } = await client
    .from('extraction_sessions')
    .delete()
    .eq('user_id', userId)
    .not('id', 'in', `(${keepIds.join(',')})`)
    .select('id');

  if (deleteError) {
    return { deleted: 0, error: deleteError };
  }

  return { deleted: deleted?.length || 0, error: null };
};

/**
 * Get extraction session statistics for the user
 */
export const getSessionStats = async (): Promise<{
  totalSessions: number;
  totalEntities: number;
  totalRelationships: number;
  averageDuration: number;
  modeDistribution: Record<string, number>;
}> => {
  const sessions = await getRecentExtractionSessions(100);

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalEntities: 0,
      totalRelationships: 0,
      averageDuration: 0,
      modeDistribution: {}
    };
  }

  const totalEntities = sessions.reduce((sum, s) => sum + (s.entity_count || 0), 0);
  const totalRelationships = sessions.reduce((sum, s) => sum + (s.relationship_count || 0), 0);

  const sessionsWithDuration = sessions.filter(s => s.extraction_duration_ms);
  const averageDuration = sessionsWithDuration.length > 0
    ? sessionsWithDuration.reduce((sum, s) => sum + (s.extraction_duration_ms || 0), 0) / sessionsWithDuration.length
    : 0;

  const modeDistribution = sessions.reduce((acc, s) => {
    const mode = s.extraction_mode || 'unknown';
    acc[mode] = (acc[mode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalSessions: sessions.length,
    totalEntities,
    totalRelationships,
    averageDuration: Math.round(averageDuration),
    modeDistribution
  };
};
