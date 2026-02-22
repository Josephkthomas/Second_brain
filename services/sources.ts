// Source Explorer data fetching service
// Provides data for SourcesSidebar and SourceDetailPanel

import { getSupabase, getCurrentUserId } from './supabase';

export interface SourceWithStats {
  id: string;
  title: string;
  source_type: string;
  source_url?: string;
  metadata?: any;
  created_at: string;
  node_count: number;
}

export interface SourceNode {
  id: string;
  label: string;
  entity_type: string;
  description?: string;
  confidence?: number;
  source_id?: string;
}

export interface SourceEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  evidence?: string;
  source_label?: string;
  target_label?: string;
}

/**
 * Fetch all knowledge_sources with a node count per source.
 * Two queries: sources list + grouped node counts, merged client-side.
 */
export const fetchSourcesWithStats = async (): Promise<SourceWithStats[]> => {
  const client = getSupabase();

  const { data: sources, error: srcErr } = await client
    .from('knowledge_sources')
    .select('id, title, source_type, source_url, metadata, created_at')
    .order('created_at', { ascending: false });

  if (srcErr || !sources) {
    console.warn('Failed to fetch sources:', srcErr);
    return [];
  }

  // Get node counts grouped by source_id
  const { data: nodes, error: nodeErr } = await client
    .from('knowledge_nodes')
    .select('source_id');

  if (nodeErr || !nodes) {
    // Return sources with 0 counts if node query fails
    return sources.map(s => ({ ...s, node_count: 0 }));
  }

  const countMap = new Map<string, number>();
  for (const n of nodes) {
    if (n.source_id) {
      countMap.set(n.source_id, (countMap.get(n.source_id) || 0) + 1);
    }
  }

  return sources.map(s => ({
    ...s,
    node_count: countMap.get(s.id) || 0,
  }));
};

/**
 * Fetch full node objects for a given source_id.
 */
export const fetchNodesBySourceId = async (sourceId: string): Promise<SourceNode[]> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description, confidence, source_id')
    .eq('source_id', sourceId)
    .order('entity_type', { ascending: true });

  if (error) {
    console.warn('Failed to fetch nodes for source:', error);
    return [];
  }
  return data || [];
};

/**
 * Fetch edges where BOTH endpoints belong to nodes from a given source.
 * Includes source/target labels for display.
 */
export const fetchEdgesBySourceId = async (sourceId: string): Promise<SourceEdge[]> => {
  const client = getSupabase();

  // First get node IDs for this source
  const { data: nodeRows, error: nodeErr } = await client
    .from('knowledge_nodes')
    .select('id, label')
    .eq('source_id', sourceId);

  if (nodeErr || !nodeRows || nodeRows.length === 0) return [];

  const nodeIds = nodeRows.map(n => n.id);
  const labelMap = new Map(nodeRows.map(n => [n.id, n.label]));

  // Fetch edges where both source and target are in this source's nodes
  const { data: edges, error: edgeErr } = await client
    .from('knowledge_edges')
    .select('id, source_node_id, target_node_id, relation_type, evidence')
    .in('source_node_id', nodeIds)
    .in('target_node_id', nodeIds);

  if (edgeErr || !edges) return [];

  return edges.map(e => ({
    ...e,
    source_label: labelMap.get(e.source_node_id) || '?',
    target_label: labelMap.get(e.target_node_id) || '?',
  }));
};

/**
 * Lightweight: just node IDs for a source (used by GraphView highlighting).
 */
export const fetchNodeIdsBySourceId = async (sourceId: string): Promise<string[]> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id')
    .eq('source_id', sourceId);

  if (error || !data) return [];
  return data.map(n => n.id);
};
