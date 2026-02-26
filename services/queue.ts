// Unified Processing Queue Service
// Merges youtube_ingestion_queue, ingest_queue, and knowledge_sources
// into a single normalized view.

import { getSupabase, fetchAllRows } from './supabase';
import type { YouTubeQueueItem } from '../types/youtube';
import type { IngestQueueItem } from '../types/ingest';
import type {
  UnifiedQueueItem,
  SourceCategory,
  UnifiedStatus,
  ProcessingStage,
  QueueOrigin,
  DeleteOptions,
} from '../types/queue';

// ─── Stage Maps ───────────────────────────────────────────────

// Labels use past tense for completed steps, present for active
const YOUTUBE_STAGES_DONE = [
  'Video added',
  'Transcript extracted',
  'Transcript analysed',
  'Nodes & edges created',
  'Saved to knowledge graph',
];
const YOUTUBE_STAGES_ACTIVE = [
  'Video added',
  'Extracting transcript…',
  'Analysing transcript…',
  'Creating nodes & edges…',
  'Saving to knowledge graph…',
];

const INGEST_STAGES_DONE = [
  'Content received',
  'Knowledge extracted',
  'Cross-connections found',
  'Saved to knowledge graph',
];
const INGEST_STAGES_ACTIVE = [
  'Content received',
  'Extracting knowledge…',
  'Finding cross-connections…',
  'Saving to knowledge graph…',
];

const SOURCE_TYPE_STAGES: Record<string, string[]> = {
  YouTube: YOUTUBE_STAGES_DONE,
  Meeting: ['Transcript received', 'Transcript analysed', 'Nodes & edges created', 'Saved to knowledge graph'],
  Document: ['Document received', 'Content parsed', 'Nodes & edges created', 'Saved to knowledge graph'],
  Research: ['Research query received', 'Sources fetched', 'Nodes & edges created', 'Saved to knowledge graph'],
  Note: ['Note received', 'Content analysed', 'Nodes & edges created', 'Saved to knowledge graph'],
  API: INGEST_STAGES_DONE,
  Podcast: ['Episode received', 'Audio transcribed', 'Nodes & edges created', 'Saved to knowledge graph'],
  Email: ['Email received', 'Content analysed', 'Nodes & edges created', 'Saved to knowledge graph'],
  Chat: ['Chat received', 'Content analysed', 'Nodes & edges created', 'Saved to knowledge graph'],
  Article: ['Article received', 'Content analysed', 'Nodes & edges created', 'Saved to knowledge graph'],
};

// ─── Stage Builders ───────────────────────────────────────────

function buildYouTubeStages(item: YouTubeQueueItem): ProcessingStage[] {
  const step = (item.processing_step || '').toLowerCase();
  const done = YOUTUBE_STAGES_DONE;
  const active = YOUTUBE_STAGES_ACTIVE;

  // Helper: pick done label for completed steps, active label for in-progress
  const s = (i: number, st: ProcessingStage['status']): ProcessingStage => ({
    label: st === 'done' ? done[i] : st === 'active' ? active[i] : active[i],
    status: st,
  });

  if (item.status === 'pending') {
    return [s(0, 'done'), s(1, 'pending'), s(2, 'pending'), s(3, 'pending'), s(4, 'pending')];
  }

  if (item.status === 'fetching_transcript') {
    return [s(0, 'done'), s(1, 'active'), s(2, 'pending'), s(3, 'pending'), s(4, 'pending')];
  }

  if (item.status === 'extracting') {
    const hasCrossRef = step.includes('cross-referenc');
    const hasExtracted = step.includes('extracted');
    return [
      s(0, 'done'),
      s(1, 'done'),
      s(2, hasCrossRef || hasExtracted ? 'done' : 'active'),
      s(3, hasCrossRef ? 'done' : hasExtracted ? 'active' : 'pending'),
      s(4, hasCrossRef ? 'active' : 'pending'),
    ];
  }

  if (item.status === 'completed') {
    return done.map(label => ({ label, status: 'done' as const }));
  }

  // failed / skipped
  return [
    s(0, 'done'),
    { label: step ? done[1] : active[1], status: step ? 'done' : 'failed' },
    s(2, 'pending'),
    s(3, 'pending'),
    s(4, 'pending'),
  ];
}

