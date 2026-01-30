import { getSupabase, getCurrentUserId } from './supabase';
import { AnchorNode, AnchorStats, AnchorConnectionInfo } from '../types';

/**
 * Anchor Service - Manages anchor nodes for the knowledge graph
 * Anchors are focal points that represent ongoing areas of focus
 */

/**
 * Get all anchor nodes for the current user
 * Ordered by anchor_strength (highest first), then by anchor_created_at (newest first)
 */
export const getAnchors = async (): Promise<AnchorNode[]> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('*')
    .eq('is_anchor', true)
    .order('anchor_strength', { ascending: false, nullsFirst: false })
    .order('anchor_created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch anchors:', error);
    return [];
  }

  return (data || []) as AnchorNode[];
};

/**
 * Promote a node to anchor status
 */
export const promoteToAnchor = async (nodeId: string, strength?: number): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('knowledge_nodes')
    .update({
      is_anchor: true,
      anchor_strength: strength || null,
      anchor_created_at: new Date().toISOString()
    })
    .eq('id', nodeId);

  if (error) {
    console.error('Failed to promote node to anchor:', error);
  }

  return { error };
};

/**
 * Demote an anchor back to regular node
 */
export const demoteFromAnchor = async (nodeId: string): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('knowledge_nodes')
    .update({
      is_anchor: false,
      anchor_strength: null,
      anchor_created_at: null
    })
    .eq('id', nodeId);

  if (error) {
    console.error('Failed to demote anchor:', error);
  }

  return { error };
};

/**
 * Update anchor strength/priority
 */
export const updateAnchorStrength = async (nodeId: string, strength: number | null): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('knowledge_nodes')
    .update({ anchor_strength: strength })
    .eq('id', nodeId)
    .eq('is_anchor', true);

  if (error) {
    console.error('Failed to update anchor strength:', error);
  }

  return { error };
};

/**
 * Check if a node is an anchor
 */
export const isAnchor = async (nodeId: string): Promise<boolean> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('is_anchor')
    .eq('id', nodeId)
    .single();

  if (error) {
    console.error('Failed to check anchor status:', error);
    return false;
  }

  return data?.is_anchor || false;
};

/**
 * Create a new node and immediately set it as an anchor
 */
export const createAnchor = async (
  label: string,
  entityType: string,
  description?: string,
  strength?: number
): Promise<{ data: AnchorNode | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await client
    .from('knowledge_nodes')
    .insert({
      label,
      entity_type: entityType,
      description: description || null,
      is_anchor: true,
      anchor_strength: strength || null,
      anchor_created_at: new Date().toISOString(),
      confidence: 1.0,
      source: 'User Manual Entry',
      source_type: 'Manual',
      user_id: userId
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create anchor:', error);
  }

  return { data: data as AnchorNode | null, error };
};

/**
 * Get anchor statistics
 */
export const getAnchorStats = async (): Promise<AnchorStats> => {
  const anchors = await getAnchors();

  if (anchors.length === 0) {
    return {
      total_anchors: 0,
      anchors_by_type: {},
      average_strength: 0,
      oldest_anchor: null,
      newest_anchor: null
    };
  }

  // Count by entity type
  const anchorsByType = anchors.reduce((acc, anchor) => {
    const type = (anchor as any).entity_type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate average strength (only for anchors with strength set)
  const anchorsWithStrength = anchors.filter(a => a.anchor_strength != null);
  const averageStrength = anchorsWithStrength.length > 0
    ? anchorsWithStrength.reduce((sum, a) => sum + (a.anchor_strength || 0), 0) / anchorsWithStrength.length
    : 0;

  // Find oldest and newest (sorted by anchor_created_at)
  const sorted = [...anchors].sort((a, b) =>
    new Date(a.anchor_created_at).getTime() - new Date(b.anchor_created_at).getTime()
  );

  return {
    total_anchors: anchors.length,
    anchors_by_type: anchorsByType,
    average_strength: Math.round(averageStrength * 10) / 10,
    oldest_anchor: sorted[0] || null,
    newest_anchor: sorted[sorted.length - 1] || null
  };
};

/**
 * Get connection information for each anchor
 */
export const getAnchorConnectionInfo = async (): Promise<AnchorConnectionInfo[]> => {
  const client = getSupabase();
  const anchors = await getAnchors();
  const connectionInfo: AnchorConnectionInfo[] = [];

  for (const anchor of anchors) {
    // Get edges where anchor is source or target
    const { data: edges, error } = await client
      .from('knowledge_edges')
      .select('source_node_id, target_node_id')
      .or(`source_node_id.eq.${anchor.id},target_node_id.eq.${anchor.id}`);

    if (error) {
      console.error(`Error fetching connections for anchor ${anchor.id}:`, error);
      continue;
    }

    // Count unique connected nodes
    const connectedNodeIds = new Set<string>();
    edges?.forEach(edge => {
      if (edge.source_node_id !== anchor.id) connectedNodeIds.add(edge.source_node_id);
      if (edge.target_node_id !== anchor.id) connectedNodeIds.add(edge.target_node_id);
    });

    connectionInfo.push({
      anchor_id: anchor.id,
      anchor_label: anchor.label,
      entity_type: (anchor as any).entity_type || 'Unknown',
      connection_count: connectedNodeIds.size,
      direct_connections: connectedNodeIds.size
    });
  }

  return connectionInfo.sort((a, b) => b.connection_count - a.connection_count);
};

/**
 * Create an anchor from a source (used when "Convert to Anchor" is enabled)
 * This creates a new anchor node linked to the source
 */
export const createAnchorFromSource = async (
  anchorName: string,
  entityType: string,
  sourceId: string,
  sourceTitle: string,
  description?: string,
  strength?: number
): Promise<{ data: AnchorNode | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const anchorDescription = description || `Anchor created from source: ${sourceTitle}`;

  const { data, error } = await client
    .from('knowledge_nodes')
    .insert({
      label: anchorName,
      entity_type: entityType,
      description: anchorDescription,
      is_anchor: true,
      anchor_strength: strength || 3, // Default medium priority
      anchor_created_at: new Date().toISOString(),
      confidence: 1.0,
      source: sourceTitle,
      source_type: 'Source Conversion',
      source_id: sourceId,
      user_id: userId
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create anchor from source:', error);
    return { data: null, error };
  }

  return { data: data as AnchorNode, error: null };
};
