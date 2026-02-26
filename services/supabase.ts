import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from '../constants';
import { TableRow } from '../types';
import type {
  YouTubeChannel,
  YouTubeQueueItem,
  YouTubeSettings,
  YouTubeQueueStatus,
  AddChannelFormData,
  UpdateChannelFormData,
  UpdateSettingsFormData,
  QueueFilters,
  YouTubeStats,
} from '../types/youtube';

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

// Fetch ALL rows from a table, paginating through Supabase's 1000-row limit.
// Use this whenever you need the complete dataset (graph nodes, edges, source stats).
export const fetchAllRows = async (
  tableName: string,
  columns = '*',
  filters?: { column: string; op: string; value: any }[]
): Promise<{ data: TableRow[]; error: any }> => {
  const client = getSupabase();
  const PAGE_SIZE = 1000;
  const allRows: TableRow[] = [];
  let from = 0;

  while (true) {
    let query = client
      .from(tableName)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (filters) {
      for (const f of filters) {
        if (f.op === 'eq') query = query.eq(f.column, f.value);
        else if (f.op === 'neq') query = query.neq(f.column, f.value);
        else if (f.op === 'not.is') query = query.not(f.column, 'is', f.value);
      }
    }

    const { data, error } = await query;

    if (error) return { data: allRows, error };
    if (!data || data.length === 0) break;

    allRows.push(...data);

    // If we got fewer than PAGE_SIZE, we've reached the end
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return { data: allRows, error: null };
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
// Updated to use is_anchor field instead of entity_type
export const fetchAnchors = async (): Promise<{ label: string; entity_type: string; id: string; description?: string; is_anchor?: boolean; anchor_strength?: number; anchor_created_at?: string }[]> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description, is_anchor, anchor_strength, anchor_created_at')
    .eq('is_anchor', true)
    .order('anchor_strength', { ascending: false, nullsFirst: false })
    .order('anchor_created_at', { ascending: false });

  if (error) {
    console.warn("Failed to fetch anchors", error);
    return [];
  }
  return data || [];
};

// NEW: Create Anchor
// Updated to use is_anchor field and preserve actual entity_type
export const createAnchor = async (label: string, entityType: string, description: string, strength?: number): Promise<{ data: any, error: any }> => {
  const client = getSupabase();

  // Add user_id for authenticated insert
  const userId = await getCurrentUserId();
  if (!userId) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await client.from('knowledge_nodes').insert({
    label,
    entity_type: entityType,
    description: description || null,
    is_anchor: true,
    anchor_strength: strength || null,
    anchor_created_at: new Date().toISOString(),
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
    .or('is_anchor.is.null,is_anchor.eq.false')
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

/**
 * Search knowledge_sources by title using ILIKE.
 * Used by the RAG pipeline to find sources that match a user's query.
 */
export const searchSourcesByTitle = async (query: string): Promise<{ id: string; title: string; source_type: string; created_at: string }[]> => {
  const client = getSupabase();
  if (!query || query.trim().length < 2) return [];

  // Split query into words and search for each
  const words = query.trim().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return [];

  // Build OR conditions for each word against title
  const conditions = words.map(w => `title.ilike.%${w.replace(/[^a-zA-Z0-9]/g, '')}%`).join(',');

  const { data, error } = await client
    .from('knowledge_sources')
    .select('id, title, source_type, created_at')
    .or(conditions)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('searchSourcesByTitle failed:', error);
    return [];
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

// --- COMPREHENSIVE ANCHOR SCAN FUNCTIONS ---

/**
 * Count all non-anchor nodes in the database
 * Used to determine whether to show quick/comprehensive scan choice
 */
export const countAllNodes = async (): Promise<number> => {
  const client = getSupabase();

  const { count, error } = await client
    .from('knowledge_nodes')
    .select('*', { count: 'exact', head: true })
    .or('is_anchor.is.null,is_anchor.eq.false');

  if (error) {
    console.error("Failed to count nodes:", error);
    return 0;
  }
  return count || 0;
};

/**
 * Extended semantic search for comprehensive anchor scanning
 * Returns up to 500 nodes with their similarity scores
 */
export const semanticSearchNodesExtended = async (
  embedding: number[],
  matchThreshold: number = 0.4,
  matchCount: number = 500
): Promise<{
  id: string;
  label: string;
  entity_type: string;
  description?: string;
  similarity: number;
}[]> => {
  const client = getSupabase();

  if (!embedding || embedding.length === 0) {
    console.warn("semanticSearchNodesExtended called with empty embedding");
    return [];
  }

  // Use the existing match_nodes RPC function with higher limit
  const { data, error } = await client.rpc('match_nodes', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Extended semantic search failed:", error.message);
    return [];
  }

  console.log(`Extended semantic search returned ${data?.length || 0} results (threshold: ${matchThreshold})`);
  return data || [];
};

// --- USER PROFILE MANAGEMENT ---

export interface UserProfile {
  id?: string;
  user_id?: string;
  professional_context: {
    role?: string;
    industry?: string;
    current_projects?: string;
  };
  personal_interests: {
    topics?: string;
    learning_goals?: string;
  };
  processing_preferences: {
    insight_depth?: 'detailed' | 'high-level' | '';
    relationship_focus?: 'broad' | 'deep' | '';
  };
  created_at?: string;
  updated_at?: string;
}

export const fetchUserProfile = async (): Promise<UserProfile | null> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // Profile doesn't exist, create it
    if (error.code === 'PGRST116') {
      const { data: newProfile, error: insertError } = await client
        .from('user_profiles')
        .insert({
          user_id: userId,
          professional_context: {},
          personal_interests: {},
          processing_preferences: {}
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to create user profile:", insertError);
        return null;
      }
      return newProfile as UserProfile;
    }
    console.error("Failed to fetch user profile:", error);
    return null;
  }

  return data as UserProfile;
};

export const updateUserProfile = async (updates: Partial<UserProfile>): Promise<{ error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { error: new Error('Not authenticated') };
  }

  const { error } = await client
    .from('user_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  return { error };
};

// ============================================
// YOUTUBE CHANNEL AUTO-INGESTION
// ============================================

// --- YOUTUBE CHANNELS ---

export const fetchYouTubeChannels = async (): Promise<YouTubeChannel[]> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await client
    .from('youtube_channels')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch YouTube channels:', error);
    return [];
  }
  return data || [];
};

export const fetchYouTubeChannel = async (channelId: string): Promise<YouTubeChannel | null> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('youtube_channels')
    .select('*')
    .eq('id', channelId)
    .single();

  if (error) {
    console.error('Failed to fetch YouTube channel:', error);
    return null;
  }
  return data;
};

export const addYouTubeChannel = async (
  channelData: {
    channel_id: string;
    channel_name: string;
    channel_url: string;
    thumbnail_url?: string | null;
    description?: string | null;
    subscriber_count?: number | null;
  } & Partial<AddChannelFormData>
): Promise<{ data: YouTubeChannel | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await client
    .from('youtube_channels')
    .insert({
      user_id: userId,
      channel_id: channelData.channel_id,
      channel_name: channelData.channel_name,
      channel_url: channelData.channel_url,
      thumbnail_url: channelData.thumbnail_url || null,
      description: channelData.description || null,
      subscriber_count: channelData.subscriber_count || null,
      auto_ingest: channelData.auto_ingest ?? true,
      extraction_mode: channelData.extraction_mode || 'comprehensive',
      anchor_emphasis: channelData.anchor_emphasis || 'standard',
      linked_anchor_ids: channelData.linked_anchor_ids || [],
      custom_instructions: channelData.custom_instructions || null,
      is_active: true,
      total_videos_ingested: 0,
    })
    .select()
    .single();

  return { data, error };
};

export const updateYouTubeChannel = async (
  channelId: string,
  updates: UpdateChannelFormData
): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('youtube_channels')
    .update(updates)
    .eq('id', channelId);

  return { error };
};

