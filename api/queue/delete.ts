// Vercel API endpoint for cascade queue item deletion
// POST /api/queue/delete
// Handles: force-cancel processing items, cascade delete nodes/edges/source, remove queue entry

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifyAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid authorization header' };
  }

  const jwt = authHeader.slice(7);
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  return { user, error: null };
}

type QueueOrigin = 'youtube_queue' | 'ingest_queue' | 'knowledge_source';

const ORIGIN_TABLE: Record<QueueOrigin, string> = {
  youtube_queue: 'youtube_ingestion_queue',
  ingest_queue: 'ingest_queue',
  knowledge_source: 'knowledge_sources',
};

// Statuses considered "processing" for force-cancel
const PROCESSING_STATUSES: Record<string, string[]> = {
  youtube_ingestion_queue: ['fetching_transcript', 'extracting'],
  ingest_queue: ['extracting', 'cross_connecting', 'embedding'],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    const {
      item_id,
      origin,
      source_id,
      delete_nodes = true,
      force_cancel = false,
    } = req.body as {
      item_id: string;
      origin: QueueOrigin;
      source_id?: string | null;
      delete_nodes?: boolean;
      force_cancel?: boolean;
    };

    if (!item_id || !origin) {
      return res.status(400).json({ error: 'item_id and origin are required' });
    }

    if (!ORIGIN_TABLE[origin]) {
      return res.status(400).json({ error: 'Invalid origin' });
    }

    const tableName = ORIGIN_TABLE[origin];
    const deletedCounts = { nodes: 0, edges: 0, chunks: 0 };

    // Step 1: Force-cancel if item is currently processing
    if (force_cancel && origin !== 'knowledge_source') {
      const processingList = PROCESSING_STATUSES[tableName] || [];

      // Check current status
      const { data: currentItem } = await supabase
        .from(tableName)
        .select('status')
        .eq('id', item_id)
        .eq('user_id', user.id)
        .single();

      if (currentItem && processingList.includes(currentItem.status)) {
        await supabase
          .from(tableName)
          .update({
            status: 'failed',
            error_message: 'Force cancelled by user',
            completed_at: new Date().toISOString(),
          })
          .eq('id', item_id)
          .eq('user_id', user.id);

        // Brief pause for in-flight processing to see the cancellation
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Step 2: Cascade delete nodes, edges, chunks, and source if requested
    if (delete_nodes && source_id) {
      // Count nodes before deleting (for response)
      const { count: nodeCount } = await supabase
        .from('knowledge_nodes')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', source_id)
        .eq('user_id', user.id);

      deletedCounts.nodes = nodeCount || 0;

      // Delete nodes (edges CASCADE automatically via FK)
      if (deletedCounts.nodes > 0) {
        await supabase
          .from('knowledge_nodes')
          .delete()
          .eq('source_id', source_id)
          .eq('user_id', user.id);
      }

      // Delete source chunks
      const { count: chunkCount } = await supabase
        .from('knowledge_source_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', source_id)
        .eq('user_id', user.id);

      deletedCounts.chunks = chunkCount || 0;

      if (deletedCounts.chunks > 0) {
        await supabase
          .from('knowledge_source_chunks')
          .delete()
          .eq('source_id', source_id)
          .eq('user_id', user.id);
      }

      // Delete the knowledge_source record
      await supabase
        .from('knowledge_sources')
        .delete()
        .eq('id', source_id)
        .eq('user_id', user.id);
    }

    // Step 3: Delete the queue entry (skip if origin is knowledge_source — already deleted above)
    if (origin !== 'knowledge_source') {
      await supabase
        .from(tableName)
        .delete()
        .eq('id', item_id)
        .eq('user_id', user.id);
    }

    return res.status(200).json({
      success: true,
      deleted: {
        queue_entry: true,
        nodes: deletedCounts.nodes,
        chunks: deletedCounts.chunks,
      },
    });
  } catch (err: any) {
    console.error('[queue/delete] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