function buildIngestStages(item: IngestQueueItem): ProcessingStage[] {
  const done = INGEST_STAGES_DONE;
  const active = INGEST_STAGES_ACTIVE;

  const statusToIndex: Record<string, number> = {
    pending: 0,
    extracting: 1,
    cross_connecting: 2,
    embedding: 3,
    completed: 4,
    failed: -1,
    skipped: -1,
  };

  const activeIdx = statusToIndex[item.status] ?? -1;

  if (item.status === 'completed') {
    return done.map(label => ({ label, status: 'done' as const }));
  }

  if (item.status === 'failed' || item.status === 'skipped') {
    return done.map((label, i) => ({
      label: i === 1 ? active[1] : label,
      status: (i === 0 ? 'done' : i === 1 ? 'failed' : 'pending') as ProcessingStage['status'],
    }));
  }

  return done.map((label, i) => {
    if (i < activeIdx) return { label, status: 'done' as const };
    if (i === activeIdx) return { label: active[i], status: (i === 0 ? 'done' : 'active') as ProcessingStage['status'] };
    return { label: active[i], status: 'pending' as const };
  });
}

function buildCompletedStages(sourceType: string): ProcessingStage[] {
  const stages = SOURCE_TYPE_STAGES[sourceType] || SOURCE_TYPE_STAGES['Note'];
  return stages.map(label => ({ label, status: 'done' as const }));
}

// ─── Status Mapping ───────────────────────────────────────────

function mapYouTubeStatus(status: string): UnifiedStatus {
  if (status === 'fetching_transcript' || status === 'extracting') return 'processing';
  if (status === 'pending') return 'pending';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'skipped') return 'skipped';
  return 'pending';
}

function mapIngestStatus(status: string): UnifiedStatus {
  if (status === 'extracting' || status === 'cross_connecting' || status === 'embedding') return 'processing';
  if (status === 'pending') return 'pending';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'skipped') return 'skipped';
  return 'pending';
}

// ─── Source Category Mapping ──────────────────────────────────

function mapSourceType(raw: string): SourceCategory {
  const map: Record<string, SourceCategory> = {
    youtube: 'YouTube',
    meeting: 'Meeting',
    document: 'Document',
    research: 'Research',
    note: 'Note',
    api: 'API',
    podcast: 'Podcast',
    email: 'Email',
    chat: 'Chat',
    article: 'Article',
  };
  return map[raw.toLowerCase()] || 'Note';
}

// ─── Normalization ────────────────────────────────────────────

function normalizeYouTubeItem(
  item: YouTubeQueueItem,
  nodeStats: Map<string, { nodeCount: number; edgeCount: number; topTypes: { type: string; count: number }[] }>
): UnifiedQueueItem {
  const stats = item.source_id ? nodeStats.get(item.source_id) : undefined;
  return {
    id: item.id,
    origin: 'youtube_queue',
    title: item.video_title || 'Untitled Video',
    sourceType: 'YouTube',
    sourceUrl: item.video_url,
    thumbnailUrl: item.thumbnail_url,
    status: mapYouTubeStatus(item.status),
    stages: buildYouTubeStages(item),
    errorMessage: item.error_message,
    sourceId: item.source_id,
    nodesCreated: item.nodes_created || stats?.nodeCount || 0,
    edgesCreated: item.edges_created || stats?.edgeCount || 0,
    topEntityTypes: stats?.topTypes || [],
    retryCount: item.retry_count,
    maxRetries: item.max_retries,
    canRetry: item.status === 'failed' && item.retry_count < item.max_retries,
    createdAt: item.created_at,
    completedAt: item.completed_at,
    metadata: {},
    youtubeChannelName: item.youtube_channels?.channel_name,
    youtubePlaylistName: item.youtube_playlists?.playlist_name,
    videoUrl: item.video_url,
  };
}