export const deleteYouTubeChannel = async (channelId: string): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('youtube_channels')
    .delete()
    .eq('id', channelId);

  return { error };
};

export const updateChannelLastChecked = async (channelId: string): Promise<void> => {
  const client = getSupabase();

  await client
    .from('youtube_channels')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', channelId);
};

export const incrementChannelVideosIngested = async (channelId: string): Promise<void> => {
  const client = getSupabase();

  // Fetch current count and increment
  const { data } = await client
    .from('youtube_channels')
    .select('total_videos_ingested')
    .eq('id', channelId)
    .single();

  if (data) {
    await client
      .from('youtube_channels')
      .update({ total_videos_ingested: (data.total_videos_ingested || 0) + 1 })
      .eq('id', channelId);
  }
};

// --- YOUTUBE QUEUE ---

export const fetchYouTubeQueue = async (filters?: QueueFilters): Promise<YouTubeQueueItem[]> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = client
    .from('youtube_ingestion_queue')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters?.channel_id) {
    query = query.eq('channel_id', filters.channel_id);
  }

  if (filters?.since) {
    query = query.gte('created_at', filters.since);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch YouTube queue:', error);
    return [];
  }
  return data || [];
};

export const fetchPendingQueueItems = async (limit: number = 5): Promise<YouTubeQueueItem[]> => {
  const client = getSupabase();

  const { data, error } = await client
    .from('youtube_ingestion_queue')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch pending queue items:', error);
    return [];
  }
  return data || [];
};

