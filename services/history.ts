import { getSupabase, getCurrentUserId } from './supabase';

export interface HistoryItem {
  id: string;
  title: string;
  source_type: string;
  ingestion_method: string;
  status: 'completed' | 'pending' | 'processing' | 'extracting' | 'cross_connecting' | 'embedding' | 'failed' | 'skipped';
  nodes_created?: number;
  edges_created?: number;
  error_message?: string;
  created_at: string;
  source_url?: string;
}

export async function fetchHistory(limit: number = 100): Promise<HistoryItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = getSupabase();

  // Fetch completed items from knowledge_sources
  const { data: sources } = await supabase
    .from('knowledge_sources')
    .select('id, title, source_type, source_url, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Fetch all items from ingest_queue
  const { data: queued } = await supabase
    .from('ingest_queue')
    .select('id, title, source_type, status, nodes_created, edges_created, error_message, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Transform knowledge_sources into HistoryItems
  const sourceItems: HistoryItem[] = (sources || []).map(s => ({
    id: s.id,
    title: s.title,
    source_type: s.source_type,
    ingestion_method: s.metadata?.ingestion_method || 'manual',
    status: 'completed' as const,
    nodes_created: s.metadata?.nodes_created,
    edges_created: s.metadata?.edges_created,
    created_at: s.created_at,
    source_url: s.source_url,
  }));

  // Transform ingest_queue items — exclude completed ones that already appear in sources
  const queueItems: HistoryItem[] = (queued || []).map(q => ({
    id: q.id,
    title: q.title || 'Untitled',
    source_type: q.source_type,
    ingestion_method: q.metadata?.ingestion_method || 'api',
    status: q.status,
    nodes_created: q.nodes_created,
    edges_created: q.edges_created,
    error_message: q.error_message,
    created_at: q.created_at,
  }));

  // Merge: use queue items for non-completed, and sources for completed
  // Deduplicate by checking if a completed queue item has a matching source
  const completedQueueIds = new Set(
    queueItems.filter(q => q.status === 'completed').map(q => q.id)
  );
  const sourceIds = new Set(sourceItems.map(s => s.id));

  const merged = [
    ...sourceItems,
    ...queueItems.filter(q => {
      // Keep non-completed queue items always
      if (q.status !== 'completed') return true;
      // Keep completed queue items only if no matching source
      return !sourceIds.has(q.id);
    }),
  ];

  return merged
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
