import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from '../constants';
import { TableRow } from '../types';

let supabase: SupabaseClient | null = null;
// Local storage override still supported, but usually unnecessary if SERVICE_ROLE_KEY is in constants
let adminKey: string | null = localStorage.getItem('supabase_admin_key');

export const setAdminKey = (key: string | null) => {
  adminKey = key;
  if (key) {
    localStorage.setItem('supabase_admin_key', key);
  } else {
    localStorage.removeItem('supabase_admin_key');
  }
  // Reset client to force recreation with new key
  supabase = null;
};

// Returns the effective admin key (either from local storage or constants)
export const getAdminKey = () => adminKey || SUPABASE_SERVICE_ROLE_KEY || null;

export const getSupabase = () => {
  if (!supabase) {
    // Use ANON key for client-side operations - this respects RLS policies
    // Service role key bypasses RLS and should only be used for admin operations
    const key = adminKey || SUPABASE_ANON_KEY;
    supabase = createClient(SUPABASE_URL, key);
  }
  return supabase;
};

// Reset the Supabase client (call this on sign out to ensure clean state)
export const resetSupabaseClient = () => {
  supabase = null;
};

// Helper to get current authenticated user ID
export const getCurrentUserId = async (): Promise<string | null> => {
  const client = getSupabase();
  const { data: { user } } = await client.auth.getUser();
  return user?.id ?? null;
};

export const fetchTableData = async (
  tableName: string, 
  page = 1, 
  pageSize = 50,
  sortBy: { column: string, ascending: boolean } | null = null
): Promise<{ data: TableRow[] | null; count: number | null; error: any }> => {
  const client = getSupabase();
  
  let query = client
    .from(tableName)
    .select('*', { count: 'exact' });

  if (sortBy) {
    query = query.order(sortBy.column, { ascending: sortBy.ascending });
  }

  // Calculate range
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  const { data, count, error } = await query.range(from, to);
  
  return { data, count, error };
};

export const insertRows = async (tableName: string, rows: TableRow[]): Promise<{ error: any }> => {
  const client = getSupabase();

  // Add user_id to each row for authenticated inserts
  const userId = await getCurrentUserId();
  if (!userId) {
    return { error: new Error('Not authenticated') };
  }

  const rowsWithUserId = rows.map(row => ({ ...row, user_id: userId }));
  const { error } = await client.from(tableName).insert(rowsWithUserId);
  return { error };
};

export const updateEdge = async (edgeId: string, updates: { relation_type?: string, evidence?: string }): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('knowledge_edges')
    .update(updates)
    .eq('id', edgeId);
  return { error };
};

export const deleteRows = async (tableName: string, ids: string[]): Promise<{ error: any }> => {
  const client = getSupabase();
  // Assuming 'id' is the primary key, which is standard for this app
  const { error } = await client.from(tableName).delete().in('id', ids);
  return { error };
};

// NEW: Merge Nodes Functionality
export const mergeNodes = async (keepNodeId: string, discardNodeId: string): Promise<{ error: any }> => {
  const client = getSupabase();
  
  try {
    // 1. Repoint all edges where discardNode is the SOURCE
    const { error: sourceError } = await client
      .from('knowledge_edges')
      .update({ source_node_id: keepNodeId })
      .eq('source_node_id', discardNodeId);
    
    if (sourceError) throw sourceError;

    // 2. Repoint all edges where discardNode is the TARGET
    const { error: targetError } = await client
      .from('knowledge_edges')
      .update({ target_node_id: keepNodeId })
      .eq('target_node_id', discardNodeId);

    if (targetError) throw targetError;

    // 3. Delete the discarded node
    const { error: deleteError } = await client
      .from('knowledge_nodes')
      .delete()
      .eq('id', discardNodeId);

    if (deleteError) throw deleteError;

    return { error: null };
  } catch (error: any) {
    console.error("Merge failed:", error);
    return { error };
  }
};