export const addToYouTubeQueue = async (
  items: Array<{
    channel_id: string;
    video_id: string;
    video_title?: string | null;
    video_url: string;
    thumbnail_url?: string | null;
    published_at?: string | null;
    priority?: number;
  }>
): Promise<{ error: any; insertedCount: number }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { error: new Error('Not authenticated'), insertedCount: 0 };
  }

  const rowsWithUserId = items.map(item => ({
    user_id: userId,
    channel_id: item.channel_id,
    video_id: item.video_id,
    video_title: item.video_title || null,
    video_url: item.video_url,
    thumbnail_url: item.thumbnail_url || null,
    published_at: item.published_at || null,
    priority: item.priority || 5,
    status: 'pending' as const,
    retry_count: 0,
    max_retries: 3,
  }));

  // Use upsert with ON CONFLICT DO NOTHING to handle duplicates
  const { data, error } = await client
    .from('youtube_ingestion_queue')
    .upsert(rowsWithUserId, {
      onConflict: 'user_id,video_id',
      ignoreDuplicates: true,
    })
    .select();

  return { error, insertedCount: data?.length || 0 };
};

export const updateQueueItemStatus = async (
  itemId: string,
  status: YouTubeQueueStatus,
  additionalUpdates?: Partial<YouTubeQueueItem>
): Promise<{ error: any }> => {
  const client = getSupabase();

  const updates: Record<string, any> = { status, ...additionalUpdates };

  // Set timestamps based on status
  if (status === 'fetching_transcript' || status === 'extracting') {
    updates.started_at = updates.started_at || new Date().toISOString();
  } else if (status === 'completed' || status === 'failed' || status === 'skipped') {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await client
    .from('youtube_ingestion_queue')
    .update(updates)
    .eq('id', itemId);

  return { error };
};

export const retryQueueItem = async (itemId: string): Promise<{ error: any }> => {
  const client = getSupabase();

  // Fetch current retry count
  const { data: item } = await client
    .from('youtube_ingestion_queue')
    .select('retry_count, max_retries')
    .eq('id', itemId)
    .single();

  if (!item) {
    return { error: new Error('Queue item not found') };
  }

  const { error } = await client
    .from('youtube_ingestion_queue')
    .update({
      status: 'pending',
      retry_count: (item.retry_count || 0) + 1,
      error_message: null,
      started_at: null,
      completed_at: null,
    })
    .eq('id', itemId);

  return { error };
};

export const deleteQueueItem = async (itemId: string): Promise<{ error: any }> => {
  const client = getSupabase();

  const { error } = await client
    .from('youtube_ingestion_queue')
    .delete()
    .eq('id', itemId);

  return { error };
};

export const checkVideoInQueue = async (videoId: string): Promise<boolean> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { data } = await client
    .from('youtube_ingestion_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('video_id', videoId)
    .single();

  return !!data;
};

// --- YOUTUBE SETTINGS ---

export const fetchYouTubeSettings = async (): Promise<YouTubeSettings | null> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await client
    .from('youtube_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // Settings don't exist yet, create default
    if (error.code === 'PGRST116') {
      const { data: newSettings, error: insertError } = await client
        .from('youtube_settings')
        .insert({
          user_id: userId,
          apify_api_key: null,
          default_auto_ingest: true,
          default_extraction_mode: 'comprehensive',
          default_anchor_emphasis: 'standard',
          max_concurrent_extractions: 3,
          max_videos_per_channel: 50,
          daily_video_limit: 20,
          videos_ingested_today: 0,
          daily_limit_reset_at: null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create YouTube settings:', insertError);
        return null;
      }
      return newSettings;
    }
    console.error('Failed to fetch YouTube settings:', error);
    return null;
  }

  return data;
};

export const updateYouTubeSettings = async (
  updates: UpdateSettingsFormData
): Promise<{ error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { error: new Error('Not authenticated') };
  }

  const { error } = await client
    .from('youtube_settings')
    .update(updates)
    .eq('user_id', userId);

  return { error };
};

