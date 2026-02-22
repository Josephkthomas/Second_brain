// Vercel API endpoint for Universal Ingest queue management
// PATCH /api/ingest/queue - Retry or skip queue items
// DELETE /api/ingest/queue - Remove completed/failed/skipped items

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    // PATCH - Retry or skip queue item
    if (req.method === 'PATCH') {
      const { id, action } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      if (!action || !['retry', 'skip'].includes(action)) {
        return res.status(400).json({ error: 'Action must be "retry" or "skip"' });
      }

      // Verify item belongs to this user
      const { data: existingItem, error: fetchError } = await supabase
        .from('ingest_queue')
        .select('id, status, retry_count, max_retries')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      if (action === 'retry') {
        if (existingItem.status !== 'failed') {
          return res.status(400).json({ error: 'Can only retry failed items' });
        }

        if (existingItem.retry_count >= existingItem.max_retries) {
          return res.status(400).json({ error: 'Maximum retries exceeded' });
        }

        const { data, error } = await supabase
          .from('ingest_queue')
          .update({
            status: 'pending',
            error_message: null,
            retry_count: existingItem.retry_count + 1,
            started_at: null,
            completed_at: null,
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ item: data });
      }

      if (action === 'skip') {
        if (existingItem.status !== 'pending') {
          return res.status(400).json({ error: 'Can only skip pending items' });
        }

        const { data, error } = await supabase
          .from('ingest_queue')
          .update({
            status: 'skipped',
            completed_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ item: data });
      }
    }

    // DELETE - Remove queue item
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      const { data: existingItem, error: fetchError } = await supabase
        .from('ingest_queue')
        .select('id, status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      const deletableStatuses = ['completed', 'failed', 'skipped'];
      if (!deletableStatuses.includes(existingItem.status)) {
        return res.status(400).json({
          error: 'Can only delete completed, failed, or skipped items'
        });
      }

      const { error } = await supabase
        .from('ingest_queue')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Ingest Queue] API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