function normalizeIngestItem(
  item: IngestQueueItem,
  nodeStats: Map<string, { nodeCount: number; edgeCount: number; topTypes: { type: string; count: number }[] }>
): UnifiedQueueItem {
  const stats = item.source_id ? nodeStats.get(item.source_id) : undefined;
  return {
    id: item.id,
    origin: 'ingest_queue',
    title: item.title || 'Untitled',
    sourceType: mapSourceType(item.source_type || 'Note'),
    sourceUrl: item.source_url,
    thumbnailUrl: null,
    status: mapIngestStatus(item.status),
    stages: buildIngestStages(item),
    errorMessage: item.error_message,
    sourceId: item.source_id,
    nodesCreated: item.nodes_created || stats?.nodeCount || 0,
    edgesCreated: item.edges_created || stats?.edgeCount || 0,
    topEntityTypes: stats?.topTypes || [],
    retryCount: item.retry_count,
    maxRetries: item.max_retries,
    canRetry: item.status === 'failed' && item.retry_count < item.max_retries,
    createdAt: item.created_at,
    completedAt: item.completed_at,
    metadata: item.metadata || {},
  };
}

interface KnowledgeSourceRow {
  id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  metadata: any;
  created_at: string;
}

function normalizeKnowledgeSource(
  src: KnowledgeSourceRow,
  nodeStats: Map<string, { nodeCount: number; edgeCount: number; topTypes: { type: string; count: number }[] }>
): UnifiedQueueItem {
  const stats = nodeStats.get(src.id);
  const sourceType = mapSourceType(src.source_type || 'Note');
  return {
    id: src.id,
    origin: 'knowledge_source',
    title: src.title || 'Untitled',
    sourceType,
    sourceUrl: src.source_url,
    thumbnailUrl: src.metadata?.thumbnailUrl || null,
    status: 'completed',
    stages: buildCompletedStages(sourceType),
    errorMessage: null,
    sourceId: src.id,
    nodesCreated: stats?.nodeCount || 0,
    edgesCreated: stats?.edgeCount || 0,
    topEntityTypes: stats?.topTypes || [],
    retryCount: 0,
    maxRetries: 0,
    canRetry: false,
    createdAt: src.created_at,
    completedAt: src.created_at,
    metadata: src.metadata || {},
  };
}

// ─── Node Stats Aggregation ──────────────────────────────────

async function fetchNodeStats(): Promise<
  Map<string, { nodeCount: number; edgeCount: number; topTypes: { type: string; count: number }[] }>
> {
  const result = new Map<string, { nodeCount: number; edgeCount: number; topTypes: { type: string; count: number }[] }>();

  // Paginate through all rows to avoid Supabase's 1000-row cap
  const [nodesRes, edgesRes] = await Promise.all([
    fetchAllRows('knowledge_nodes', 'id, source_id, entity_type'),
    fetchAllRows('knowledge_edges', 'source_node_id, target_node_id'),
  ]);

  const nodes = nodesRes.data || [];
  const edges = edgesRes.data || [];

  // Node counts and entity type aggregation per source
  const nodeCountMap = new Map<string, number>();
  const nodeSourceMap = new Map<string, string>();
  const entityTypeMap = new Map<string, Map<string, number>>();

  for (const n of nodes) {
    if (!n.source_id) continue;
    nodeCountMap.set(n.source_id, (nodeCountMap.get(n.source_id) || 0) + 1);
    nodeSourceMap.set(n.id, n.source_id);

    if (!entityTypeMap.has(n.source_id)) entityTypeMap.set(n.source_id, new Map());
    const types = entityTypeMap.get(n.source_id)!;
    types.set(n.entity_type, (types.get(n.entity_type) || 0) + 1);
  }

  // Edge counts
  const edgeCountMap = new Map<string, number>();
  for (const e of edges) {
    const srcSource = nodeSourceMap.get(e.source_node_id);
    const tgtSource = nodeSourceMap.get(e.target_node_id);
    const attributed = new Set<string>();
    if (srcSource) attributed.add(srcSource);
    if (tgtSource) attributed.add(tgtSource);
    for (const sid of attributed) {
      edgeCountMap.set(sid, (edgeCountMap.get(sid) || 0) + 1);
    }
  }

  // Build result map
  const allSourceIds = new Set([...nodeCountMap.keys(), ...edgeCountMap.keys()]);
  for (const sid of allSourceIds) {
    const types = entityTypeMap.get(sid);
    const topTypes = types
      ? Array.from(types.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([type, count]) => ({ type, count }))
      : [];

    result.set(sid, {
      nodeCount: nodeCountMap.get(sid) || 0,
      edgeCount: edgeCountMap.get(sid) || 0,
      topTypes,
    });
  }

  return result;
}