export const incrementVideosIngestedToday = async (): Promise<void> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return;

  // Fetch current count
  const { data: settings } = await client
    .from('youtube_settings')
    .select('videos_ingested_today, daily_limit_reset_at')
    .eq('user_id', userId)
    .single();

  if (!settings) return;

  // Check if we need to reset the daily counter
  const today = new Date().toISOString().split('T')[0];
  const lastReset = settings.daily_limit_reset_at?.split('T')[0];

  if (lastReset !== today) {
    // Reset counter for new day
    await client
      .from('youtube_settings')
      .update({
        videos_ingested_today: 1,
        daily_limit_reset_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    // Increment counter
    await client
      .from('youtube_settings')
      .update({
        videos_ingested_today: (settings.videos_ingested_today || 0) + 1,
      })
      .eq('user_id', userId);
  }
};

export const checkDailyLimitReached = async (): Promise<boolean> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return true; // Block if not authenticated

  const { data: settings } = await client
    .from('youtube_settings')
    .select('videos_ingested_today, daily_video_limit, daily_limit_reset_at')
    .eq('user_id', userId)
    .single();

  if (!settings) return true;

  // Check if we need to reset the daily counter
  const today = new Date().toISOString().split('T')[0];
  const lastReset = settings.daily_limit_reset_at?.split('T')[0];

  if (lastReset !== today) {
    // New day, reset hasn't happened yet
    return false;
  }

  return (settings.videos_ingested_today || 0) >= (settings.daily_video_limit || 20);
};

// --- YOUTUBE STATS ---

