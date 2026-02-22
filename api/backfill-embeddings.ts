// Vercel API endpoint for retroactive embedding backfill
// POST /api/backfill-embeddings
// Headers: Authorization: Bearer <jwt> OR Bearer <CRON_SECRET>
// Body (optional): { limit?: number } — max nodes to process (default 500)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getGenAI();
  try {
    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
    });
    return result.embedding?.values || [];
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: accept user JWT or cron secret
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabase();
  let userFilter: string | null = null;

  // Check if cron secret
  if (token === CRON_SECRET) {
    // Process all users
    userFilter = null;
  } else {
    // Verify as user JWT — scope to their nodes only
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    userFilter = user.id;
  }

  const limit = Math.min(req.body?.limit || 500, 1000);
  const BATCH_SIZE = 20;

  const progress = {
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    remaining: 0,
    failedNodes: [] as string[],
  };

  try {
    // Count total missing
    let countQuery = supabase
      .from('knowledge_nodes')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);
    if (userFilter) countQuery = countQuery.eq('user_id', userFilter);

    const { count } = await countQuery;
    progress.total = count || 0;

    if (progress.total === 0) {
      return res.status(200).json({
        ...progress,
        message: 'All nodes already have embeddings',
      });
    }

    // Process in batches
    let processedCount = 0;

    while (processedCount < limit) {
      let batchQuery = supabase
        .from('knowledge_nodes')
        .select('id, label, description')
        .is('embedding', null)
        .limit(BATCH_SIZE);
      if (userFilter) batchQuery = batchQuery.eq('user_id', userFilter);

      const { data: nodes, error: fetchError } = await batchQuery;

      if (fetchError || !nodes || nodes.length === 0) break;

      for (const node of nodes) {
        const text = `${node.label}: ${node.description || ''}`;
        const embedding = await generateEmbedding(text);

        if (embedding.length > 0) {
          const { error: updateError } = await supabase
            .from('knowledge_nodes')
            .update({ embedding })
            .eq('id', node.id);

          if (updateError) {
            progress.failed++;
            progress.failedNodes.push(node.id);
          } else {
            progress.successful++;
          }
        } else {
          progress.failed++;
          progress.failedNodes.push(node.id);
        }

        progress.processed++;
        processedCount++;

        // Rate limit protection: 100ms between calls
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Pause between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Get remaining count
    let remainQuery = supabase
      .from('knowledge_nodes')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);
    if (userFilter) remainQuery = remainQuery.eq('user_id', userFilter);

    const { count: remaining } = await remainQuery;
    progress.remaining = remaining || 0;

    return res.status(200).json(progress);
  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Backfill failed',
      progress,
    });
  }
}