// NEW: Fetch Anchors (High Priority Nodes)
export const fetchAnchors = async (): Promise<{ label: string; entity_type: string; id: string; description?: string }[]> => {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description')
    .eq('entity_type', 'Anchor');
  
  if (error) {
    console.warn("Failed to fetch anchors", error);
    return [];
  }
  return data || [];
};

// NEW: Create Anchor
export const createAnchor = async (label: string, type: string, description: string): Promise<{ data: any, error: any }> => {
  const client = getSupabase();

  // Add user_id for authenticated insert
  const userId = await getCurrentUserId();
  if (!userId) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const enhancedDescription = `[Type: ${type}] ${description}`;

  const { data, error } = await client.from('knowledge_nodes').insert({
    label,
    entity_type: 'Anchor',
    description: enhancedDescription,
    confidence: 1.0,
    source: 'User Manual Entry',
    source_type: 'Manual',
    user_id: userId,
  }).select().single();

  return { data, error };
};

export const fetchExistingNodes = async (): Promise<{ label: string; entity_type: string; id: string; description?: string }[]> => {
  const client = getSupabase();
  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description')
    .neq('entity_type', 'Anchor') 
    .order('created_at', { ascending: false })
    .limit(100); 
  
  if (error) {
    console.error("Failed to fetch existing nodes", error);
    return [];
  }
  return data || [];
};

// UPDATED: Robust Graph RAG Retrieval
// Searches label, description, and entity_type to ensure high recall
export const fetchRelevantNodes = async (keywords: string[]): Promise<{ label: string; entity_type: string; id: string; description?: string }[]> => {
  const client = getSupabase();
  if (!keywords || keywords.length === 0) return [];

  // Build a complex OR query for Supabase
  // We want to find nodes where the label OR description OR entity_type matches the keyword
  const conditions: string[] = [];
  
  keywords.forEach(k => {
      // Sanitize input slightly to prevent query injection issues, though Supabase handles parameterization
      const cleanKey = k.replace(/[^\w\s]/gi, ''); 
      if(cleanKey.length > 2) {
          conditions.push(`label.ilike.%${cleanKey}%`);
          conditions.push(`description.ilike.%${cleanKey}%`);
          conditions.push(`entity_type.ilike.%${cleanKey}%`);
      }
  });

  if (conditions.length === 0) return [];

  const query = conditions.join(',');

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description')
    .or(query)
    .limit(30); // Return top 30 matches (including Anchors)
  
  if (error) {
    console.warn("Smart context search failed, falling back to recent.", error);
    return [];
  }
  return data || [];
};

// NEW: Graph Traversal for "Trace Connections"
// Fetches the edges connected to a specific node to build a local subgraph context
export const fetchNodeNeighbors = async (nodeId: string): Promise<{ edges: any[], nodes: any[] }> => {
  const client = getSupabase();
  
  // 1. Fetch Edges where node is source or target
  const { data: edges, error: edgeError } = await client
    .from('knowledge_edges')
    .select('source_node_id, target_node_id, relation_type, evidence')
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);

  if (edgeError || !edges) return { edges: [], nodes: [] };

  // 2. Identify neighbor IDs
  const neighborIds = new Set<string>();
  neighborIds.add(nodeId); // Include central node
  edges.forEach(e => {
    neighborIds.add(e.source_node_id);
    neighborIds.add(e.target_node_id);
  });

  // 3. Fetch Node Details for context
  const { data: nodes, error: nodeError } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description')
    .in('id', Array.from(neighborIds));

  if (nodeError) return { edges: [], nodes: [] };

  return { edges, nodes: nodes || [] };
};

export const discoverTables = async (): Promise<string[]> => {
  try {
    const key = adminKey || SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${key}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json', 
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (data.definitions) {
      return Object.keys(data.definitions);
    }
    return [];
  } catch (error) {
    console.warn("Table discovery failed:", error);
    return [];
  }
};