export const fetchYouTubeStats = async (): Promise<YouTubeStats> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  const defaultStats: YouTubeStats = {
    total_channels: 0,
    active_channels: 0,
    pending_videos: 0,
    processing_videos: 0,
    completed_today: 0,
    failed_today: 0,
    daily_limit: 20,
    videos_today: 0,
  };

  if (!userId) return defaultStats;

  // Fetch channel counts
  const { data: channels } = await client
    .from('youtube_channels')
    .select('id, is_active')
    .eq('user_id', userId);

  // Fetch queue stats
  const today = new Date().toISOString().split('T')[0];

  const { data: queueItems } = await client
    .from('youtube_ingestion_queue')
    .select('status, completed_at')
    .eq('user_id', userId);

  // Fetch settings for daily limit
  const settings = await fetchYouTubeSettings();

  const stats: YouTubeStats = {
    total_channels: channels?.length || 0,
    active_channels: channels?.filter(c => c.is_active).length || 0,
    pending_videos: queueItems?.filter(q => q.status === 'pending').length || 0,
    processing_videos: queueItems?.filter(q =>
      q.status === 'fetching_transcript' || q.status === 'extracting'
    ).length || 0,
    completed_today: queueItems?.filter(q =>
      q.status === 'completed' && q.completed_at?.startsWith(today)
    ).length || 0,
    failed_today: queueItems?.filter(q =>
      q.status === 'failed' && q.completed_at?.startsWith(today)
    ).length || 0,
    daily_limit: settings?.daily_video_limit || 20,
    videos_today: settings?.videos_ingested_today || 0,
  };

  return stats;
};

// --- YOUTUBE ANCHOR HELPERS ---

// Fetch user's anchors for dropdown selection (re-export for convenience)
export const fetchUserAnchors = fetchAnchors;

// --- SOURCE CHUNK FUNCTIONS (Graph RAG v2) ---

/**
 * Insert source chunks into the database
 */
export const insertSourceChunks = async (
  chunks: { source_id: string; chunk_index: number; content: string; token_count: number; embedding: number[]; user_id: string }[]
): Promise<{ error: any }> => {
  const client = getSupabase();
  if (chunks.length === 0) return { error: null };
  const { error } = await client.from('knowledge_source_chunks').insert(chunks);
  return { error };
};

/**
 * Semantic search over source chunks, optionally filtered by source IDs
 */
export const searchSourceChunks = async (
  embedding: number[],
  matchThreshold: number = 0.3,
  matchCount: number = 5,
  filterSourceIds?: string[]
): Promise<{ id: string; source_id: string; chunk_index: number; content: string; similarity: number }[]> => {
  const client = getSupabase();
  const { data, error } = await client.rpc('match_chunks', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_source_ids: filterSourceIds || null,
  });
  if (error) {
    console.error('Chunk search failed:', error);
    return [];
  }
  return data || [];
};

/**
 * Check if a source already has chunks
 */
