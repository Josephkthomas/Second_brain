// Source Explorer data fetching service
// Provides data for SourcesSidebar and SourceDetailPanel

import { getSupabase, getCurrentUserId, fetchAllRows } from './supabase';

export interface SourceWithStats {
  id: string;
  title: string;
  source_type: string;
  source_url?: string;
  metadata?: any;
  created_at: string;
  node_count: number;
  edge_count: number;
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
 * Fetch all knowledge_sources with node and edge counts per source.
 * Three queries: sources + nodes (with IDs) + edges, merged client-side.
 */
export const fetchSourcesWithStats = async (): Promise<SourceWithStats[]> => {
  const client = getSupabase();

  // Paginate through all rows to avoid Supabase's 1000-row cap
  const [sourcesRes, nodesRes, edgesRes] = await Promise.all([
    fetchAllRows('knowledge_sources', 'id, title, source_type, source_url, metadata, created_at'),
    fetchAllRows('knowledge_nodes', 'id, source_id'),
    fetchAllRows('knowledge_edges', 'source_node_id, target_node_id'),
  ]);

  if (sourcesRes.error || !sourcesRes.data) {
    console.warn('Failed to fetch sources:', sourcesRes.error);
    return [];
  }

  const sources = sourcesRes.data;
  const nodes = nodesRes.data || [];
  const edges = edgesRes.data || [];

  // Build node count map and node→source lookup
  const nodeCountMap = new Map<string, number>();
  const nodeSourceMap = new Map<string, string>();
  for (const n of nodes) {
    if (n.source_id) {
      nodeCountMap.set(n.source_id, (nodeCountMap.get(n.source_id) || 0) + 1);
      nodeSourceMap.set(n.id, n.source_id);
    }
  }

  // Count edges where AT LEAST ONE endpoint belongs to the source
  const edgeCountMap = new Map<string, number>();
  for (const e of edges) {
    const srcSource = nodeSourceMap.get(e.source_node_id);
    const tgtSource = nodeSourceMap.get(e.target_node_id);
    // Attribute edge to each source that has an endpoint in it (deduplicate below)
    const attributed = new Set<string>();
    if (srcSource) attributed.add(srcSource);
    if (tgtSource) attributed.add(tgtSource);
    for (const sid of attributed) {
      edgeCountMap.set(sid, (edgeCountMap.get(sid) || 0) + 1);
    }
  }

  return sources.map(s => ({
    ...s,
    node_count: nodeCountMap.get(s.id) || 0,
    edge_count: edgeCountMap.get(s.id) || 0,
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
 * Fetch edges where AT LEAST ONE endpoint belongs to nodes from a given source.
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

  // Fetch edges where at least one endpoint is in this source's nodes
  const { data: edges, error: edgeErr } = await client
    .from('knowledge_edges')
    .select('id, source_node_id, target_node_id, relation_type, evidence')
    .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`);

  if (edgeErr || !edges) return [];

  // For labels of nodes not in this source, fetch them
  const missingIds = new Set<string>();
  for (const e of edges) {
    if (!labelMap.has(e.source_node_id)) missingIds.add(e.source_node_id);
    if (!labelMap.has(e.target_node_id)) missingIds.add(e.target_node_id);
  }

  if (missingIds.size > 0) {
    const { data: extraNodes } = await client
      .from('knowledge_nodes')
      .select('id, label')
      .in('id', Array.from(missingIds));
    if (extraNodes) {
      extraNodes.forEach(n => labelMap.set(n.id, n.label));
    }
  }

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