// --- RAW SOURCE MANAGEMENT ---

export const saveKnowledgeSource = async (title: string, content: string, type: string, url?: string, metadata: object = {}) => {
  const client = getSupabase();

  // Add user_id for authenticated insert
  const userId = await getCurrentUserId();
  if (!userId) {
    return { id: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await client.from('knowledge_sources').insert({
    title,
    content,
    source_type: type,
    source_url: url,
    metadata: metadata,
    user_id: userId,
  }).select('id').single();

  return { id: data?.id, error };
};

export const updateKnowledgeSource = async (id: string, updates: { title?: string, metadata?: object }) => {
  const client = getSupabase();
  const { error } = await client.from('knowledge_sources').update(updates).eq('id', id);
  return { error };
};

export const fetchAllSources = async (): Promise<{ id: string, title: string, source_type: string, source_url?: string, metadata?: any, created_at: string }[]> => {
  const client = getSupabase();
  const { data, error } = await client
    .from('knowledge_sources')
    .select('id, title, source_type, source_url, metadata, created_at')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.warn("Failed to fetch sources log", error);
    return [];
  }
  return data || [];
};

export const searchKnowledgeSources = async (query: string): Promise<{ id: string, title: string, content: string, source_type: string }[]> => {
  const client = getSupabase();
  if (!query) return [];

  // Use Supabase textSearch if available, or simple ilike if not configured yet
  // We try textSearch first assuming the SQL update ran
  const { data, error } = await client
    .from('knowledge_sources')
    .select('id, title, content, source_type')
    .textSearch('fts', query)
    .limit(5);

  if (error) {
    console.warn("Full text search failed (fts col might be missing), falling back to ilike", error);
    // Fallback
    const { data: fallbackData } = await client
      .from('knowledge_sources')
      .select('id, title, content, source_type')
      .ilike('content', `%${query}%`)
      .limit(5);
      
    return fallbackData || [];
  }
  
  return data || [];
};

// Fetch nodes that are missing embeddings (for backfill)
export const fetchNodesWithoutEmbeddings = async (limit: number = 50): Promise<{ id: string; label: string; description: string }[]> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id, label, description')
    .is('embedding', null)
    .limit(limit);

  if (error) {
    console.error("Failed to fetch nodes without embeddings:", error);
    return [];
  }

  return data || [];
};

// Update a node's embedding
export const updateNodeEmbedding = async (nodeId: string, embedding: number[]): Promise<boolean> => {
  const client = getSupabase();

  const { error } = await client
    .from('knowledge_nodes')
    .update({ embedding })
    .eq('id', nodeId);

  if (error) {
    console.error(`Failed to update embedding for node ${nodeId}:`, error);
    return false;
  }

  return true;
};

// Get count of nodes missing embeddings
export const countNodesWithoutEmbeddings = async (): Promise<number> => {
  const client = getSupabase();

  const { count, error } = await client
    .from('knowledge_nodes')
    .select('*', { count: 'exact', head: true })
    .is('embedding', null);

  if (error) {
    console.error("Failed to count nodes without embeddings:", error);
    return 0;
  }

  return count || 0;
};

export const semanticSearchNodes = async (embedding: number[], matchThreshold: number, matchCount: number): Promise<any[]> => {
  const client = getSupabase();

  if (!embedding || embedding.length === 0) {
    console.warn("semanticSearchNodes called with empty embedding");
    return [];
  }

  // Assumes a 'match_nodes' RPC function exists in Supabase.
  const { data, error } = await client.rpc('match_nodes', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Semantic search failed. Error details:", error.message, error.code);
    console.error("Ensure 'match_nodes' RPC function exists in Supabase with pgvector extension enabled.");
    return [];
  }

  console.log(`Semantic search returned ${data?.length || 0} results (threshold: ${matchThreshold})`);
  return data || [];
};