export const sourceHasChunks = async (sourceId: string): Promise<boolean> => {
  const client = getSupabase();
  const { count, error } = await client
    .from('knowledge_source_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId);
  return (count || 0) > 0;
};

// --- HYBRID SEARCH & DEEP TRAVERSAL (Graph RAG v2) ---

/**
 * Hybrid search: run keyword + semantic in parallel, merge and deduplicate.
 * Returns nodes ranked by combined score.
 */
export const hybridSearchNodes = async (
  keywords: string[],
  queryEmbedding: number[],
  options: {
    keywordLimit?: number;
    semanticLimit?: number;
    semanticThreshold?: number;
    boostSourceIds?: string[];
  } = {}
): Promise<{ id: string; label: string; entity_type: string; description?: string; source_id?: string; score: number }[]> => {
  const {
    keywordLimit = 20,
    semanticLimit = 20,
    semanticThreshold = 0.3,
    boostSourceIds = [],
  } = options;
  const boostSet = new Set(boostSourceIds);

  const [keywordResults, semanticResults] = await Promise.all([
    fetchRelevantNodes(keywords),
    queryEmbedding.length > 0
      ? semanticSearchNodes(queryEmbedding, semanticThreshold, semanticLimit)
      : Promise.resolve([]),
  ]);

  const nodeMap = new Map<string, { id: string; label: string; entity_type: string; description?: string; source_id?: string; score: number }>();

  // Keyword results: score based on position
  keywordResults.slice(0, keywordLimit).forEach((node: any, index: number) => {
    const keywordScore = 1 - (index / keywordResults.length) * 0.5;
    nodeMap.set(node.id, { ...node, score: keywordScore });
  });

  // Semantic results: score based on similarity
  semanticResults.forEach((node: any) => {
    const semanticScore = node.similarity || 0.5;
    const existing = nodeMap.get(node.id);
    if (existing) {
      existing.score = Math.min(existing.score + semanticScore * 0.5, 1.5);
    } else {
      nodeMap.set(node.id, {
        id: node.id,
        label: node.label,
        entity_type: node.entity_type,
        description: node.description,
        score: semanticScore,
      });
    }
  });

  // Boost nodes from matched sources
  if (boostSet.size > 0) {
    for (const node of nodeMap.values()) {
      if (node.source_id && boostSet.has(node.source_id)) {
        node.score *= 1.5;
      }
    }
  }

  return Array.from(nodeMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
};

/**
 * Multi-hop graph traversal from seed nodes.
 * Returns full subgraph with node details, edge context, and human-readable paths.
 */
export const deepGraphTraversal = async (
  seedNodeIds: string[],
  maxHops: number = 2,
  maxNodesPerHop: number = 5
): Promise<{
  nodes: { id: string; label: string; entity_type: string; description?: string; source_id?: string }[];
  edges: { source_node_id: string; target_node_id: string; relation_type: string; evidence?: string }[];
  paths: string[];
}> => {
  const client = getSupabase();
  const visitedNodeIds = new Set<string>(seedNodeIds);
  const allEdges: any[] = [];
  const allNodes = new Map<string, any>();
  const paths: string[] = [];

  // Fetch seed node details
  const { data: seedNodes } = await client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description, source_id')
    .in('id', seedNodeIds);

  (seedNodes || []).forEach(n => allNodes.set(n.id, n));

  let currentFrontier = [...seedNodeIds];

  for (let hop = 0; hop < maxHops; hop++) {
    if (currentFrontier.length === 0) break;

    // Fetch edges connected to the current frontier using .in() filters
    const { data: edges, error } = await client
      .from('knowledge_edges')
      .select('source_node_id, target_node_id, relation_type, evidence')
      .or(`source_node_id.in.(${currentFrontier.join(',')}),target_node_id.in.(${currentFrontier.join(',')})`);

    if (error || !edges) break;

    // Identify new neighbor IDs
    const newNeighborIds = new Set<string>();
    for (const edge of edges) {
      allEdges.push(edge);
      const neighborId = visitedNodeIds.has(edge.source_node_id)
        ? edge.target_node_id
        : edge.source_node_id;
      if (!visitedNodeIds.has(neighborId)) {
        newNeighborIds.add(neighborId);
        visitedNodeIds.add(neighborId);
      }
    }

    // Fetch neighbor node details (limited per hop)
    const neighborsToFetch = Array.from(newNeighborIds).slice(0, maxNodesPerHop * currentFrontier.length);
    if (neighborsToFetch.length > 0) {
      const { data: neighborNodes } = await client
        .from('knowledge_nodes')
        .select('id, label, entity_type, description, source_id')
        .in('id', neighborsToFetch);
      (neighborNodes || []).forEach(n => allNodes.set(n.id, n));
    }

    currentFrontier = neighborsToFetch;
  }

  // Build human-readable paths from edges
  const uniqueEdges = new Map<string, any>();
  for (const edge of allEdges) {
    const key = `${edge.source_node_id}-${edge.relation_type}-${edge.target_node_id}`;
    if (!uniqueEdges.has(key)) {
      uniqueEdges.set(key, edge);
      const sourceNode = allNodes.get(edge.source_node_id);
      const targetNode = allNodes.get(edge.target_node_id);
      if (sourceNode && targetNode) {
        paths.push(
          `"${sourceNode.label}" (${sourceNode.entity_type}) -[${edge.relation_type}]-> "${targetNode.label}" (${targetNode.entity_type})${edge.evidence ? ` | Evidence: ${edge.evidence}` : ''}`
        );
      }
    }
  }

  return {
    nodes: Array.from(allNodes.values()),
    edges: Array.from(uniqueEdges.values()),
    paths,
  };
};