// ─── Main Fetch ───────────────────────────────────────────────

export async function fetchUnifiedQueue(accessToken: string): Promise<UnifiedQueueItem[]> {
  const client = getSupabase();

  // Fetch all three data sources + node stats in parallel
  const [ytRes, ingestRes, sourcesRes, nodeStats] = await Promise.all([
    fetch('/api/youtube/queue?limit=200', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.json()).catch(() => ({ items: [] })),

    fetch('/api/ingest?limit=200', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.json()).catch(() => ({ items: [] })),

    client
      .from('knowledge_sources')
      .select('id, title, source_type, source_url, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(200),

    fetchNodeStats(),
  ]);

  const youtubeItems: YouTubeQueueItem[] = ytRes.items || [];
  const ingestItems: IngestQueueItem[] = ingestRes.items || [];
  const knowledgeSources: KnowledgeSourceRow[] = sourcesRes.data || [];

  // Deduplicate: build set of source_ids already in queues
  const queueSourceIds = new Set<string>();
  for (const item of youtubeItems) {
    if (item.source_id) queueSourceIds.add(item.source_id);
  }
  for (const item of ingestItems) {
    if (item.source_id) queueSourceIds.add(item.source_id);
  }

  // Filter knowledge_sources to only those NOT already represented
  const uniqueSources = knowledgeSources.filter(s => !queueSourceIds.has(s.id));

  // Normalize all items
  const normalized: UnifiedQueueItem[] = [
    ...youtubeItems.map(item => normalizeYouTubeItem(item, nodeStats)),
    ...ingestItems.map(item => normalizeIngestItem(item, nodeStats)),
    ...uniqueSources.map(src => normalizeKnowledgeSource(src, nodeStats)),
  ];

  // Sort by createdAt descending
  normalized.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return normalized;
}

// ─── Actions ──────────────────────────────────────────────────

export async function retryItem(accessToken: string, item: UnifiedQueueItem): Promise<boolean> {
  const endpoint = item.origin === 'youtube_queue' ? '/api/youtube/queue' : '/api/ingest/queue';

  const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id: item.id, action: 'retry' }),
  });

  return res.ok;
}

export async function deleteItem(
  accessToken: string,
  item: UnifiedQueueItem,
  options: DeleteOptions
): Promise<boolean> {
  const res = await fetch('/api/queue/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      item_id: item.id,
      origin: item.origin,
      source_id: item.sourceId,
      delete_nodes: options.deleteNodesAndEdges,
      force_cancel: options.forceCancel,
    }),
  });

  return res.ok;
}

export async function processQueue(accessToken: string): Promise<{ processed: number; remaining: number }> {
  const results = await Promise.all([
    fetch('/api/youtube/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ process_all: true }),
    }).then(r => r.json()).catch(() => ({ processed: 0, remaining: 0 })),

    fetch('/api/ingest/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ process_all: true }),
    }).then(r => r.json()).catch(() => ({ processed: 0, remaining: 0 })),
  ]);

  return {
    processed: (results[0].processed || 0) + (results[1].processed || 0),
    remaining: (results[0].remaining || 0) + (results[1].remaining || 0),
  };
}
