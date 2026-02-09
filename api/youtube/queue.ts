// Vercel API endpoint for YouTube ingestion queue
// GET /api/youtube/queue - List queue items (optionally filtered by channel)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to verify JWT and get user
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    // GET - List queue items
    if (req.method === 'GET') {
      const { channel_id, status, limit = '50' } = req.query;

      let query = supabase
        .from('youtube_ingestion_queue')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit as string, 10));

      // Filter by channel if provided
      if (channel_id && typeof channel_id === 'string') {
        query = query.eq('channel_id', channel_id);
      }

      // Filter by status if provided
      if (status && typeof status === 'string') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({ items: data || [] });
    }

    // PATCH - Update queue item (retry or skip)
    if (req.method === 'PATCH') {
      const { id, action } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      if (!action || !['retry', 'skip'].includes(action)) {
        return res.status(400).json({ error: 'Action must be "retry" or "skip"' });
      }

      // Verify the item belongs to this user
      const { data: existingItem, error: fetchError } = await supabase
        .from('youtube_ingestion_queue')
        .select('id, status, retry_count, max_retries')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      if (action === 'retry') {
        // Can only retry failed items that haven't exceeded max retries
        if (existingItem.status !== 'failed') {
          return res.status(400).json({ error: 'Can only retry failed items' });
        }

        if (existingItem.retry_count >= existingItem.max_retries) {
          return res.status(400).json({ error: 'Maximum retries exceeded' });
        }

        // Reset to pending for reprocessing
        const { data, error } = await supabase
          .from('youtube_ingestion_queue')
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
        // Can only skip pending items
        if (existingItem.status !== 'pending') {
          return res.status(400).json({ error: 'Can only skip pending items' });
        }

        const { data, error } = await supabase
          .from('youtube_ingestion_queue')
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

      // Verify the item belongs to this user and is deletable
      const { data: existingItem, error: fetchError } = await supabase
        .from('youtube_ingestion_queue')
        .select('id, status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      // Only allow deleting completed, failed, or skipped items
      const deletableStatuses = ['completed', 'failed', 'skipped'];
      if (!deletableStatuses.includes(existingItem.status)) {
        return res.status(400).json({
          error: 'Can only delete completed, failed, or skipped items'
        });
      }

      const { error } = await supabase
        .from('youtube_ingestion_queue')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('YouTube queue API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
